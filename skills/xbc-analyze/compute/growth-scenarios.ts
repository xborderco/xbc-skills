// Growth simulation: which thresholds get crossed at +20/30/100% (or custom).
// Reads:  computed/threshold-exposure.json, assets/cost-model.json
// Writes: computed/growth-scenarios.json
//   npx tsx compute/growth-scenarios.ts [--rates=0.2,0.3,1.0]
import { readAsset, writeComputed } from "./_shared";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPUTED_DIR } from "./_shared";

const exposurePath = join(COMPUTED_DIR, "threshold-exposure.json");
if (!existsSync(exposurePath)) {
  console.error(
    "missing computed/threshold-exposure.json — run compute/threshold-exposure.ts first (SKILL.md step 2)."
  );
  process.exit(1);
}
interface ExposureRow {
  jurisdiction: string;
  revenue_in_local_currency: number;
  threshold_amount: number;
  tx_count?: number;
  tx_threshold?: number;
  tx_threshold_logic?: "and" | "or";
  status: string;
  registered_in_stripe_tax: boolean;
}
const exposure = JSON.parse(readFileSync(exposurePath, "utf8")) as {
  thresholds_as_of: string;
  jurisdictions: ExposureRow[];
};
const costModel = readAsset<{
  diy_compliance: {
    registration_one_time_usd: [number, number];
    annual_filing_usd: [number, number];
    note: string;
  };
}>("cost-model.json");

const ratesArg = process.argv
  .find((a) => a.startsWith("--rates="))
  ?.slice("--rates=".length);
const rates = (ratesArg ?? "0.2,0.3,1.0")
  .split(",")
  .map(Number)
  .filter((n) => Number.isFinite(n) && n > 0);

function statusAt(row: ExposureRow, factor: number): string {
  if (row.threshold_amount === 0) {
    return row.revenue_in_local_currency > 0
      ? "registration_likely_required"
      : "clear";
  }
  const amountPct =
    ((row.revenue_in_local_currency * factor) / row.threshold_amount) * 100;
  const txPct =
    row.tx_threshold && row.tx_count !== undefined
      ? ((row.tx_count * factor) / row.tx_threshold) * 100
      : null;
  // "and": BOTH legs must be met -> min; "or" (default): either leg -> max.
  const pct =
    txPct === null
      ? amountPct
      : (row.tx_threshold_logic ?? "or") === "and"
        ? Math.min(amountPct, txPct)
        : Math.max(amountPct, txPct);
  return pct >= 100 ? "crossed" : pct >= 75 ? "approaching" : "clear";
}

const baselineRequired = exposure.jurisdictions.filter(
  (r) => r.status === "crossed" || r.status === "registration_likely_required"
);

const [regLo, regHi] = costModel.diy_compliance.registration_one_time_usd;
const [fileLo, fileHi] = costModel.diy_compliance.annual_filing_usd;

const scenarios = rates.map((rate) => {
  const factor = 1 + rate;
  const required = exposure.jurisdictions.filter((r) => {
    const s = statusAt(r, factor);
    return s === "crossed" || s === "registration_likely_required";
  });
  const newlyCrossed = required.filter(
    (r) => !baselineRequired.some((b) => b.jurisdiction === r.jurisdiction)
  );
  const n = required.length;
  // One-time registration costs apply only to registrations the merchant
  // does NOT already hold; annual filings apply to all required.
  const nNew = required.filter((r) => !r.registered_in_stripe_tax).length;
  return {
    growth_rate_pct: Math.round(rate * 100),
    registrations_required: n,
    registrations_not_yet_held: nNew,
    newly_crossed: newlyCrossed.map((r) => r.jurisdiction),
    approaching: exposure.jurisdictions
      .filter((r) => statusAt(r, factor) === "approaching")
      .map((r) => r.jurisdiction),
    diy_cost_estimate_usd: {
      registration_one_time: [nNew * regLo, nNew * regHi],
      annual_filing: [n * fileLo, n * fileHi],
      note: costModel.diy_compliance.note,
    },
  };
});

const path = writeComputed("growth-scenarios.json", {
  status: "ok",
  thresholds_as_of: exposure.thresholds_as_of,
  baseline: {
    registrations_required: baselineRequired.length,
    registrations_not_yet_held: baselineRequired.filter(
      (r) => !r.registered_in_stripe_tax
    ).length,
    jurisdictions: baselineRequired.map((r) => r.jurisdiction),
    diy_cost_estimate_usd: {
      registration_one_time: [
        baselineRequired.filter((r) => !r.registered_in_stripe_tax).length *
          regLo,
        baselineRequired.filter((r) => !r.registered_in_stripe_tax).length *
          regHi,
      ],
      annual_filing: [
        baselineRequired.length * fileLo,
        baselineRequired.length * fileHi,
      ],
    },
  },
  scenarios,
  methodology_notes: [
    "Scenarios scale every jurisdiction's trailing revenue and transaction count uniformly by the growth rate — a deliberate simplification (mix shifts are not modeled).",
    "DIY cost figures are sourced ranges, not quotes.",
  ],
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
