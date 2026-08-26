import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store each customer's country signals (third tier of country resolution,
// after charge billing country and card issuer country) and any tax IDs
// recorded against them, with Stripe's own verification status. Stripe
// validates eu_vat and gb_vat against VIES/HMRC; for other types it reports
// "unavailable", which means NOT CHECKED, not invalid.
// npx tsx src/run.ts actions/fetch-customers.ts
export default async function fetchCustomers(stripe: Stripe) {
  const customers = [];
  let taxIdsExpanded = true;
  try {
    for await (const c of stripe.customers.list({
      limit: 100,
      expand: ["data.tax_ids"],
    })) {
      customers.push(trim(c));
    }
  } catch {
    // The expand needs the customer tax-ID read scope. Without it, fall back to
    // the plain list so country resolution still works — the B2B analysis then
    // reports the tax-ID legs as unavailable rather than as zero.
    taxIdsExpanded = false;
    customers.length = 0;
    for await (const c of stripe.customers.list({ limit: 100 })) {
      customers.push(trim(c));
    }
  }
  const path = writeRaw("customers.json", { tax_ids_expanded: taxIdsExpanded, customers });
  return {
    count: customers.length,
    tax_ids_expanded: taxIdsExpanded,
    written_to: path,
  };
}

function trim(c: Stripe.Customer) {
  return {
    id: c.id,
    address_country: c.address?.country ?? null,
    address_state: c.address?.state ?? null,
    shipping_country: c.shipping?.address?.country ?? null,
    // Expanded lists return at most 10 entries — more than enough per customer,
    // but recorded as a count so the compute can flag any that hit the cap.
    tax_ids: (c.tax_ids?.data ?? []).map((t) => ({
      type: t.type,
      country: t.country ?? null,
      verification_status: t.verification?.status ?? null,
    })),
  };
}
