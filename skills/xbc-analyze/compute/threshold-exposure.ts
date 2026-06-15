// Registration-threshold exposure per jurisdiction.
// Reads:  raw/charges.json, raw/customers.json, raw/tax-registrations.json (optional),
//         raw/tax-settings.json (optional), assets/thresholds.json, assets/fx-rates.json
// Writes: computed/threshold-exposure.json
//   npx tsx compute/threshold-exposure.ts
import {
  buildCustomerCountryMap,
  convert,
  EU_MEMBERS,
  netMajor,
  readAsset,
  readRaw,
  readRawOptional,
  resolveCountry,
  writeComputed,
  type ChargeRecord,
  type CustomerRecord,
  type FxRates,
} from "./_shared";

interface ThresholdRow {
  jurisdiction: string;
  code: string;
  level: "country" | "country_group" | "us_state";
  state?: string;
  currency: string;
  amount: number;
  tx_threshold?: number;
  tx_threshold_logic?: "and" | "or"; // default "or" (either leg triggers)
  lookback:
    | "calendar_year"
    | "rolling_12m"
    | "rolling_4q"
    | "base_period_2y"
    | "immediate";
  note?: string;
  source_url: string;
  as_of: string;
}

interface Registration {
  country: string;
  state?: string | null;
  type?: string | null;
  status: string;
}

const rawCharges = readRaw<{
  _meta?: { key_mode?: string };
  charges: ChargeRecord[];
}>("charges.json");
const charges = rawCharges.charges;
const keyMode = rawCharges._meta?.key_mode ?? "unknown";
const { customers } = readRaw<{ customers: CustomerRecord[] }>(
  "customers.json"
);
const registrations =
  readRawOptional<{ registrations: Registration[] }>("tax-registrations.json")
    ?.registrations ?? [];
const home =
  readRawOptional<{ head_office_country: string | null }>("tax-settings.json")
    ?.head_office_country ?? null;
const thresholds = readAsset<{
  _meta: { as_of: string; status: string };
  jurisdictions: ThresholdRow[];
}>("thresholds.json");
const fx = readAsset<FxRates>("fx-rates.json");

const customerCountries = buildCustomerCountryMap(customers);
const now = new Date();

function windowStart(lookback: ThresholdRow["lookback"]): Date {
  switch (lookback) {
    case "calendar_year":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "rolling_12m":
    case "rolling_4q": // approximated as trailing 12 months; noted in output
    case "base_period_2y": // JP base period approximated; noted in output
    case "immediate":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

const resolved = charges.map((ch) => ({
  ch,
  loc: resolveCountry(ch, customerCountries),
}));

// US revenue that resolved to country level only (no state) — this gap means
// state rows CANNOT honestly report "clear" (finding: silent false all-clear).
let usNoStateUsd = 0;
let usNoStateTx = 0;
for (const { ch, loc } of resolved) {
  if (loc.country === "US" && !loc.state) {
    usNoStateUsd += convert(netMajor(ch), ch.currency, "USD", fx) ?? 0;
    usNoStateTx += 1;
  }
}

const activeRegs = registrations.filter((r) => r.status === "active");
const OSS_TYPES = new Set(["oss_union", "oss_non_union", "ioss"]);

// EU scheme depends on where the merchant is established:
// - EU-established  -> Union OSS: EUR 10,000 micro-threshold on CROSS-BORDER
//   B2C within the EU (home-country/domestic sales excluded — domestic VAT is
//   a separate, out-of-scope obligation).
// - Non-EU-established -> non-Union OSS: no threshold, liability from first sale.
const homeIsEu = home !== null && EU_MEMBERS.has(home);

const rows = thresholds.jurisdictions.map((t) => {
  const isEuGroup = t.level === "country_group" && t.code === "EU";
  const effective = isEuGroup
    ? homeIsEu
      ? {
          ...t,
          jurisdiction: "European Union (Union OSS — cross-border B2C)",
          amount: 10000,
          lookback: "calendar_year" as const,
          note: `Union OSS scheme (merchant established in ${home}): EUR 10,000 micro-threshold on cross-border B2C sales within the EU, home-country sales excluded. Domestic ${home} VAT obligations are out of scope of this analysis.`,
        }
      : {
          ...t,
          jurisdiction: "European Union (non-Union OSS)",
          note: t.note,
        }
    : t;

  const start = windowStart(effective.lookback);
  let revenue = 0;
  let tx = 0;
  let fxMissing = false;
  for (const { ch, loc } of resolved) {
    if (new Date(ch.created) < start) continue;
    const inScope = isEuGroup
      ? loc.country !== null &&
        EU_MEMBERS.has(loc.country) &&
        (!homeIsEu || loc.country !== home) // Union OSS: exclude domestic sales
      : t.level === "us_state"
        ? loc.country === "US" && loc.state === t.state
        : loc.country === t.code;
    if (!inScope) continue;
    const conv = convert(netMajor(ch), ch.currency, effective.currency, fx);
    if (conv === null) {
      fxMissing = true;
      continue;
    }
    revenue += conv;
    tx += 1;
  }

  const amountPct =
    effective.amount > 0 ? (revenue / effective.amount) * 100 : null;
  const txPct =
    t.tx_threshold && t.tx_threshold > 0 ? (tx / t.tx_threshold) * 100 : null;
  const legs = t.tx_threshold_logic ?? "or";
  // "or": either leg triggers -> max. "and": BOTH legs must be met -> min.
  const pct =
    txPct === null
      ? (amountPct ?? 0)
      : legs === "and"
        ? Math.min(amountPct ?? 0, txPct)
        : Math.max(amountPct ?? 0, txPct);

  let status:
    | "registration_likely_required"
    | "crossed"
    | "approaching"
    | "insufficient_data"
    | "clear";
  if (effective.amount === 0) {
    status = revenue > 0 ? "registration_likely_required" : "clear";
  } else if (pct >= 100) {
    status = "crossed";
  } else if (pct >= 75) {
    status = "approaching";
  } else {
    status = "clear";
  }
  // A state row can only claim "clear" if state resolution was complete.
  if (t.level === "us_state" && status === "clear" && usNoStateUsd > 0) {
    status = "insufficient_data";
  }

  const registered = isEuGroup
    ? activeRegs.some((r) => r.type !== null && OSS_TYPES.has(r.type ?? ""))
    : t.level === "us_state"
      ? activeRegs.some((r) => r.country === "US" && r.state === t.state)
      : activeRegs.some((r) => r.country === t.code);

  return {
    jurisdiction: effective.jurisdiction,
    code: t.code,
    level: t.level,
    ...(t.state && { state: t.state }),
    revenue_in_local_currency: Math.round(revenue * 100) / 100,
    currency: effective.currency,
    threshold_amount: effective.amount,
    ...(t.tx_threshold && {
      tx_count: tx,
      tx_threshold: t.tx_threshold,
      tx_threshold_logic: legs,
    }),
    pct_of_threshold:
      effective.amount > 0 ? Math.round(pct * 10) / 10 : null,
    lookback: effective.lookback,
    status,
    registered_in_stripe_tax: registered,
    ...(effective.note && { note: effective.note }),
    source_url: t.source_url,
    as_of: t.as_of,
    ...(fxMissing && {
      warning: "Some charges skipped — missing FX rate for their currency.",
    }),
  };
});

const severity = {
  registration_likely_required: 0,
  crossed: 1,
  approaching: 2,
  insufficient_data: 3,
  clear: 4,
} as const;
rows.sort(
  (a, b) =>
    severity[a.status] - severity[b.status] ||
    (b.revenue_in_local_currency || 0) - (a.revenue_in_local_currency || 0)
);

const actionable = rows.filter(
  (r) =>
    (r.status === "registration_likely_required" || r.status === "crossed") &&
    !r.registered_in_stripe_tax
);

const warnings: string[] = [];
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: test-mode cards are always US-issued, so the card-issuer country fallback is unreliable — country attribution and any US figures may be artifacts. Re-run with a live-mode restricted key for real numbers."
  );
}
if (usNoStateUsd > 0) {
  warnings.push(
    `${Math.round(usNoStateUsd * 100) / 100} USD across ${usNoStateTx} US transactions could not be resolved to a state — US state rows report 'insufficient_data' instead of 'clear'.`
  );
}

const path = writeComputed("threshold-exposure.json", {
  status: "ok",
  key_mode: keyMode,
  merchant_home_country: home,
  thresholds_as_of: thresholds._meta.as_of,
  thresholds_status: thresholds._meta.status,
  fx_as_of: fx._meta.as_of,
  summary: {
    registration_likely_required: rows.filter(
      (r) => r.status === "registration_likely_required"
    ).length,
    crossed: rows.filter((r) => r.status === "crossed").length,
    approaching: rows.filter((r) => r.status === "approaching").length,
    insufficient_data: rows.filter((r) => r.status === "insufficient_data")
      .length,
    clear: rows.filter((r) => r.status === "clear").length,
    actionable_unregistered: actionable.map((r) => r.jurisdiction),
    us_revenue_unresolved_state_usd: Math.round(usNoStateUsd * 100) / 100,
  },
  ...(warnings.length > 0 && { warnings }),
  methodology_notes: [
    "rolling_4q and base_period_2y lookbacks are approximated as trailing 12 months in this version — flagged per row via 'lookback'.",
    "Revenue converted with bundled FX rates (see fx_as_of) — indicative, not accounting-grade.",
    "Zero-threshold jurisdictions report 'registration_likely_required' on any sale; specific rules (B2C vs B2B, establishment) need human review.",
    "EU row is scheme-aware: Union OSS (EUR 10,000, cross-border only, domestic excluded) for EU-established merchants; non-Union OSS (no threshold) otherwise. Domestic VAT obligations are never assessed here.",
    "'Registered' means a matching ACTIVE Stripe Tax registration: OSS-type for the EU row, exact state for US rows, exact country otherwise. Registrations managed outside Stripe Tax are not visible to this analysis.",
  ],
  jurisdictions: rows,
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
