import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store each customer's country signals (third tier of country resolution,
// after charge billing country and card issuer country).
// npx tsx src/run.ts actions/fetch-customers.ts
export default async function fetchCustomers(stripe: Stripe) {
  const customers = [];
  for await (const c of stripe.customers.list({ limit: 100 })) {
    customers.push({
      id: c.id,
      address_country: c.address?.country ?? null,
      address_state: c.address?.state ?? null,
      shipping_country: c.shipping?.address?.country ?? null,
    });
  }
  const path = writeRaw("customers.json", { customers });
  return { count: customers.length, written_to: path };
}
