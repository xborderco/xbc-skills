import type Stripe from "stripe";
import { fetchWindow, writeRaw } from "./_params";

// Page through invoices in the window and store a trimmed record per invoice:
// the amounts, the customer's country, the tax numbers recorded ON the invoice
// (customer side and supplier side). This is what the B2B invoicing analysis
// counts — it never infers a customer's business status, it only reports what
// the invoice carries.
// npx tsx src/run.ts actions/fetch-invoices.ts [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
export default async function fetchInvoices(
  stripe: Stripe,
  params: Record<string, string>
) {
  const { from, to, created } = fetchWindow(params);
  const invoices = [];
  for await (const inv of stripe.invoices.list({ limit: 100, created })) {
    invoices.push({
      id: inv.id ?? null,
      created: new Date(inv.created * 1000).toISOString(),
      status: inv.status ?? null,
      billing_reason: inv.billing_reason ?? null,
      currency: inv.currency.toUpperCase(),
      total: inv.total,
      amount_paid: inv.amount_paid,
      customer:
        typeof inv.customer === "string"
          ? inv.customer
          : inv.customer?.id ?? null,
      customer_country: inv.customer_address?.country ?? null,
      // Tax numbers as recorded on the invoice itself. customer_tax_ids is what
      // the buyer supplied; account_tax_ids is the supplier number shown on the
      // document (null/empty when the merchant has none configured).
      customer_tax_ids: (inv.customer_tax_ids ?? []).map((t) => ({
        type: t.type ?? null,
        value: t.value ?? null,
      })),
      supplier_tax_id_count: countAccountTaxIds(inv),
    });
  }
  const path = writeRaw("invoices.json", {
    window: { from: from.toISOString(), to: to.toISOString() },
    invoices,
  });
  return { count: invoices.length, written_to: path };
}

function countAccountTaxIds(inv: Stripe.Invoice): number {
  const ids = inv.account_tax_ids;
  return Array.isArray(ids) ? ids.length : 0;
}
