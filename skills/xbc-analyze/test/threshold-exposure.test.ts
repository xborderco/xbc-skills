// Regression tests for compute/threshold-exposure.ts, run against a fixture
// directory via XBC_ANALYSIS_DIR. No network, no Stripe key.
//   npm test
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(SKILL_ROOT, "node_modules", ".bin", "tsx");

interface Charge {
  id: string;
  created: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  refunded: boolean;
  billing_country: string | null;
  billing_state: string | null;
  card_country: string | null;
  customer: string | null;
  invoice: string | null;
}

let seq = 0;
const charge = (country: string, amountMinor: number, created: string): Charge => ({
  id: `ch_${++seq}`,
  created,
  amount: amountMinor,
  amount_refunded: 0,
  currency: "GBP",
  refunded: false,
  billing_country: country,
  billing_state: null,
  card_country: country,
  customer: null,
  invoice: null,
});

interface Row {
  code: string;
  status: string;
  revenue_usd_equivalent: number;
  needs_review?: boolean;
  review_reasons?: string[];
  domestic?: boolean;
  measurement_window: { data_coverage_pct: number };
}
interface Output {
  merchant_home_country: string | null;
  summary: {
    actionable_unregistered: string[];
    at_risk_revenue_usd: number;
    domestic_revenue_usd: number;
    domestic_tx_count: number;
    unassessed_markets: { code: string }[];
  };
  warnings?: string[];
  jurisdictions: Row[];
}

function run(opts: {
  home: string | null;
  charges: Charge[];
  window: { from: string; to: string; trading_since?: string };
}): Output {
  const dir = mkdtempSync(join(tmpdir(), "xbc-test-"));
  mkdirSync(join(dir, "raw"), { recursive: true });
  const write = (name: string, data: unknown) =>
    writeFileSync(
      join(dir, "raw", name),
      JSON.stringify({ _meta: { key_mode: "live", source: "csv_import" }, ...(data as object) })
    );
  write("charges.json", { window: opts.window, charges: opts.charges });
  write("customers.json", { tax_ids_expanded: false, customers: [] });
  write("tax-registrations.json", { registrations_known: false, registrations: [] });
  write("tax-settings.json", {
    head_office_country: opts.home,
    default_tax_behavior: null,
    status: null,
  });
  execFileSync(TSX, [join(SKILL_ROOT, "compute", "threshold-exposure.ts")], {
    env: { ...process.env, XBC_ANALYSIS_DIR: dir },
    stdio: ["ignore", "ignore", "inherit"],
  });
  return JSON.parse(
    readFileSync(join(dir, "computed", "threshold-exposure.json"), "utf8")
  ) as Output;
}

const row = (out: Output, code: string): Row => {
  const r = out.jurisdictions.find((j) => j.code === code);
  assert.ok(r, `no row for ${code}`);
  return r;
};

// The case from the field: a UK-established business, 12 days old, with UK and
// overseas sales. Domestic UK sales must never trigger the non-established
// (NETP, first-sale) rule, and must never enter the at-risk total.
const WINDOW = { from: "2026-08-25T00:00:00.000Z", to: "2026-09-06T23:59:59.000Z" };
const ukMerchant = () => [
  charge("GB", 50_000, "2026-08-26T10:00:00Z"),
  charge("GB", 30_000, "2026-09-01T10:00:00Z"),
  charge("KR", 20_000, "2026-08-27T10:00:00Z"), // first-sale jurisdiction
  charge("AU", 10_000, "2026-08-28T10:00:00Z"), // annual threshold
];

test("domestic sales are out of scope for a home-country row", () => {
  const out = run({ home: "GB", charges: ukMerchant(), window: WINDOW });
  const gb = row(out, "GB");
  assert.equal(gb.status, "domestic_out_of_scope");
  assert.equal(gb.domestic, true);
  assert.ok(gb.revenue_usd_equivalent > 0, "domestic revenue is still shown");
  assert.ok(!out.summary.actionable_unregistered.includes(gb.code));
  assert.ok(
    !out.summary.actionable_unregistered.some((j) => /United Kingdom/.test(j)),
    "UK must not be actionable for a UK-established merchant"
  );
  assert.equal(out.summary.domestic_tx_count, 2);
  assert.ok(out.summary.domestic_revenue_usd > 0);
  assert.ok(
    !out.summary.unassessed_markets.some((m) => m.code === "GB"),
    "home country is not reported as unassessed either"
  );
});

test("at-risk revenue excludes domestic revenue but keeps genuine first-sale markets", () => {
  const out = run({ home: "GB", charges: ukMerchant(), window: WINDOW });
  const no = row(out, "KR");
  assert.equal(no.status, "registration_likely_required");
  assert.equal(out.summary.at_risk_revenue_usd, no.revenue_usd_equivalent);
  assert.ok(out.summary.at_risk_revenue_usd < row(out, "GB").revenue_usd_equivalent);
});

test("the same sales are flagged when the merchant is established elsewhere", () => {
  const out = run({ home: "IE", charges: ukMerchant(), window: WINDOW });
  const gb = row(out, "GB");
  assert.equal(gb.status, "registration_likely_required");
  assert.ok(out.summary.actionable_unregistered.some((j) => /United Kingdom/.test(j)));
  assert.equal(out.summary.domestic_tx_count, 0);
});

test("an unknown home country warns instead of silently scoring domestic sales", () => {
  const out = run({ home: null, charges: ukMerchant(), window: WINDOW });
  assert.ok(out.warnings?.some((w) => /country of establishment is not known/i.test(w)));
});

test("needs_review rows are never scored, even with revenue and a zero threshold", () => {
  const out = run({
    home: "GB",
    charges: [charge("CR", 10_000, "2026-08-26T10:00:00Z"), charge("TR", 999_999_900, "2026-08-27T10:00:00Z")],
    window: WINDOW,
  });
  for (const code of ["CR", "TR"]) {
    const r = row(out, code);
    assert.equal(r.status, "insufficient_data", `${code} must not be scored`);
    assert.equal(r.needs_review, true);
    assert.ok((r.review_reasons ?? []).length > 0, `${code} carries its review reasons`);
  }
  assert.equal(out.summary.actionable_unregistered.length, 0);
  assert.equal(out.summary.at_risk_revenue_usd, 0);
  assert.ok(out.warnings?.some((w) => /not passed review/.test(w)));
});

test("a complete history from a known trading start counts as full coverage", () => {
  const partial = run({ home: "GB", charges: ukMerchant(), window: WINDOW });
  assert.equal(partial.jurisdictions.find((j) => j.code === "AU")?.status, "insufficient_data");
  assert.ok(row(partial, "AU").measurement_window.data_coverage_pct < 10);

  const complete = run({
    home: "GB",
    charges: ukMerchant(),
    window: { ...WINDOW, trading_since: WINDOW.from },
  });
  const au = row(complete, "AU");
  assert.equal(au.measurement_window.data_coverage_pct, 100);
  assert.equal(au.status, "clear");
});
