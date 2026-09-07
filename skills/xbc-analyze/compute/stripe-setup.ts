// The merchant's Stripe configuration, as facts rather than as a paragraph the
// agent writes from raw files. Also computes the invoice-coverage signal: XBC
// works from invoices, so charges that never produce one are the setups it
// cannot see.
// Reads:  raw/products-prices.json, raw/subscriptions.json, raw/charges.json,
//         raw/invoices.json (optional), raw/tax-settings.json (optional)
// Writes: computed/stripe-setup.json
//   npx tsx compute/stripe-setup.ts
import {
  convert,
  readAsset,
  readRaw,
  readRawOptional,
  toMajor,
  writeComputed,
  type ChargeRecord,
  type FxRates,
  type InvoiceRecord,
} from "./_shared";

interface Product {
  id: string;
  name: string;
  tax_code: string | null;
}
interface Price {
  id: string;
  product: string | null;
  currency: string;
  interval: string | null;
  tax_behavior: string | null;
}
interface SubscriptionItem {
  unit_amount: number | null;
  currency: string | null;
  interval: string | null;
  interval_count: number | null;
  quantity: number | null;
}
interface Subscription {
  id: string;
  status: string;
  items?: SubscriptionItem[];
}

const rawCharges = readRaw<{
  _meta?: { key_mode?: string; source?: string };
  // Set by the CSV importer: false when the export had no "Invoice ID" column.
  invoice_link_available?: boolean;
  charges: ChargeRecord[];
}>("charges.json");
const fromCsv = rawCharges._meta?.source === "csv_import";
const charges = rawCharges.charges;
const keyMode = rawCharges._meta?.key_mode ?? "unknown";
// Absent on the CSV path — a payments export has no product catalogue. Report
// the catalogue figures as unavailable rather than as zero, and carry on: the
// integration detection and invoice-coverage signals still work from charges.
const catalogueRaw = readRawOptional<{ products: Product[]; prices: Price[] }>(
  "products-prices.json"
);
const products = catalogueRaw?.products ?? [];
const prices = catalogueRaw?.prices ?? [];
const catalogueAvailable = catalogueRaw !== null;
const subscriptions =
  readRawOptional<{ subscriptions: Subscription[] }>("subscriptions.json")
    ?.subscriptions ?? null;
const invoices =
  readRawOptional<{ invoices: InvoiceRecord[] }>("invoices.json")?.invoices ??
  null;
const taxSettings = readRawOptional<{
  head_office_country: string | null;
  default_tax_behavior: string | null;
  status: string | null;
}>("tax-settings.json");
const checkout = readRawOptional<{
  readable: boolean;
  checkout_sessions?: number;
  sessions_by_mode?: Record<string, number>;
  sessions_by_ui_mode?: Record<string, number>;
  sessions_from_payment_link?: number;
  sessions_with_invoice_creation?: number;
  payment_links_defined?: number | null;
}>("checkout-config.json");
const fx = readAsset<FxRates>("fx-rates.json");

const count = <T>(items: T[], key: (i: T) => string) => {
  const out: Record<string, number> = {};
  for (const i of items) {
    const k = key(i);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

// Stripe's digital-goods/services tax codes all sit under the txcd_10 prefix.
// Anything else is reported as its own code rather than judged.
const DIGITAL_PREFIX = "txcd_10";
const withTaxCode = products.filter((p) => p.tax_code !== null);
const digitalTaxCode = withTaxCode.filter((p) =>
  (p.tax_code ?? "").startsWith(DIGITAL_PREFIX)
);

const subsByStatus = subscriptions ? count(subscriptions, (s) => s.status) : null;

// Recurring revenue. Only ACTIVE subscriptions count: a trialing subscription
// pays nothing yet and a cancelled one pays nothing ever. Every price is
// normalised to a monthly amount, then converted to USD.
const MONTHS_PER_INTERVAL: Record<string, number> = {
  day: 1 / 30,
  week: 7 / 30,
  month: 1,
  year: 12,
};
let mrrUsd = 0;
let subsCounted = 0;
let itemsSkippedUsage = 0;
let itemsSkippedFx = 0;
for (const s of subscriptions ?? []) {
  if (s.status !== "active") continue;
  subsCounted += 1;
  for (const it of s.items ?? []) {
    const months = MONTHS_PER_INTERVAL[it.interval ?? ""];
    // A null unit_amount is a usage-based or tiered price. Its monthly value
    // depends on usage this analysis never fetched, so it is excluded and counted.
    if (it.unit_amount === null || it.currency === null || months === undefined) {
      itemsSkippedUsage += 1;
      continue;
    }
    const perPeriod =
      toMajor(it.unit_amount, it.currency) * (it.quantity ?? 1);
    const monthly = perPeriod / ((it.interval_count ?? 1) * months);
    const usd = convert(monthly, it.currency, "USD", fx);
    if (usd === null) {
      itemsSkippedFx += 1;
      continue;
    }
    mrrUsd += usd;
  }
}

// Invoice coverage. XBC acts on invoice.created, so a charge that never has an
// invoice is a transaction it would not see. PaymentIntents-direct and the
// legacy Charges API produce exactly this shape.
const chargesWithInvoice = charges.filter((ch) => ch.invoice !== null).length;
const paidInvoices = invoices?.filter((i) => i.status === "paid").length ?? 0;
// If not one charge carries an invoice link but paid invoices exist, the API
// version simply isn't returning the link — that is not evidence of anything.
// On the CSV path the importer says outright whether the column was there.
const invoiceLinkAvailable =
  rawCharges.invoice_link_available ??
  (chargesWithInvoice > 0 || paidInvoices === 0);

// Integration patterns detected from the account. Reported as observations, never
// as a single verdict: an account can legitimately run more than one.
const detected: string[] = [];
if (checkout?.readable) {
  const ui = checkout.sessions_by_ui_mode ?? {};
  if ((checkout.sessions_from_payment_link ?? 0) > 0) detected.push("Payment Links");
  if ((ui.hosted ?? 0) > (checkout.sessions_from_payment_link ?? 0))
    detected.push("Hosted Checkout");
  if ((ui.embedded ?? 0) > 0) detected.push("Embedded (Elements)");
  if ((ui.custom ?? 0) > 0) detected.push("Custom checkout");
  // A CSV export has no ui_mode column. Sessions that did not come from a
  // Payment Link are Checkout of some kind, but hosted and embedded cannot be
  // told apart from an export — say which, rather than picking one.
  if ((ui.unknown ?? 0) > 0)
    detected.push(
      "Stripe Checkout (hosted or embedded — a CSV export cannot tell them apart)"
    );
}
if ((invoices?.length ?? 0) > 0) {
  const apiCreated = invoices?.filter(
    (i) => i.billing_reason === "manual" || i.billing_reason === "subscription_create"
  ).length;
  if ((apiCreated ?? 0) > 0) detected.push("Invoice or Subscription API");
} else if (fromCsv && invoiceLinkAvailable && chargesWithInvoice > 0) {
  // A payments export carries the invoice id but not why the invoice exists,
  // so the API cannot be named. Say what the data shows and no more.
  detected.push(
    "Invoiced payments (Invoice or Subscription API — a CSV export cannot tell which)"
  );
}

const warnings: string[] = [];
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: catalogue and subscription figures come from the test account."
  );
}
if ((checkout?.sessions_with_invoice_creation ?? 0) > 0) {
  warnings.push(
    `${checkout?.sessions_with_invoice_creation} Checkout session(s) run with invoice_creation enabled. XBorderCo cannot process that configuration — Stripe finalises the invoice before it can be amended.`
  );
}
if (checkout && !checkout.readable) {
  warnings.push(
    "The integration type could not be detected from the account: the restricted key has no Checkout read scope. Ask the merchant rather than assuming."
  );
}
if (checkout?.readable && detected.length === 0) {
  warnings.push(
    "No Checkout sessions and no API-created invoices were found in the window, so the integration type could not be detected. Ask the merchant rather than assuming."
  );
}
if (subscriptions === null) {
  warnings.push(
    "Subscriptions were not fetched — subscription figures and recurring revenue are unavailable rather than zero."
  );
}
if (!catalogueAvailable) {
  warnings.push(
    "The product catalogue was not fetched — product, tax-code and pricing figures are unavailable rather than zero. A Stripe payments CSV export does not carry them."
  );
}
if (!invoiceLinkAvailable) {
  warnings.push(
    fromCsv
      ? 'The export has no "Invoice ID" column, so whether each payment came from an invoice is unknown. The integration type is unconfirmed — this is a gap in the export, not evidence of an unsupported setup.'
      : "This Stripe API version does not return the invoice link on charges, so invoice coverage cannot be measured. It is NOT safe to read this as 'no invoices'."
  );
}
if (
  invoiceLinkAvailable &&
  charges.length > 0 &&
  chargesWithInvoice < charges.length
) {
  const pct =
    Math.round(((charges.length - chargesWithInvoice) / charges.length) * 1000) /
    10;
  // A missing invoice link is a SIGNAL, not a verdict. One-off Checkout and
  // Payment Link sales also produce no Stripe invoice and are supported, so
  // this figure alone never means "unsupported". It means: confirm.
  warnings.push(
    `${pct}% of charges in the window carry no invoice id. This is a signal to confirm the integration type, not evidence of an unsupported setup: one-off Checkout and Payment Link sales also carry no invoice and are supported, while payments created directly through the PaymentIntents or legacy Charges API are not. Until the merchant confirms, the integration is unconfirmed.`
  );
}

const path = writeComputed("stripe-setup.json", {
  status: "ok",
  key_mode: keyMode,
  tax_settings: {
    head_office_country: taxSettings?.head_office_country ?? null,
    stripe_tax_status: taxSettings?.status ?? null,
    default_tax_behavior: taxSettings?.default_tax_behavior ?? null,
  },
  catalogue: catalogueAvailable ? {
    active_products: products.length,
    products_with_tax_code: withTaxCode.length,
    products_without_tax_code: products.length - withTaxCode.length,
    products_with_digital_tax_code: digitalTaxCode.length,
    tax_codes_in_use: count(withTaxCode, (p) => p.tax_code ?? "none"),
    active_prices: prices.length,
    price_tax_behavior: count(prices, (p) => p.tax_behavior ?? "unspecified"),
    recurring_prices: prices.filter((p) => p.interval !== null).length,
    currencies_in_use: Object.keys(count(prices, (p) => p.currency)).sort(),
  } : null,
  subscriptions:
    subsByStatus === null
      ? null
      : {
          total: subscriptions?.length ?? 0,
          active: subsByStatus.active ?? 0,
          by_status: subsByStatus,
        },
  recurring_revenue:
    subscriptions === null
      ? null
      : {
          mrr_usd: Math.round(mrrUsd * 100) / 100,
          arr_estimate_usd: Math.round(mrrUsd * 12 * 100) / 100,
          active_subscriptions_counted: subsCounted,
          items_excluded_usage_based: itemsSkippedUsage,
          items_excluded_missing_fx: itemsSkippedFx,
          basis:
            "Active subscriptions only, priced from the subscription's own line items and normalised to a monthly amount. ARR is MRR multiplied by 12 — it is an extrapolation of today's book, not a forecast and not last year's revenue. One-off sales are not included. Discounts, coupons and usage-based prices are not modelled.",
        },
  detected_integration: {
    detectable: checkout?.readable ?? false,
    patterns: detected,
    checkout_sessions: checkout?.checkout_sessions ?? null,
    sessions_by_mode: checkout?.sessions_by_mode ?? null,
    sessions_from_payment_link: checkout?.sessions_from_payment_link ?? null,
    payment_links_defined: checkout?.payment_links_defined ?? null,
    note: "Detected from the merchant's own Checkout sessions and invoices, not from what they said. An account may run more than one pattern. When patterns is empty, ask — do not assume the supported case.",
  },
  invoice_coverage: invoiceLinkAvailable
    ? {
        charges_in_window: charges.length,
        charges_with_invoice: chargesWithInvoice,
        charges_without_invoice: charges.length - chargesWithInvoice,
        pct_with_invoice:
          charges.length > 0
            ? Math.round((chargesWithInvoice / charges.length) * 1000) / 10
            : 0,
      }
    : null,
  ...(warnings.length > 0 && { warnings }),
  methodology_notes: [
    "Catalogue figures cover ACTIVE products and prices only; archived ones are not fetched.",
    "Digital tax codes are Stripe codes beginning txcd_10. A product with a different code is reported under its own code, not judged.",
    "Stripe Tax status comes from the account's tax settings; 'null' means the settings were unreadable or Stripe Tax was never configured.",
    "Invoice coverage counts charges carrying an invoice id. It is a signal about integration shape, not a verdict — one-off Checkout and Payment Link sales carry no invoice and are supported. The integration type is confirmed by the merchant or by detected Checkout sessions and invoices, never inferred from this figure alone.",
    "MRR covers active subscriptions only and excludes one-off sales. ARR is MRR multiplied by 12 — an extrapolation of the current book, not a forecast and not a record of last year.",
  ],
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
