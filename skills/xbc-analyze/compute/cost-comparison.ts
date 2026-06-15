// Provider cost comparison on the merchant's actual mix.
// Reads:  raw/charges.json, raw/balance-transactions.json (optional),
//         raw/tax-settings.json (optional), assets/cost-model.json, assets/fx-rates.json
// Writes: computed/cost-comparison.json
//   npx tsx compute/cost-comparison.ts [--home=US]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMPUTED_DIR,
  convert,
  readAsset,
  readRaw,
  readRawOptional,
  toMajor,
  writeComputed,
  type ChargeRecord,
  type FxRates,
} from "./_shared";

interface ProviderModel {
  name: string;
  kind: "mor" | "raw_stripe" | "xbc";
  pct_of_total: number;
  fixed_per_tx_usd: number;
  intl_surcharge_pct?: number;
  subscription_surcharge_pct?: number;
  min_per_tx_usd?: number;
  variable_addons?: {
    label: string;
    pct_of_total: number;
    applies: "always" | "non_us_home";
  }[];
  notes: string[];
}

const rawCharges = readRaw<{
  _meta?: { key_mode?: string };
  window: { from: string; to: string };
  charges: ChargeRecord[];
}>("charges.json");
const { charges, window } = rawCharges;
const keyMode = rawCharges._meta?.key_mode ?? "unknown";
const balance = readRawOptional<{
  transactions: { type: string; fee: number; currency: string }[];
}>("balance-transactions.json");
const taxSettings = readRawOptional<{ head_office_country: string | null }>(
  "tax-settings.json"
);
const model = readAsset<{
  _meta: { as_of: string; status: string };
  xbc_assumption: string;
  providers: ProviderModel[];
  polar_footnote: string;
  diy_compliance: {
    registration_one_time_usd: [number, number];
    annual_filing_usd: [number, number];
    note: string;
  };
  structure_facts: Record<string, string[]>;
}>("cost-model.json");
const fx = readAsset<FxRates>("fx-rates.json");

const homeArg = process.argv
  .find((a) => a.startsWith("--home="))
  ?.slice("--home=".length);
const home = homeArg ?? taxSettings?.head_office_country ?? null;

// --- merchant mix --------------------------------------------------------
let grossUsd = 0;
let intlUsd = 0;
let subUsd = 0;
let invoiceBacked = 0;
const perChargeUsd: { usd: number }[] = [];
for (const ch of charges) {
  const usd = convert(
    toMajor(ch.amount - ch.amount_refunded, ch.currency),
    ch.currency,
    "USD",
    fx
  );
  if (usd === null) continue;
  grossUsd += usd;
  perChargeUsd.push({ usd });
  if (home && ch.card_country && ch.card_country !== home) intlUsd += usd;
  if (ch.invoice) {
    subUsd += usd;
    invoiceBacked += 1;
  }
}
const tx = perChargeUsd.length;
const intlShare = grossUsd > 0 ? intlUsd / grossUsd : 0;
// charge.invoice is absent on newer Stripe API versions. If NO charge carries
// it, subscription share is UNAVAILABLE — reported as null, never as 0
// (finding 2: a silent 0% drops two providers' subscription surcharges).
const subShareKnown = invoiceBacked > 0;
const subShare = subShareKnown && grossUsd > 0 ? subUsd / grossUsd : null;

// Actual Stripe fees paid — only trustworthy in LIVE mode (test mode simulates
// US pricing regardless of the account's real country pricing — finding 1).
let actualStripeFeesUsd: number | null = null;
let feeFxMissing = false;
if (balance && keyMode === "live") {
  let sum = 0;
  for (const t of balance.transactions) {
    if (t.type !== "charge" && t.type !== "payment") continue;
    const usd = convert(toMajor(t.fee, t.currency), t.currency, "USD", fx);
    if (usd === null) {
      feeFxMissing = true;
      continue;
    }
    sum += usd;
  }
  actualStripeFeesUsd = sum;
}

// --- DIY compliance add-on ------------------------------------------------
// The DIY column's fee figure is NOT its total cost: every required
// registration means real-world registration + filing spend (many countries
// effectively require a local agent/fiscal representative for non-residents).
// Pull the required-registration count from the threshold analysis if it ran.
interface DiyCompliance {
  registrations_required: number;
  one_time_usd_range: [number, number];
  annual_filing_usd_range: [number, number];
  note: string;
}
let diyCompliance: DiyCompliance | null = null;
const exposurePath = join(COMPUTED_DIR, "threshold-exposure.json");
if (existsSync(exposurePath)) {
  const exp = JSON.parse(readFileSync(exposurePath, "utf8")) as {
    jurisdictions: {
      status: string;
      registered_in_stripe_tax: boolean;
    }[];
  };
  const req = exp.jurisdictions.filter(
    (r) =>
      r.status === "crossed" || r.status === "registration_likely_required"
  );
  const nNew = req.filter((r) => !r.registered_in_stripe_tax).length;
  const [regLo, regHi] = model.diy_compliance.registration_one_time_usd;
  const [fileLo, fileHi] = model.diy_compliance.annual_filing_usd;
  diyCompliance = {
    registrations_required: req.length,
    one_time_usd_range: [nNew * regLo, nNew * regHi],
    annual_filing_usd_range: [req.length * fileLo, req.length * fileHi],
    note: model.diy_compliance.note,
  };
}

// --- provider costs ------------------------------------------------------
const round = (n: number) => Math.round(n * 100) / 100;

const rows = model.providers.map((p) => {
  let cost = p.pct_of_total * grossUsd + p.fixed_per_tx_usd * tx;
  if (p.min_per_tx_usd) {
    // Per-transaction minimum: recompute as sum of max(pct*amount, min).
    cost =
      perChargeUsd.reduce(
        (acc, c) => acc + Math.max(p.pct_of_total * c.usd, p.min_per_tx_usd!),
        0
      ) +
      p.fixed_per_tx_usd * tx;
  }
  if (p.intl_surcharge_pct) cost += p.intl_surcharge_pct * intlUsd;
  if (p.subscription_surcharge_pct && subShare !== null)
    cost += p.subscription_surcharge_pct * subUsd;

  let basis =
    p.kind === "mor" ? "documented_rates_floor" : "modeled_estimate";
  const notes = [...p.notes];

  // raw_stripe and xbc ride on the merchant's own Stripe account: use actual
  // fees paid when available (live mode only).
  if (
    (p.kind === "raw_stripe" || p.kind === "xbc") &&
    actualStripeFeesUsd !== null
  ) {
    basis = "actual_fees";
    const billingAddon =
      subShare !== null ? 0.007 * subUsd : 0; // Billing is invoiced monthly, never in per-charge balance txs (finding 8)
    if (p.kind === "raw_stripe") {
      cost = actualStripeFeesUsd + 0.005 * grossUsd + billingAddon;
      notes.push(
        "Uses your ACTUAL Stripe fees from balance transactions, plus 0.5% Stripe Tax calculation and 0.7% Billing on subscription volume (Billing never appears in per-charge fees)."
      );
    } else {
      const xbcFee = perChargeUsd.reduce(
        (acc, c) =>
          acc + Math.max(p.pct_of_total * c.usd, p.min_per_tx_usd ?? 0),
        0
      );
      cost = xbcFee + actualStripeFeesUsd + billingAddon;
      notes.push(
        "XBC fee plus your ACTUAL Stripe fees from balance transactions (plus 0.7% Billing on subscription volume)."
      );
    }
  }
  if (p.subscription_surcharge_pct && subShare === null) {
    notes.push(
      "Subscription surcharge NOT included — subscription share unavailable on this Stripe API version."
    );
  }

  if (p.kind === "raw_stripe") {
    notes.push(
      diyCompliance
        ? `FEES ONLY — DIY's real total adds compliance: ${diyCompliance.registrations_required} registration(s) required, $${diyCompliance.annual_filing_usd_range[0]}–${diyCompliance.annual_filing_usd_range[1]}/yr filings plus $${diyCompliance.one_time_usd_range[0]}–${diyCompliance.one_time_usd_range[1]} one-time. Never present this row as 'cheapest' without that.`
        : "FEES ONLY — compliance costs (registrations, filings, local agents) NOT included; run the tax exposure analysis for the full DIY picture."
    );
  }

  // MoR columns are RANGES: documented floor -> plus documented-but-variable
  // fees (payout FX margins, non-US payout fees). Floors alone make MoRs look
  // artificially close to all-in columns.
  let costHigh = cost;
  for (const a of p.variable_addons ?? []) {
    if (a.applies === "non_us_home" && (!home || home === "US")) continue;
    costHigh += a.pct_of_total * grossUsd;
    notes.push(`Range high includes: ${a.label}.`);
  }

  return {
    provider: p.name,
    kind: p.kind,
    basis,
    cost_usd_low: round(cost),
    cost_usd_high: round(costHigh),
    pct_of_gross_low: grossUsd > 0 ? round((cost / grossUsd) * 100) : 0,
    pct_of_gross_high: grossUsd > 0 ? round((costHigh / grossUsd) * 100) : 0,
    ...(p.kind === "raw_stripe" && {
      diy_compliance_addon: diyCompliance ?? "not_computed",
    }),
    notes,
  };
});

rows.sort((a, b) => a.cost_usd_low - b.cost_usd_low);

// --- assumptions & warnings ----------------------------------------------
const windowDays = Math.round(
  (new Date(window.to).getTime() - new Date(window.from).getTime()) / 86400000
);
const warnings: string[] = [];
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: simulated fees use US pricing and test cards are always US-issued — fee totals and international share are artifacts. Actual-fees basis disabled; all providers shown as modeled estimates. Re-run with a live-mode restricted key for real numbers."
  );
}
if (feeFxMissing) {
  warnings.push(
    "Some balance-transaction fees were skipped (missing FX rate) — actual-fees figures are a partial sum."
  );
}
if (grossUsd < 1000) {
  warnings.push(
    `Gross revenue in the window is only $${round(grossUsd)} — far too small for cost percentages to mean anything (fixed per-transaction fees dominate at this scale). Treat the table as illustrative of fee STRUCTURE only, not of what a real merchant would pay.`
  );
}
if (windowDays < 350 || windowDays > 380) {
  warnings.push(
    `Figures cover a ${windowDays}-day window, NOT a calendar year — 'annual cost' labels do not apply; do not annualize without saying so.`
  );
}

const path = writeComputed("cost-comparison.json", {
  status: "ok",
  key_mode: keyMode,
  cost_model_as_of: model._meta.as_of,
  cost_model_status: model._meta.status,
  xbc_assumption: model.xbc_assumption,
  polar_footnote: model.polar_footnote,
  window: { ...window, days: windowDays },
  merchant_mix: {
    gross_revenue_usd: round(grossUsd),
    tx_count: tx,
    avg_tx_usd: tx > 0 ? round(grossUsd / tx) : 0,
    home_country: home,
    international_share_pct: round(intlShare * 100),
    subscription_share_pct: subShare !== null ? round(subShare * 100) : null,
    actual_stripe_fees_usd:
      actualStripeFeesUsd !== null ? round(actualStripeFeesUsd) : null,
  },
  ...(warnings.length > 0 && { warnings }),
  assumptions: [
    "Charge amounts are treated as tax-inclusive totals (MoR percentage fees are documented to apply to tax-inclusive amounts).",
    `International share derived from card issuer country vs home country (${home ?? "unknown — pass --home=XX"}). This is Stripe's own international-fee basis and intentionally differs from the report's customer-country breakdown (billing-address-first).`,
    subShare !== null
      ? "Subscription share derived from invoice-backed charges."
      : "Subscription share UNAVAILABLE (charge.invoice absent on this Stripe API version) — subscription surcharges for Lemon Squeezy and Stripe Billing are NOT included; real DIY/LS costs are higher for subscription merchants.",
    "BASIS PER ROW: 'documented_rates_floor' = vendor's published rates; 'actual_fees' = your real Stripe fees; 'modeled_estimate' = published-rate model. MoR rows are RANGES — low is the published floor, high adds documented-but-variable fees (payout FX margins, non-US payout fees). Even range-high EXCLUDES per-incident fees ($15 disputes/SWIFT) and Paddle's undocumented FX spread (community-reported 7-8% effective for international sellers).",
    "Lemon Squeezy's +1.5% international surcharge basis for non-US merchants is UNVERIFIED (modeled against merchant home country).",
    "FX via bundled indicative rates; provider volume discounts not modeled (all vendors: 'contact sales').",
    "This comparison is structure-and-cost, not cost-only: see structure_facts.",
  ],
  providers: rows,
  structure_facts: model.structure_facts,
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
