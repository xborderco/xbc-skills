// Parsers for Stripe Tax's per-jurisdiction docs pages. Split out from
// refresh-thresholds.ts so the fiddly text handling is testable on its own.
//
// MAINTAINER TOOL — not part of the skill's runtime. See tools/README.md.

export type Lookback =
  | "calendar_year"
  | "rolling_12m"
  | "rolling_4q"
  | "rolling_3m"
  | "ny_sales_tax_4q"
  | "base_period_2y"
  | "immediate";

export interface ParsedThreshold {
  amount: number;
  currency: string | null;
  lookback: Lookback | null;
  tx_threshold?: number;
  tx_threshold_logic?: "and" | "or";
  tx_threshold_exclusive?: boolean;
  amount_exclusive?: boolean;
  /** False means a human must look at this row before it ships. */
  confident: boolean;
  /** Why it is not confident — surfaced in the run summary, never swallowed. */
  reasons: string[];
}

/** Stripe writes some amounts with a word multiplier ("1.8 million THB"). */
const MULTIPLIERS: Record<string, number> = {
  million: 1_000_000,
  billion: 1_000_000_000,
};

/** Stripe writes a few currencies in local shorthand rather than ISO 4217. */
const CURRENCY_ALIASES: Record<string, string> = {
  TL: "TRY", // Türkiye — "1 million TL"
  RS: "LKR", // Sri Lanka — "RS 15 million"
};

/** Pull a "- **Label**\n\n  value" field out of a Stripe docs markdown page. */
export function field(page: string, ...labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = page.match(
      new RegExp(String.raw`^-\s+\*\*${escaped}[^*]*\*\*\s*\n\s*\n\s{2,}(.+?)\s*$`, "m")
    );
    if (m) return m[1].trim();
  }
  return null;
}

/** The first markdown link target under a labelled field, e.g. the tax authority. */
export function fieldLink(page: string, ...labels: string[]): string | null {
  const value = field(page, ...labels);
  const m = value?.match(/\]\((https?:\/\/[^)\s]+)\)/);
  return m ? m[1] : null;
}

/**
 * Parse a digit group like "100,000", "1.8 million" or "2,00,000".
 *
 * Returns null on MALFORMED GROUPING rather than guessing. Stripe's South
 * Africa row reads "2,00,000 ZAR" — Indian lakh grouping on a rand figure.
 * Stripping commas yields 200,000, but the grouping says nobody checked it,
 * so the only safe answer is to refuse and route the row to a human.
 */
export function parseAmount(raw: string): number | null {
  const m = raw.match(/^([\d,]+(?:\.\d+)?)\s*(million|billion)?$/i);
  if (!m) return null;
  const [, digits, word] = m;
  const groups = digits.split(",");
  if (groups.length > 1) {
    const leading = groups[0];
    const rest = groups.slice(1);
    if (leading.length < 1 || leading.length > 3) return null;
    if (rest.some((g) => g.length !== 3)) return null;
  }
  const n = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return word ? n * MULTIPLIERS[word.toLowerCase()] : n;
}

function normaliseCurrency(token: string): string | null {
  const upper = token.toUpperCase();
  const resolved = CURRENCY_ALIASES[upper] ?? upper;
  return /^[A-Z]{3}$/.test(resolved) ? resolved : null;
}

/** Map Stripe's period wording onto the lookback values compute understands. */
export function parseLookback(text: string): Lookback | null {
  const t = text.toLowerCase();
  if (/base period/.test(t)) return "base_period_2y";
  if (/(preceding|previous)\s+four\s+(sales tax\s+)?quarters|four consecutive.*quarters/.test(t))
    return "rolling_4q";
  if (/rolling\s+3\s+months|per\s+3\s+months|in\s+3\s+months/.test(t)) return "rolling_3m";
  if (/calendar year|current year|previous year|fiscal year|previous or current/.test(t))
    return "calendar_year";
  // Stripe writes the same 12-month window a dozen ways across the corpus:
  // "per rolling 12 months", "in the prior twelve months", "within a year".
  // Checked after the calendar-year rules so "previous or current year" is not
  // swallowed by a bare "12 months" match.
  if (/\b(12|twelve)\s+months\b|within a year/.test(t)) return "rolling_12m";
  return null;
}

/**
 * Parse Stripe's "Registration threshold" / "Threshold" field.
 *
 * Deliberately narrow: it recognises the shapes that appear verbatim across the
 * corpus and gives up on everything else. A compound rule ("1 million SGD
 * (global) and 100,000 SGD (B2C sales into Singapore)") must reach a human, not
 * be half-parsed into a number that looks authoritative.
 */
export function parseThresholdField(raw: string): ParsedThreshold {
  const reasons: string[] = [];
  const text = raw.trim();

  // "N/A", "N/A (no state sales tax registration to add in Stripe)"
  if (/^n\/a\b/i.test(text)) {
    return {
      amount: 0,
      currency: null,
      lookback: null,
      confident: false,
      reasons: ["no tax regime in this jurisdiction — needs an explicit no_tax row"],
    };
  }

  // "1 transaction", "1 transaction in 12 months", "1 transaction (voluntary registration)"
  if (/^1 transaction\b/i.test(text)) {
    return {
      amount: 0,
      currency: null,
      lookback: "immediate",
      confident: true,
      reasons: [],
    };
  }

  // Refuse compound rules rather than half-parsing them. A rule carrying two
  // different money amounts (Indonesia's monthly-or-annual test, Australia's
  // non-profit variant, Singapore's global-and-local pair) cannot be reduced to
  // one number without silently picking a side.
  const moneyMentions = [
    // Uppercase-only: lowercase would make "200,000 in the current year" read
    // as an amount in a currency called "in".
    ...(text.match(/[\d,]+(?:\.\d+)?\s*(?:million|billion)?\s+[A-Z]{2,3}\b/g) ?? []),
    // Prefix form ("BBD 200,000", "RS 15 million") only ever appears at the
    // start. Anchored and uppercase-only, or the "or" in "or 200 transactions"
    // reads as a currency and every two-leg US state looks compound.
    ...(text.match(/^[A-Z]{2,3}\s+[\d,]+(?:\.\d+)?/) ?? []),
  ];
  if (moneyMentions.length > 1) {
    reasons.push(`more than one monetary amount in the rule: "${text}"`);
  }
  if (/\(/.test(text)) {
    reasons.push(`parenthetical condition attached to the rule: "${text}"`);
  }
  if (/\.\s+[A-Za-z]/.test(text)) {
    reasons.push(`rule carries trailing prose that may qualify it: "${text}"`);
  }

  // "100,000 USD or 200 transactions" / "100,000 USD and 200 transactions—both required"
  const twoLegs = text.match(
    /^([\d,]+(?:\.\d+)?(?:\s+(?:million|billion))?)\s+([A-Za-z]{2,3})\s+(and|or)\s+(\d+)\s+transactions?\b/i
  );
  // "100,000 USD", "1.8 million THB", "50000 NOK per rolling 12 months"
  const suffix = text.match(/^([\d,]+(?:\.\d+)?(?:\s+(?:million|billion))?)\s+([A-Za-z]{2,3})\b(.*)$/i);
  // "BBD 200,000 in the current year", "RS 15 million per rolling 3 months"
  const prefix = text.match(/^([A-Za-z]{2,3})\s+([\d,]+(?:\.\d+)?(?:\s+(?:million|billion))?)\b(.*)$/i);

  let amountRaw: string | null = null;
  let currencyRaw: string | null = null;
  let tail = "";
  let tx: number | undefined;
  let logic: "and" | "or" | undefined;

  if (twoLegs) {
    [, amountRaw, currencyRaw] = twoLegs;
    logic = twoLegs[3].toLowerCase() === "and" ? "and" : "or";
    tx = Number(twoLegs[4]);
    tail = text.slice(twoLegs[0].length);
  } else if (suffix) {
    [, amountRaw, currencyRaw, tail] = suffix;
  } else if (prefix) {
    [, currencyRaw, amountRaw, tail] = prefix;
  } else {
    reasons.push(`unrecognised threshold format: "${text}"`);
    return { amount: 0, currency: null, lookback: null, confident: false, reasons };
  }

  const amount = parseAmount(amountRaw.trim());
  if (amount === null) {
    reasons.push(`could not parse amount "${amountRaw}" (malformed digit grouping?)`);
  }
  const currency = normaliseCurrency(currencyRaw);
  if (currency === null) {
    reasons.push(`unrecognised currency token "${currencyRaw}"`);
  } else if (CURRENCY_ALIASES[currencyRaw.toUpperCase()]) {
    reasons.push(`currency written as "${currencyRaw}", read as ${currency} — confirm`);
  }

  const lookback = parseLookback(tail || text);
  if (lookback === null) {
    reasons.push("no measurement period stated in the threshold field");
  }

  return {
    amount: amount ?? 0,
    currency,
    lookback,
    ...(tx !== undefined && { tx_threshold: tx, tx_threshold_logic: logic }),
    confident: reasons.length === 0,
    reasons,
  };
}

/**
 * US state pages carry the real detail in prose, not the threshold field:
 *
 *   "Remote sellers must register ... when, in the previous or current calendar
 *    year, they meet or exceed both of the following:
 *      - A sales threshold of 100,000 USD
 *      - A volume threshold of 200 transactions"
 *
 * This is where the lookback lives for the 22 states whose threshold field is a
 * bare "100,000 USD", and it is the only place Stripe distinguishes "exceed"
 * (strictly greater) from "meet or exceed" — the difference that made New York
 * report a crossing one sale early.
 */
export function parseUsBody(page: string): Partial<ParsedThreshold> {
  const out: Partial<ParsedThreshold> = {};
  const intro = page.match(
    /Remote sellers must register[^.]*?when,\s*(?:in|during)\s+(?:the\s+)?([^,]+),\s*they\s+([^:]*)[::]/i
  );
  if (intro) {
    const lookback = parseLookback(intro[1]);
    if (lookback) out.lookback = lookback;
    if (/both of the following|both thresholds/i.test(intro[2])) out.tx_threshold_logic = "and";
    else if (/one of the following|either/i.test(intro[2])) out.tx_threshold_logic = "or";
  } else {
    // Single-leg states phrase it inline: "...they exceed a sales threshold of 100,000 USD."
    const single = page.match(
      /Remote sellers must register[^.]*?when,\s*(?:in|during)\s+(?:the\s+)?([^,]+),\s*they\s+(exceed|meet or exceed)\s+a sales threshold/i
    );
    if (single) {
      const lookback = parseLookback(single[1]);
      if (lookback) out.lookback = lookback;
      out.amount_exclusive = /^exceed$/i.test(single[2]);
    }
  }

  const sales = page.match(/[-*]\s*(?:A\s+)?(Exceed|Meet or exceed)?\s*a?\s*sales threshold of\s+([\d,]+)\s*([A-Z]{3})/i);
  if (sales?.[1]) out.amount_exclusive = /^exceed$/i.test(sales[1]);

  const volume = page.match(/[-*]\s*(?:A\s+)?(Exceed|Meet or exceed)?\s*a?\s*volume threshold of\s+(\d+)\s+transactions?/i);
  if (volume) {
    out.tx_threshold = Number(volume[2]);
    if (volume[1]) out.tx_threshold_exclusive = /^exceed$/i.test(volume[1]);
  }
  return out;
}
