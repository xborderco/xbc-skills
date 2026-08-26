import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store the subscription mix. Quantity and interval_count are kept because the
// recurring-revenue figure needs them: a price of 100 at interval_count 3 is not
// the same monthly amount as a price of 100 at interval_count 1.
// npx tsx src/run.ts actions/fetch-subscriptions.ts
export default async function fetchSubscriptions(stripe: Stripe) {
  const subscriptions = [];
  for await (const s of stripe.subscriptions.list({
    limit: 100,
    status: "all",
  })) {
    subscriptions.push({
      id: s.id,
      status: s.status,
      currency: s.currency?.toUpperCase() ?? null,
      created: new Date(s.created * 1000).toISOString(),
      items: s.items.data.map((it) => ({
        price: it.price.id,
        unit_amount: it.price.unit_amount,
        currency: it.price.currency?.toUpperCase() ?? null,
        interval: it.price.recurring?.interval ?? null,
        interval_count: it.price.recurring?.interval_count ?? null,
        quantity: it.quantity ?? null,
      })),
    });
  }
  const path = writeRaw("subscriptions.json", { subscriptions });
  return { count: subscriptions.length, written_to: path };
}
