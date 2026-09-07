// Invoicing and business-customer facts, counted from the merchant's own
// invoices. Every figure here is a COUNT or a SUM of what the invoices carry —
// nothing infers whether a customer is a business, and nothing infers why a
// tax number is absent.
// Reads:  raw/invoices.json, raw/customers.json, raw/charges.json,
//         assets/fx-rates.json
// Writes: computed/invoice-b2b.json
//   npx tsx compute/invoice-b2b.ts
import {
  convert,
  EU_MEMBERS,
  netMajor,
  readAsset,
  readRaw,
  readRawOptional,
  toMajor,
  writeComputed,
  type ChargeRecord,
  type CustomerRecord,
  type FxRates,
  type InvoiceRecord,
} from "./_shared";

// On the CSV path there is no invoices.json at all: a payments export carries no
// customer tax IDs, so this section cannot be produced. Exit cleanly and say so,
// the same way market-coverage.ts reports blocked coverage data. A hard crash
// here would stop the whole run over a section that was never possible.
const rawInvoices = readRawOptional<{
  _meta?: { key_mode?: string; source?: string };
  window: { from: string; to: string };
  invoices: InvoiceRecord[];
}>("invoices.json");
if (rawInvoices === null) {
  const path = writeComputed("invoice-b2b.json", {
    status: "unavailable",
    reason: "no_invoice_data",
    has_invoice_data: false,
    detail:
      "Invoices were not fetched. A Stripe payments CSV export carries no customer tax IDs, so the invoicing and business-customer section cannot be produced from it.",
    instruction:
      "Omit the 'Your invoices and business customers' section from the report entirely.",
  });
  console.log(
    JSON.stringify(
      { status: "unavailable", reason: "no invoice data — section omitted", written_to: path },
      null,
      2
    )
  );
  process.exit(0);
}
const { invoices, window } = rawInvoices;
const keyMode = rawInvoices._meta?.key_mode ?? "unknown";
const rawCustomers = readRaw<{
  tax_ids_expanded?: boolean;
  customers: CustomerRecord[];
}>("customers.json");
const taxIdsAvailable = rawCustomers.tax_ids_expanded !== false;
const rawCharges = readRaw<{
  invoice_link_available?: boolean;
  charges: ChargeRecord[];
}>("charges.json");
const charges = rawCharges.charges;
const fx = readAsset<FxRates>("fx-rates.json");

const round = (n: number) => Math.round(n * 100) / 100;

// Verified tax IDs come from Stripe's own check (VIES for eu_vat, HMRC for
// gb_vat). "unavailable" means Stripe does not validate that ID type — it is
// not a failed check, and is never counted as one.
const verifiedByCustomer = new Map<string, boolean>();
for (const c of rawCustomers.customers) {
  const ids = c.tax_ids ?? [];
  if (ids.length > 0) {
    verifiedByCustomer.set(
      c.id,
      ids.some((t) => t.verification_status === "verified")
    );
  }
}

interface Bucket {
  count: number;
  revenue_usd: number;
}
const empty = (): Bucket => ({ count: 0, revenue_usd: 0 });
const add = (b: Bucket, usd: number) => {
  b.count += 1;
  b.revenue_usd += usd;
};

const all = empty();
const euUk = empty();
const euUkWithTaxId = empty();
const euUkTaxIdVerified = empty();
const euUkTaxIdUnverified = empty();
const euUkNoTaxId = empty();
const noSupplierTaxId = empty();
let fxMissing = 0;

// Only invoices that were actually paid: a draft or void invoice is not
// revenue and should not appear in a revenue count.
const paid = invoices.filter((i) => i.status === "paid" && i.amount_paid > 0);

for (const inv of paid) {
  const usd = convert(
    toMajor(inv.amount_paid, inv.currency),
    inv.currency,
    "USD",
    fx
  );
  if (usd === null) {
    fxMissing += 1;
    continue;
  }
  add(all, usd);
  if (inv.supplier_tax_id_count === 0) add(noSupplierTaxId, usd);

  const country = inv.customer_country;
  const inEuUk = country !== null && (EU_MEMBERS.has(country) || country === "GB");
  if (!inEuUk) continue;
  add(euUk, usd);

  if (inv.customer_tax_ids.length > 0) {
    add(euUkWithTaxId, usd);
    const verified =
      inv.customer !== null && verifiedByCustomer.get(inv.customer) === true;
    add(verified ? euUkTaxIdVerified : euUkTaxIdUnverified, usd);
  } else {
    add(euUkNoTaxId, usd);
  }
}

// Invoice-backed share of charge revenue. charge.invoice was removed in newer
// Stripe API versions; when every charge comes back without one but paid
// invoices exist, the link is unavailable rather than genuinely absent — say so
// instead of reporting 0%.
let chargeRevenueUsd = 0;
let invoiceBackedUsd = 0;
let invoiceBackedCount = 0;
for (const ch of charges) {
  const usd = convert(netMajor(ch), ch.currency, "USD", fx);
  if (usd === null) continue;
  chargeRevenueUsd += usd;
  if (ch.invoice) {
    invoiceBackedUsd += usd;
    invoiceBackedCount += 1;
  }
}
const invoiceLinkAvailable =
  rawCharges.invoice_link_available ??
  (invoiceBackedCount > 0 || paid.length === 0);

const warnings: string[] = [];
if (keyMode === "test") {
  warnings.push(
    "TEST MODE DATA: invoice and tax-ID figures come from simulated data and are not a picture of the real account."
  );
}
if (!taxIdsAvailable) {
  warnings.push(
    "Customer tax IDs could not be read (the restricted key lacks the scope), so no invoice can be shown as carrying a VERIFIED tax number. Tax-ID counts below reflect only what is recorded on the invoices themselves."
  );
}
if (!invoiceLinkAvailable) {
  warnings.push(
    "This Stripe API version does not return the invoice link on charges, so invoice-backed revenue share cannot be computed. Invoice counts and values below are unaffected."
  );
}
if (fxMissing > 0) {
  warnings.push(
    `${fxMissing} invoice(s) excluded — no FX rate bundled for their currency.`
  );
}

const finalize = (b: Bucket) => ({
  count: b.count,
  revenue_usd: round(b.revenue_usd),
});

const path = writeComputed("invoice-b2b.json", {
  status: "ok",
  key_mode: keyMode,
  window,
  fx_as_of: fx._meta.as_of,
  // The report section renders only when this is true. A merchant with no paid
  // invoices has nothing to say here and should not be shown an empty section.
  has_invoice_data: paid.length > 0,
  customer_tax_ids_readable: taxIdsAvailable,
  invoice_link_on_charges_available: invoiceLinkAvailable,
  invoice_backed_share: invoiceLinkAvailable
    ? {
        revenue_usd: round(invoiceBackedUsd),
        charge_count: invoiceBackedCount,
        pct_of_charge_revenue:
          chargeRevenueUsd > 0
            ? round((invoiceBackedUsd / chargeRevenueUsd) * 100)
            : 0,
      }
    : null,
  paid_invoices: finalize(all),
  eu_uk_customers: finalize(euUk),
  eu_uk_with_customer_tax_id: finalize(euUkWithTaxId),
  eu_uk_tax_id_stripe_verified: finalize(euUkTaxIdVerified),
  eu_uk_tax_id_not_verified: finalize(euUkTaxIdUnverified),
  eu_uk_no_customer_tax_id: finalize(euUkNoTaxId),
  invoices_without_supplier_tax_number: finalize(noSupplierTaxId),
  ...(warnings.length > 0 && { warnings }),
  methodology_notes: [
    "Counts cover invoices with status 'paid' and a non-zero amount paid, created inside the analysis window. Drafts, voided and uncollectible invoices are excluded.",
    "'EU/UK customers' means the invoice's own customer address resolved to an EU member state or the UK. Invoices with no customer address are excluded from that leg.",
    "A customer tax ID being present on an invoice is what is counted. This analysis does NOT classify customers as businesses — a business customer who never supplied a number is indistinguishable here from a consumer.",
    "'Stripe verified' means Stripe's own validation returned verified (VIES for EU VAT, HMRC for UK VAT). Stripe does not validate every ID type; types it does not check are counted as not verified, which is not the same as invalid.",
    "'No supplier tax number' means the invoice carried no account tax ID. The reason is not determinable from this data — registrations held outside Stripe are not visible here.",
  ],
});
console.log(JSON.stringify({ status: "ok", written_to: path }, null, 2));
