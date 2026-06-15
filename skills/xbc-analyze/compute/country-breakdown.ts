// Revenue by country/currency with data-quality tiers.
// Reads:  raw/charges.json, raw/customers.json, assets/fx-rates.json
// Writes: computed/country-breakdown.json
//   npx tsx compute/country-breakdown.ts
import {
  buildCustomerCountryMap,
  convert,
  netMajor,
  readAsset,
  readRaw,
  resolveCountry,
  writeComputed,
  type ChargeRecord,
  type CustomerRecord,
  type FxRates,
  type Tier,
} from "./_shared";

const rawCharges = readRaw<{
  _meta?: { key_mode?: string };
  window: { from: string; to: string };
  charges: ChargeRecord[];
}>("charges.json");
const { charges, window } = rawCharges;
const keyMode = rawCharges._meta?.key_mode ?? "unknown";
const { customers } = readRaw<{ customers: CustomerRecord[] }>(
  "customers.json"
);
const fx = readAsset<FxRates>("fx-rates.json");

const customerCountries = buildCustomerCountryMap(customers);

interface CountryRow {
  revenue_usd: number;
  tx_count: number;
  by_currency: Record<string, number>;
}
const byCountry: Record<string, CountryRow> = {};
const usStates: Record<string, { revenue_usd: number; tx_count: number }> = {};
const tierCounts: Record<Tier, number> = {
  billing_address: 0,
  card_issuer: 0,
  customer_address: 0,
  unresolved: 0,
};
const unknownCurrencies = new Set<string>();
let totalUsd = 0;
let excludedForFx = 0;

for (const ch of charges) {
  const { country, state, tier } = resolveCountry(ch, customerCountries);
  tierCounts[tier]++;
  const net = netMajor(ch);
  const usd = convert(net, ch.currency, "USD", fx);
  if (usd === null) {
    unknownCurrencies.add(ch.currency);
    excludedForFx += 1;
    continue;
  }
  totalUsd += usd;
  const key = country ?? "UNRESOLVED";
  byCountry[key] ??= { revenue_usd: 0, tx_count: 0, by_currency: {} };
  byCountry[key].revenue_usd += usd;
  byCountry[key].tx_count += 1;
  byCountry[key].by_currency[ch.currency] =
    (byCountry[key].by_currency[ch.currency] ?? 0) + net;
  if (country === "US" && state) {
    usStates[state] ??= { revenue_usd: 0, tx_count: 0 };
    usStates[state].revenue_usd += usd;
    usStates[state].tx_count += 1;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
const countries = Object.entries(byCountry)
  .map(([country, row]) => ({
    country,
    revenue_usd: round(row.revenue_usd),
    pct_of_revenue: totalUsd > 0 ? round((row.revenue_usd / totalUsd) * 100) : 0,
    tx_count: row.tx_count,
    by_currency: Object.fromEntries(
      Object.entries(row.by_currency).map(([c, v]) => [c, round(v)])
    ),
  }))
  .sort((a, b) => b.revenue_usd - a.revenue_usd);

const warnings: string[] = [];
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: test-mode cards are always US-issued — the card-issuer country fallback is meaningless and any US figures may be artifacts. Re-run with a live-mode restricted key for real numbers."
  );
}
if (unknownCurrencies.size > 0) {
  warnings.push(
    `No FX rate bundled for: ${[...unknownCurrencies].join(", ")} — ${excludedForFx} charges excluded from all totals.`
  );
}

const path = writeComputed("country-breakdown.json", {
  status: "ok",
  key_mode: keyMode,
  window,
  fx_as_of: fx._meta.as_of,
  total_revenue_usd: round(totalUsd),
  total_tx: charges.length - excludedForFx,
  excluded_for_missing_fx: excludedForFx,
  countries,
  us_states: Object.fromEntries(
    Object.entries(usStates)
      .sort(([, a], [, b]) => b.revenue_usd - a.revenue_usd)
      .map(([s, v]) => [
        s,
        { revenue_usd: round(v.revenue_usd), tx_count: v.tx_count },
      ])
  ),
  data_quality: {
    tiers: tierCounts,
    resolved_pct:
      charges.length > 0
        ? round(
            ((charges.length - tierCounts.unresolved) / charges.length) * 100
          )
        : 0,
    note: "Country resolved per charge via billing address, then card issuer country, then customer address — the same fallback order Stripe Tax uses.",
  },
  ...(warnings.length > 0 && { warnings }),
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
