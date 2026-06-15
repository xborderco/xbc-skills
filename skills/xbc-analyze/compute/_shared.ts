// Shared helpers for compute scripts. Underscore prefix = not runnable.
// Compute scripts NEVER touch the network: they read xbc-analysis/raw/ and
// assets/, and write xbc-analysis/computed/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const RAW_DIR = join(SKILL_ROOT, "xbc-analysis", "raw");
export const COMPUTED_DIR = join(SKILL_ROOT, "xbc-analysis", "computed");

export function readRaw<T>(name: string): T {
  const path = join(RAW_DIR, name);
  if (!existsSync(path)) {
    console.error(
      `missing raw data: ${path}\nRun the matching fetch action first (see SKILL.md step 1).`
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readRawOptional<T>(name: string): T | null {
  const path = join(RAW_DIR, name);
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as T)
    : null;
}

export function readAsset<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(SKILL_ROOT, "assets", name), "utf8")
  ) as T;
}

export function writeComputed(name: string, data: unknown): string {
  mkdirSync(COMPUTED_DIR, { recursive: true });
  const path = join(COMPUTED_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

// --- money -------------------------------------------------------------

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** Stripe minor units -> major units (JPY etc. have no minor unit). */
export function toMajor(amountMinor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase())
    ? amountMinor
    : amountMinor / 100;
}

export interface FxRates {
  _meta: { as_of: string; source: string; note: string };
  units_per_usd: Record<string, number>;
}

/** Convert a major-unit amount between currencies via bundled USD rates. */
export function convert(
  amountMajor: number,
  from: string,
  to: string,
  fx: FxRates
): number | null {
  const f = fx.units_per_usd[from.toUpperCase()];
  const t = fx.units_per_usd[to.toUpperCase()];
  if (f === undefined || t === undefined) return null;
  return (amountMajor / f) * t;
}

// --- country resolution (Stripe-Tax-style tier hierarchy) ---------------

export interface ChargeRecord {
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

export interface CustomerRecord {
  id: string;
  address_country: string | null;
  address_state: string | null;
  shipping_country: string | null;
}

export type Tier =
  | "billing_address"
  | "card_issuer"
  | "customer_address"
  | "unresolved";

export function buildCustomerCountryMap(
  customers: CustomerRecord[]
): Map<string, { country: string; state: string | null }> {
  const map = new Map<string, { country: string; state: string | null }>();
  for (const c of customers) {
    const country = c.address_country ?? c.shipping_country;
    if (country) map.set(c.id, { country, state: c.address_state });
  }
  return map;
}

export function resolveCountry(
  charge: ChargeRecord,
  customerCountries: Map<string, { country: string; state: string | null }>
): { country: string | null; state: string | null; tier: Tier } {
  if (charge.billing_country) {
    return {
      country: charge.billing_country,
      state: charge.billing_state,
      tier: "billing_address",
    };
  }
  if (charge.card_country) {
    return { country: charge.card_country, state: null, tier: "card_issuer" };
  }
  const fromCustomer = charge.customer
    ? customerCountries.get(charge.customer)
    : undefined;
  if (fromCustomer) {
    return {
      country: fromCustomer.country,
      state: fromCustomer.state,
      tier: "customer_address",
    };
  }
  return { country: null, state: null, tier: "unresolved" };
}

/** Net revenue of a charge in major units of its own currency. */
export function netMajor(charge: ChargeRecord): number {
  return toMajor(charge.amount - charge.amount_refunded, charge.currency);
}

export const EU_MEMBERS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);
