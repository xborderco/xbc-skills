// Regenerate assets/thresholds.json from Stripe Tax's per-jurisdiction docs.
//
// MAINTAINER TOOL — NOT part of the skill's runtime. Compute scripts never
// touch the network (see compute/_shared.ts); thresholds ship as a reviewed,
// committed asset so two merchants analysed a week apart get the same answer.
// Run this yourself, read the diff, then commit.
//
//   npx tsx tools/refresh-thresholds.ts            # uses the local page cache
//   npx tsx tools/refresh-thresholds.ts --refresh  # re-fetch every page
//   npx tsx tools/refresh-thresholds.ts --out /tmp/thresholds.json
//
// Hand-authored corrections live in tools/threshold-overrides.json and are
// merged LAST, so a bad upstream value can always be corrected in one place
// without forking this script.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  field,
  fieldLink,
  parseThresholdField,
  parseUsBody,
  type Lookback,
  type ParsedThreshold,
} from "./parse";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(SKILL_ROOT, "tools", ".cache", "stripe-tax");
const DOCS = "https://docs.stripe.com/tax/supported-countries";

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const OUT = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : join(SKILL_ROOT, "assets", "thresholds.json");

interface ThresholdRow {
  jurisdiction: string;
  code: string;
  level: "country" | "country_group" | "us_state";
  state?: string;
  currency: string;
  amount: number;
  tx_threshold?: number;
  tx_threshold_logic?: "and" | "or";
  tx_threshold_exclusive?: boolean;
  amount_exclusive?: boolean;
  lookback: Lookback;
  /** True where the jurisdiction levies no tax of this kind at all, so sales
   *  volume can never create an obligation. Distinct from a zero threshold. */
  no_tax?: boolean;
  /** True when the amount could not be parsed at all. Such a row must never be
   *  scored: amount 0 would read as "liable from the first sale", which is the
   *  opposite of "we do not know". Compute reports these as insufficient_data. */
  unscorable?: boolean;
  /** Which sales count toward the threshold — "B2C sales of digital products"
   *  means reverse-charge B2B sales do NOT, which the exposure model must
   *  respect before it flags a B2B-heavy merchant. */
  included_transactions?: string;
  tax_type?: string;
  note?: string;
  needs_review?: boolean;
  review_reasons?: string[];
  raw_threshold?: string;
  source_url: string;
  stripe_doc_url: string;
  as_of: string;
}

interface Overrides {
  _comment?: string;
  as_of: string;
  patch: Record<string, Partial<ThresholdRow>>;
  add: ThresholdRow[];
  drop: string[];
}

// --- fetching ----------------------------------------------------------

async function page(url: string, cacheKey: string): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `${cacheKey}.md`);
  if (!REFRESH && existsSync(path)) return readFileSync(path, "utf8");
  const res = await fetch(url, { headers: { "user-agent": "xbc-analyze-threshold-refresh" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = await res.text();
  writeFileSync(path, body);
  await new Promise((r) => setTimeout(r, 120)); // be a polite client
  return body;
}

// --- jurisdiction discovery --------------------------------------------

interface Target {
  region: string;
  slug: string;
  param: string;
  /** ISO 3166-1 alpha-2, taken from Stripe's own index table. */
  iso2?: string;
}

/** US slugs carry no ISO code in the index, so map them here. */
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district-of-columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new-hampshire": "NH", "new-jersey": "NJ",
  "new-mexico": "NM", "new-york": "NY", "north-carolina": "NC",
  "north-dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "puerto-rico": "PR", "rhode-island": "RI",
  "south-carolina": "SC", "south-dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west-virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const TITLE_CASE = (slug: string): string =>
  slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

async function discover(): Promise<Target[]> {
  const world = await page(`${DOCS}.md`, "index-world");
  const us = await page(`${DOCS}/united-states.md`, "index-us");
  const seen = new Set<string>();
  const targets: Target[] = [];

  // The index table links each ISO code to its region page. The link path
  // OMITS the /collect-tax segment for most regions — following it verbatim
  // lands on a generic regional overview with no threshold on it at all. That
  // is the trap: rebuild the URL rather than trusting the href.
  const table = /\|\s*\[([A-Z]{2})\]\(https:\/\/docs\.stripe\.com\/tax\/supported-countries\/([a-z-]+)(?:\/collect-tax)?\.md\?(tax-jurisdiction-[a-z-]+)=([a-z-]+)\)/g;
  for (const m of world.matchAll(table)) {
    const [, iso2, region, param, slug] = m;
    if (region === "united-states" || seen.has(`${region}/${slug}`)) continue;
    seen.add(`${region}/${slug}`);
    targets.push({ region, slug, param, iso2 });
  }

  const usLinks = /\(https:\/\/docs\.stripe\.com\/tax\/supported-countries\/united-states\/collect-tax\.md\?(tax-jurisdiction-united-states)=([a-z-]+)\)/g;
  for (const m of us.matchAll(usLinks)) {
    const [, param, slug] = m;
    if (seen.has(`united-states/${slug}`)) continue;
    seen.add(`united-states/${slug}`);
    targets.push({ region: "united-states", slug, param });
  }
  return targets;
}

// --- row assembly ------------------------------------------------------

function buildRow(t: Target, body: string, asOf: string): ThresholdRow | null {
  const stripeDocUrl = `${DOCS}/${t.region}/collect-tax?${t.param}=${t.slug}`;
  const raw = field(body, "Registration threshold", "Threshold");
  const isUs = t.region === "united-states";
  const state = isUs ? US_STATES[t.slug] : undefined;
  if (isUs && !state) {
    console.error(`  ! unknown US slug "${t.slug}" — add it to US_STATES`);
    return null;
  }
  const code = isUs ? `US-${state}` : t.iso2;
  if (!code) {
    console.error(`  ! no ISO code for ${t.region}/${t.slug}`);
    return null;
  }

  const parsed: ParsedThreshold = raw
    ? parseThresholdField(raw)
    : { amount: 0, currency: null, lookback: null, confident: false, reasons: ["no threshold field on the page"] };

  // US pages state the period and the exceed/meet-or-exceed distinction only in
  // prose, so the body always wins over the summary field for those fields.
  const merged = { ...parsed, ...(isUs ? parseUsBody(body) : {}) };
  // The threshold field routinely omits the period; for US rows the body prose
  // supplies it. Only complain if BOTH came up empty — otherwise every state
  // lands in the review pile and the genuinely broken rows get lost in it.
  const reasons = parsed.reasons.filter(
    (r) => !(merged.lookback && r.startsWith("no measurement period"))
  );
  if (!merged.lookback) reasons.push("no measurement period found in the field or the body");

  // A zero-threshold jurisdiction has no amount to compare against, so it has
  // no currency of its own to report in. Revenue there is shown in USD, and
  // compute flags it via local_currency_is_derived.
  const currency = merged.currency ?? (isUs || merged.amount === 0 ? "USD" : null);
  if (!currency) reasons.push("no currency resolved");

  const included = field(
    body,
    "Transactions included in [obligations monitoring](https://docs.stripe.com/tax/monitoring.md)",
    "Included transactions"
  );

  return {
    jurisdiction: isUs ? `US — ${TITLE_CASE(t.slug)}` : TITLE_CASE(t.slug),
    code,
    level: isUs ? "us_state" : "country",
    ...(state && { state }),
    currency: currency ?? "USD",
    amount: merged.amount,
    ...(merged.tx_threshold !== undefined && { tx_threshold: merged.tx_threshold }),
    ...(merged.tx_threshold_logic && { tx_threshold_logic: merged.tx_threshold_logic }),
    ...(merged.tx_threshold_exclusive && { tx_threshold_exclusive: true }),
    ...(merged.amount_exclusive && { amount_exclusive: true }),
    lookback: merged.lookback ?? "rolling_12m",
    ...(raw && !/^1 transaction\b/i.test(raw) && !/^n\/a\b/i.test(raw) && merged.amount === 0 && { unscorable: true }),
    ...(included && { included_transactions: included.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") }),
    ...(field(body, "Tax type") && { tax_type: field(body, "Tax type") as string }),
    ...(reasons.length > 0 && { needs_review: true, review_reasons: reasons }),
    ...(raw && { raw_threshold: raw }),
    source_url:
      fieldLink(body, "Official resources", "Registration resources") ?? stripeDocUrl,
    stripe_doc_url: stripeDocUrl,
    as_of: asOf,
  };
}

// --- main --------------------------------------------------------------

const asOf = new Date().toISOString().slice(0, 7);
const targets = await discover();
console.log(`discovered ${targets.length} jurisdictions`);

const rows: ThresholdRow[] = [];
for (const t of targets) {
  const url = `${DOCS}/${t.region}/collect-tax.md?${t.param}=${t.slug}`;
  const body = await page(url, `${t.region}__${t.slug}`);
  const row = buildRow(t, body, asOf);
  if (row) rows.push(row);
}

const overridesPath = join(SKILL_ROOT, "tools", "threshold-overrides.json");
const overrides: Overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
const dropped = new Set(overrides.drop);
let patched = 0;
const final = rows
  .filter((r) => !dropped.has(r.code))
  .map((r) => {
    const patch = overrides.patch[r.code];
    if (!patch) return r;
    patched += 1;
    // The flag is cleared ONLY by an explicit "needs_review": false. Clearing it
    // just because SOME field was patched let a note-only override silence a
    // flag about the amount.
    const merged = { ...r, ...patch } as ThresholdRow;
    if (patch.needs_review === false) {
      const { needs_review, review_reasons, ...cleared } = merged;
      return cleared as ThresholdRow;
    }
    return merged;
  });
final.push(...overrides.add);
final.sort((a, b) => a.level.localeCompare(b.level) || a.code.localeCompare(b.code));

const review = final.filter((r) => r.needs_review);
const missingFx = new Set(
  final
    .filter((r) => r.amount > 0)
    .map((r) => r.currency)
    .filter((c) => {
      const fx = JSON.parse(readFileSync(join(SKILL_ROOT, "assets", "fx-rates.json"), "utf8"));
      return !(c in fx.units_per_usd);
    })
);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _meta: {
        as_of: asOf,
        generated_at: new Date().toISOString(),
        generated_by: "tools/refresh-thresholds.ts",
        generated_from: `${DOCS} (Stripe Tax documentation)`,
        status:
          review.length > 0
            ? `GENERATED — ${final.length} jurisdictions, ${review.length} flagged needs_review and NOT yet through authoring review. Verify flagged rows before any prospect use.`
            : `GENERATED — ${final.length} jurisdictions, all rows reviewed.`,
        scope_note:
          "Registration thresholds for non-established (cross-border) sellers, as monitored by Stripe Tax. US rows are post-Wayfair economic nexus; digital/SaaS taxability varies and is noted per row, not modelled.",
        source_note:
          "Amounts and measurement periods are Stripe's published values, which is what a merchant sees in their own Stripe Tax 'Needs attention' tab. Each row also links the underlying tax authority in source_url.",
      },
      jurisdictions: final,
    },
    null,
    2
  ) + "\n"
);

console.log(`\nwrote ${final.length} jurisdictions -> ${OUT}`);
console.log(`  patched by overrides: ${patched}   added by hand: ${overrides.add.length}   dropped: ${dropped.size}`);
if (missingFx.size > 0) {
  console.log(`\n  MISSING FX RATES (add to assets/fx-rates.json or these rows cannot be scored):`);
  console.log(`    ${[...missingFx].sort().join(", ")}`);
}
if (review.length > 0) {
  console.log(`\n  NEEDS REVIEW (${review.length}):`);
  for (const r of review) {
    console.log(`    ${r.code.padEnd(7)} ${r.raw_threshold ?? "(no threshold field)"}`);
    for (const reason of r.review_reasons ?? []) console.log(`            - ${reason}`);
  }
}
