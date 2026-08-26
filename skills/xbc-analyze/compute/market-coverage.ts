// The merchant's revenue by market, mapped against what XBorderCo covers.
// Refuses to produce a section while assets/coverage.json is unsigned — an
// unverified "covered today" is the one claim in the report a prospect can
// disprove from experience, so the section is omitted rather than guessed.
// Reads:  computed/country-breakdown.json, assets/coverage.json,
//         raw/tax-settings.json (optional)
// Writes: computed/market-coverage.json
//   npx tsx compute/market-coverage.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMPUTED_DIR,
  EU_MEMBERS,
  readAsset,
  readRawOptional,
  writeComputed,
} from "./_shared";

interface CoverageEntry {
  code: string;
  name?: string;
  expected?: string;
  note?: string;
}
interface Coverage {
  _meta: { as_of: string | null; status: string };
  covered_today: CoverageEntry[];
  roadmap: CoverageEntry[];
  not_planned: CoverageEntry[];
}

const coverage = readAsset<Coverage>("coverage.json");
const signed = coverage._meta.status.toLowerCase().startsWith("signed");

if (!signed) {
  const path = writeComputed("market-coverage.json", {
    status: "blocked",
    reason: "coverage_data_unsigned",
    detail: coverage._meta.status,
    instruction:
      "Omit the 'Which of your markets are covered' section from the report entirely. Do not describe XBorderCo's country coverage from any other source.",
  });
  console.log(
    JSON.stringify(
      {
        status: "blocked",
        reason: "assets/coverage.json is unsigned — coverage section omitted",
        written_to: path,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const breakdownPath = join(COMPUTED_DIR, "country-breakdown.json");
if (!existsSync(breakdownPath)) {
  console.error(
    `missing ${breakdownPath}\nRun compute/country-breakdown.ts first.`
  );
  process.exit(1);
}
const breakdown = JSON.parse(readFileSync(breakdownPath, "utf8")) as {
  total_revenue_usd: number;
  countries: { country: string; revenue_usd: number; pct_of_revenue: number }[];
};

const home =
  readRawOptional<{ head_office_country: string | null }>("tax-settings.json")
    ?.head_office_country ?? null;

const byCode = new Map<string, { status: string; entry: CoverageEntry }>();
for (const e of coverage.covered_today)
  byCode.set(e.code, { status: "covered_today", entry: e });
for (const e of coverage.roadmap)
  byCode.set(e.code, { status: "roadmap", entry: e });
for (const e of coverage.not_planned)
  byCode.set(e.code, { status: "not_planned", entry: e });

const total = breakdown.total_revenue_usd;
const round = (n: number) => Math.round(n * 100) / 100;

const markets = breakdown.countries
  .filter((c) => c.country !== "UNRESOLVED")
  .map((c) => {
    // The merchant's own country of establishment is always out of scope: their
    // domestic VAT/GST is their obligation, not something XBC takes on.
    if (home !== null && c.country === home) {
      return {
        country: c.country,
        revenue_usd: c.revenue_usd,
        pct_of_revenue: c.pct_of_revenue,
        coverage_status: "out_of_scope",
        note: "Your country of establishment — domestic VAT/GST is your own obligation and is not assessed by this analysis.",
      };
    }
    const hit = byCode.get(c.country);
    // EU coverage is recorded per member state, never as a bloc: a merchant
    // selling into an unenabled member state must not read "EU" as covered.
    const inEu = EU_MEMBERS.has(c.country);
    return {
      country: c.country,
      revenue_usd: c.revenue_usd,
      pct_of_revenue: c.pct_of_revenue,
      coverage_status: hit?.status ?? "not_listed",
      ...(inEu && { eu_member: true }),
      ...(hit?.entry.expected && { expected: hit.entry.expected }),
      ...(hit?.entry.note && { note: hit.entry.note }),
    };
  })
  .sort((a, b) => b.revenue_usd - a.revenue_usd);

const shareOf = (status: string) =>
  round(
    markets
      .filter((m) => m.coverage_status === status)
      .reduce((s, m) => s + m.revenue_usd, 0) / (total || 1) * 100
  );

const unresolved = breakdown.countries.find((c) => c.country === "UNRESOLVED");

const warnings: string[] = [];
const notListed = markets.filter((m) => m.coverage_status === "not_listed");
if (notListed.length > 0) {
  warnings.push(
    `${notListed.length} market(s) carrying ${shareOf("not_listed")}% of revenue do not appear in XBorderCo's coverage data at all (${notListed
      .map((m) => m.country)
      .join(", ")}). Treat these as not covered, not as covered.`
  );
}
if (unresolved && unresolved.revenue_usd > 0) {
  warnings.push(
    `${unresolved.pct_of_revenue}% of revenue could not be attributed to a country and is excluded from every share below.`
  );
}

const path = writeComputed("market-coverage.json", {
  status: "ok",
  coverage_as_of: coverage._meta.as_of,
  merchant_home_country: home,
  revenue_share_pct: {
    covered_today: shareOf("covered_today"),
    roadmap: shareOf("roadmap"),
    not_planned: shareOf("not_planned"),
    not_listed: shareOf("not_listed"),
    out_of_scope: shareOf("out_of_scope"),
  },
  markets,
  ...(warnings.length > 0 && { warnings }),
  methodology_notes: [
    "Shares are of country-attributed revenue in the analysis window. Revenue that could not be attributed to a country is excluded from every share.",
    "Coverage is recorded per country, never per bloc — an EU member state XBorderCo has not enabled is reported as not covered even though other EU states are.",
    "A market absent from the coverage data is reported as 'not_listed' and must be read as not covered.",
    "Roadmap dates are plans, not commitments.",
  ],
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
