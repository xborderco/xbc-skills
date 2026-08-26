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
  readAnalysisWindow,
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
  // true when the statute says "MORE THAN N sales" rather than "N or more".
  tx_threshold_exclusive?: boolean;
  // true when the statute says "EXCEEDS N" rather than "N or more".
  amount_exclusive?: boolean;
  // true where the jurisdiction levies no tax of this kind at all. Distinct
  // from amount: 0, which means "liable from the first sale".
  no_tax?: boolean;
  // true when the source value could not be parsed. Never scored — see the
  // generator. Reported as insufficient_data, never as clear or crossed.
  unscorable?: boolean;
  lookback:
    | "calendar_year"
    | "rolling_12m"
    | "rolling_4q"
    | "rolling_3m"
    | "ny_sales_tax_4q"
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
  window: { from: string; to: string };
  charges: ChargeRecord[];
}>("charges.json");
const charges = rawCharges.charges;
const keyMode = rawCharges._meta?.key_mode ?? "unknown";
const dataWindow = readAnalysisWindow(rawCharges.window);
const { customers } = readRaw<{ customers: CustomerRecord[] }>(
  "customers.json"
);
const rawRegs = readRawOptional<{
  registrations_known?: boolean;
  registrations: Registration[];
}>("tax-registrations.json");
const registrations = rawRegs?.registrations ?? [];
// On the CSV path registrations are UNKNOWN, not absent. Treating unknown as
// "none" would flag a jurisdiction the merchant already handles as needing
// attention — the fastest way to lose their trust in everything else.
const registrationsKnown = rawRegs !== null && rawRegs.registrations_known !== false;
const home =
  readRawOptional<{ head_office_country: string | null }>("tax-settings.json")
    ?.head_office_country ?? null;
const thresholds = readAsset<{
  _meta: { as_of: string; status: string };
  jurisdictions: ThresholdRow[];
}>("thresholds.json");
const fx = readAsset<FxRates>("fx-rates.json");

const customerCountries = buildCustomerCountryMap(customers);

// Every measurement window is anchored to the END OF THE ANALYSIS WINDOW, never
// to "now". Anchoring to now meant a run over a historical --from/--to window
// measured a period containing none of the fetched charges and reported "clear"
// — a silent false all-clear, the costliest way this analysis can be wrong.
const anchor = dataWindow.to;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the jurisdiction actually measures over, per Stripe Tax's
 *  documented per-jurisdiction windows. Each row is then scored against how
 *  much of that period our data covers (see coverageOf). */
function measurementWindow(lookback: ThresholdRow["lookback"]): {
  from: Date;
  to: Date;
} {
  const y = anchor.getUTCFullYear();
  switch (lookback) {
    case "calendar_year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: anchor };
    case "rolling_12m":
      return { from: new Date(anchor.getTime() - 365 * DAY_MS), to: anchor };
    case "rolling_3m":
      return {
        from: new Date(
          Date.UTC(y, anchor.getUTCMonth() - 3, anchor.getUTCDate())
        ),
        to: anchor,
      };
    case "rolling_4q": {
      // Four consecutive calendar quarters ending with the anchor's quarter.
      const q = Math.floor(anchor.getUTCMonth() / 3);
      const startMonth = q * 3 - 9; // three quarters back; may go negative
      return {
        from: new Date(Date.UTC(y, startMonth, 1)),
        to: anchor,
      };
    }
    case "ny_sales_tax_4q": {
      // New York's sales tax quarters run Dec-Feb, Mar-May, Jun-Aug, Sep-Nov,
      // and the test is the four IMMEDIATELY PRECEDING ones — the current,
      // incomplete quarter is excluded. Using calendar quarters ending with the
      // anchor's quarter (as "rolling_4q" does) measures the wrong three months
      // at both ends.
      const NY_QUARTER_START = [-1, -1, 2, 2, 2, 5, 5, 5, 8, 8, 8, 11];
      const qStartMonth = NY_QUARTER_START[anchor.getUTCMonth()];
      // Date.UTC rolls negative month indexes back into the previous year, so
      // Jan/Feb correctly resolve to the Dec-Feb quarter that began last year.
      return {
        from: new Date(Date.UTC(y, qStartMonth - 12, 1)),
        to: new Date(Date.UTC(y, qStartMonth, 1) - 1),
      };
    }
    case "base_period_2y":
      // JP: the base period is the fiscal year TWO YEARS before the current one.
      // A trailing-12-month fetch never contains it — the row reports
      // insufficient_data rather than a number computed from the wrong years.
      return {
        from: new Date(Date.UTC(y - 2, 0, 1)),
        to: new Date(Date.UTC(y - 1, 0, 1)),
      };
    case "immediate":
      // No threshold period — liability attaches to the first sale, so the
      // whole analysis window is the relevant evidence.
      return { from: dataWindow.from, to: anchor };
  }
}

/** Fraction of a jurisdiction's measurement window our fetched data covers. */
function coverageOf(w: { from: Date; to: Date }): number {
  const required = w.to.getTime() - w.from.getTime();
  if (required <= 0) return 1;
  const overlap =
    Math.min(w.to.getTime(), dataWindow.to.getTime()) -
    Math.max(w.from.getTime(), dataWindow.from.getTime());
  return Math.max(0, Math.min(1, overlap / required));
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

// Markets this dataset has NO ROW for. Without this scan, revenue into a
// country absent from thresholds.json produces no row, no number and no
// warning — and the merchant reads the jurisdiction list as "all my markets"
// when it is only "the markets we happen to model". That is the same silent
// false all-clear the coverage gates above exist to prevent, one level up.
// no_tax rows count as covered: the market WAS assessed, the answer is "nothing
// is owed here". Treating them as unassessed would tell a merchant to go and
// investigate Oregon.
const coveredCountries = new Set(
  thresholds.jurisdictions.filter((t) => t.level === "country").map((t) => t.code)
);
const hasEuGroupRow = thresholds.jurisdictions.some(
  (t) => t.level === "country_group" && t.code === "EU"
);
const coveredUsStates = new Set(
  thresholds.jurisdictions
    .filter((t) => t.level === "us_state" && t.state)
    .map((t) => t.state as string)
);
const unassessed = new Map<string, { usd: number; tx: number }>();
let unresolvedCountryUsd = 0;
let unresolvedCountryTx = 0;
for (const { ch, loc } of resolved) {
  const usd = convert(netMajor(ch), ch.currency, "USD", fx) ?? 0;
  if (loc.country === null) {
    unresolvedCountryUsd += usd;
    unresolvedCountryTx += 1;
    continue;
  }
  let key: string | null = null;
  if (loc.country === "US") {
    // There is no US country-level row — only the listed states are modeled.
    // US revenue with no state at all is already reported via usNoStateUsd.
    if (loc.state && !coveredUsStates.has(loc.state)) key = `US-${loc.state}`;
  } else if (hasEuGroupRow && EU_MEMBERS.has(loc.country)) {
    key = null; // assessed by the EU group row
  } else if (!coveredCountries.has(loc.country)) {
    key = loc.country;
  }
  if (key === null) continue;
  const acc = unassessed.get(key) ?? { usd: 0, tx: 0 };
  acc.usd += usd;
  acc.tx += 1;
  unassessed.set(key, acc);
}
const unassessedRows = [...unassessed.entries()]
  .map(([code, v]) => ({
    code,
    revenue_usd: Math.round(v.usd * 100) / 100,
    tx_count: v.tx,
  }))
  .sort((a, b) => b.revenue_usd - a.revenue_usd);
const unassessedUsd =
  Math.round(unassessedRows.reduce((sum, r) => sum + r.revenue_usd, 0) * 100) / 100;

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

  const measured = measurementWindow(effective.lookback);
  const coverage = coverageOf(measured);
  let revenue = 0;
  let revenueUsd = 0;
  let tx = 0;
  let fxMissing = false;
  // The currencies the charges were ACTUALLY made in. The local-currency figure
  // above is derived, and a merchant who never billed in that currency reads it
  // as an error. Reporting the source currencies is what makes it legible.
  const chargeCurrencies: Record<string, number> = {};
  for (const { ch, loc } of resolved) {
    const at = new Date(ch.created);
    if (at < measured.from || at > measured.to) continue;
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
    // USD equivalent is for COMPARISON ONLY — every threshold test above runs in
    // the jurisdiction's own currency, which is how the threshold is written.
    revenueUsd += convert(netMajor(ch), ch.currency, "USD", fx) ?? 0;
    chargeCurrencies[ch.currency] =
      (chargeCurrencies[ch.currency] ?? 0) + netMajor(ch);
    tx += 1;
  }

  const amountPct =
    effective.amount > 0 ? (revenue / effective.amount) * 100 : null;
  // "More than N sales" (NY) is met at N+1, not N. Transaction counts are
  // integers, so the exclusive test is exactly a threshold of N+1 — scoring
  // against N reports a crossing one sale early.
  const txTarget =
    t.tx_threshold && t.tx_threshold > 0
      ? t.tx_threshold + (t.tx_threshold_exclusive ? 1 : 0)
      : null;
  const txPct = txTarget === null ? null : (tx / txTarget) * 100;
  const legs = t.tx_threshold_logic ?? "or";
  // "or": either leg triggers -> max. "and": BOTH legs must be met -> min.
  const pct =
    txPct === null
      ? (amountPct ?? 0)
      : legs === "and"
        ? Math.min(amountPct ?? 0, txPct)
        : Math.max(amountPct ?? 0, txPct);

  // Crossing is decided on the legs themselves, not on the rounded percentage,
  // because "exceeds N" and "N or more" differ exactly at N — the boundary a
  // merchant is most likely to be sitting on.
  const amountMet =
    effective.amount > 0 &&
    (t.amount_exclusive ? revenue > effective.amount : revenue >= effective.amount);
  const txMet = txTarget === null ? null : tx >= txTarget;
  const legsMet =
    txMet === null
      ? amountMet
      : legs === "and"
        ? amountMet && txMet
        : amountMet || txMet;

  let status:
    | "registration_likely_required"
    | "crossed"
    | "approaching"
    | "insufficient_data"
    | "clear"
    | "no_tax_regime";
  if (fxMissing) {
    // Charges were skipped for want of a rate, so the total is an undercount —
    // and an undercount is exactly what turns a crossing into a false "clear".
    status = "insufficient_data";
  } else if (t.unscorable) {
    // We could not read this jurisdiction's threshold. Saying "clear" would be
    // a false all-clear; saying "crossed" would be a fabricated liability.
    status = "insufficient_data";
  } else if (t.no_tax) {
    // No tax of this kind exists here, so no amount of revenue creates an
    // obligation. Reported explicitly rather than as "clear" so the merchant
    // can see the market WAS assessed and is not simply missing.
    status = "no_tax_regime";
  } else if (effective.amount === 0) {
    status = revenue > 0 ? "registration_likely_required" : "clear";
  } else if (legsMet) {
    status = "crossed";
  } else if (pct >= 75) {
    status = "approaching";
  } else {
    status = "clear";
  }
  // Coverage gate, applied asymmetrically on purpose. Crossing a threshold on a
  // SUBSET of the jurisdiction's window is still a crossing, so "crossed" and
  // "registration_likely_required" stand. A negative finding ("clear",
  // "approaching") computed over a fraction of the window is not evidence of
  // anything — those become insufficient_data.
  const COVERAGE_FLOOR = 0.95;
  if (
    !t.no_tax &&
    !t.unscorable &&
    coverage < COVERAGE_FLOOR &&
    (status === "clear" || status === "approaching")
  ) {
    status = "insufficient_data";
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
    revenue_usd_equivalent: Math.round(revenueUsd * 100) / 100,
    // What the merchant actually charged, in the currencies they actually used.
    charged_in: Object.fromEntries(
      Object.entries(chargeCurrencies)
        .map(([c, v]) => [c, Math.round(v * 100) / 100])
        .sort(([, a], [, b]) => (b as number) - (a as number))
    ),
    // True when the jurisdiction's currency is one the merchant never billed in,
    // so the local-currency figure is entirely a conversion.
    local_currency_is_derived:
      revenue > 0 && chargeCurrencies[effective.currency] === undefined,
    threshold_amount: effective.amount,
    ...(t.no_tax && { no_tax: true }),
    ...(t.unscorable && { unscorable: true }),
    ...(t.amount_exclusive && { amount_exclusive: true }),
    ...(t.tx_threshold && {
      tx_count: tx,
      tx_threshold: t.tx_threshold,
      tx_threshold_logic: legs,
      ...(t.tx_threshold_exclusive && { tx_threshold_exclusive: true }),
    }),
    pct_of_threshold:
      effective.amount > 0 ? Math.round(pct * 10) / 10 : null,
    lookback: effective.lookback,
    measurement_window: {
      from: measured.from.toISOString(),
      to: measured.to.toISOString(),
      data_coverage_pct: Math.round(coverage * 1000) / 10,
    },
    status,
    registered_in_stripe_tax: registered,
    ...(effective.note && { note: effective.note }),
    source_url: t.source_url,
    as_of: t.as_of,
    ...(fxMissing && {
      warning:
        `Missing FX rate for at least one charge currency, so this row's total is an undercount and it is reported as insufficient_data. Add the rate to assets/fx-rates.json (threshold currency: ${effective.currency}).`,
    }),
  };
});

const severity = {
  registration_likely_required: 0,
  crossed: 1,
  approaching: 2,
  insufficient_data: 3,
  clear: 4,
  no_tax_regime: 5,
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

// Revenue behind the actionable rows, in USD, for the report headline. This is
// REVENUE IN THOSE MARKETS — not a tax bill, not an estimate of tax owed. The
// analysis has no visibility of whether tax was charged on any of it.
const atRiskUsd =
  Math.round(
    actionable.reduce((sum, r) => sum + (r.revenue_usd_equivalent || 0), 0) * 100
  ) / 100;
// US state rows sit inside the US country total; the EU group row excludes the
// home country. Neither overlaps another actionable row in the current dataset,
// but say so rather than assume it stays true as jurisdictions are added.
const actionableScopesOverlap =
  actionable.some((r) => r.level === "us_state") &&
  actionable.some((r) => r.code === "US");

const warnings: string[] = [];
if (!registrationsKnown) {
  warnings.push(
    "Registrations you already hold could not be read, so every market below is shown as if you are not registered. If you are already registered somewhere, that market does not need attention — check the list against your own records."
  );
}
if (actionableScopesOverlap) {
  warnings.push(
    "Actionable rows include both a US country row and US state rows — their revenue overlaps, so the summed at-risk figure double-counts. Report the rows individually, not the total."
  );
}
const shortCoverage = rows.filter(
  (r) => r.measurement_window.data_coverage_pct < 95
);
if (shortCoverage.length > 0) {
  warnings.push(
    `${shortCoverage.length} jurisdiction(s) measure over a window the fetched data does not fully cover (${shortCoverage
      .map(
        (r) => `${r.jurisdiction}: ${r.measurement_window.data_coverage_pct}%`
      )
      .join("; ")}). A negative result there is reported as 'insufficient_data', not 'clear'. Refetch with --from/--to covering the full window to test them.`
  );
}
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: test-mode cards are always US-issued, so the card-issuer country fallback is unreliable — country attribution and any US figures may be artifacts. Re-run with a live-mode restricted key for real numbers."
  );
}
if (unassessedRows.length > 0) {
  const shown = unassessedRows
    .slice(0, 10)
    .map((r) => `${r.code} (${r.revenue_usd} USD, ${r.tx_count} tx)`)
    .join("; ");
  const more =
    unassessedRows.length > 10 ? `; and ${unassessedRows.length - 10} more` : "";
  warnings.push(
    `${unassessedRows.length} market(s) carrying ${unassessedUsd} USD of revenue have no threshold row in this dataset and were NOT assessed: ${shown}${more}. Their absence from the jurisdiction list is not an all-clear — they were never tested.`
  );
}
if (unresolvedCountryTx > 0) {
  warnings.push(
    `${Math.round(unresolvedCountryUsd * 100) / 100} USD across ${unresolvedCountryTx} transaction(s) could not be resolved to any country, so they were not tested against any threshold.`
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
  registrations_known: registrationsKnown,
  thresholds_as_of: thresholds._meta.as_of,
  thresholds_status: thresholds._meta.status,
  thresholds_jurisdiction_count: thresholds.jurisdictions.length,
  fx_as_of: fx._meta.as_of,
  analysis_window: {
    from: dataWindow.from.toISOString(),
    to: dataWindow.to.toISOString(),
  },
  summary: {
    registration_likely_required: rows.filter(
      (r) => r.status === "registration_likely_required"
    ).length,
    crossed: rows.filter((r) => r.status === "crossed").length,
    approaching: rows.filter((r) => r.status === "approaching").length,
    insufficient_data: rows.filter((r) => r.status === "insufficient_data")
      .length,
    clear: rows.filter((r) => r.status === "clear").length,
    no_tax_regime: rows.filter((r) => r.status === "no_tax_regime").length,
    actionable_unregistered: actionable.map((r) => r.jurisdiction),
    at_risk_revenue_usd: atRiskUsd,
    at_risk_revenue_scopes: actionable.map((r) => r.jurisdiction),
    at_risk_revenue_meaning:
      "Revenue in the jurisdictions listed in at_risk_revenue_scopes, summed in USD at the bundled rate. It is REVENUE, not tax owed and not a liability estimate — this analysis cannot see whether tax was charged on any of it.",
    us_revenue_unresolved_state_usd: Math.round(usNoStateUsd * 100) / 100,
    // Revenue in markets this dataset has no row for. Never assessed — report
    // it as unassessed, never as clear.
    unassessed_markets_usd: unassessedUsd,
    unassessed_markets: unassessedRows,
    unresolved_country_usd: Math.round(unresolvedCountryUsd * 100) / 100,
  },
  ...(warnings.length > 0 && { warnings }),
  methodology_notes: [
    "Each jurisdiction is measured over its own documented window (calendar year, rolling 12 months, rolling four quarters, New York's sales tax quarters, or a base period), anchored to the END of the analysis window — never to today.",
    "Only the jurisdictions present in this dataset are assessed. Revenue in any other market is reported under summary.unassessed_markets and is NOT an all-clear — no threshold was applied to it.",
    "New York is measured over the four immediately preceding New York sales tax quarters (Dec-Feb, Mar-May, Jun-Aug, Sep-Nov), which are not calendar quarters and exclude the current incomplete quarter. Its transaction leg is 'more than 100 sales', so it is met at 101, not 100.",
    "Where the fetched data covers less than 95% of a jurisdiction's window, a negative result is reported as 'insufficient_data' rather than 'clear'. A crossing found on partial data is still reported as crossed.",
    "Japan's base period is the fiscal year two years earlier; a trailing-12-month fetch never contains it, so that row reports 'insufficient_data' until a wider window is fetched.",
    "Thresholds are tested in the jurisdiction's own currency, which is how each threshold is written. The USD figure is shown for comparison only and is never used in a threshold test.",
    "Where the jurisdiction's currency is not one you bill in, the local-currency figure is a conversion of your own charges, not an amount you ever invoiced. The currencies you actually charged in are listed per jurisdiction.",
    "Revenue converted with bundled FX rates (see fx_as_of) — a single spot rate, indicative, not accounting-grade; daily-rate effects are not modelled.",
    "A 'no_tax_regime' row is a jurisdiction that levies no tax of this kind at all (Oregon, Hong Kong) — it was assessed, and no revenue level creates an obligation there.",
    "Where a jurisdiction has no threshold at all, any sale into it is flagged on the first sale; the specific rules (B2C vs B2B, establishment) need human review.",
    "EU row is scheme-aware: Union OSS (EUR 10,000, cross-border only, domestic excluded) for EU-established merchants; non-Union OSS (no threshold) otherwise. Domestic VAT obligations are never assessed here.",
    "'Registered' means a matching ACTIVE Stripe Tax registration: OSS-type for the EU row, exact state for US rows, exact country otherwise. Registrations managed outside Stripe Tax are not visible to this analysis.",
    "When registrations could not be read at all, every market is shown as unregistered. That is an absence of evidence, not evidence of absence.",
  ],
  jurisdictions: rows,
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
