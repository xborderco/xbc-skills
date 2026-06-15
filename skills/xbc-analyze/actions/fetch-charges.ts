import type Stripe from "stripe";
import { fetchWindow, writeRaw } from "./_params";

// Page through paid charges in the window and store a trimmed record per
// charge (amounts + the country signals the analyses need). Raw data stays
// on disk in xbc-analysis/raw/ — only a summary is printed.
// npx tsx src/run.ts actions/fetch-charges.ts [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
export default async function fetchCharges(
  stripe: Stripe,
  params: Record<string, string>
) {
  const { from, to, created } = fetchWindow(params);
  const charges = [];
  for await (const ch of stripe.charges.list({ limit: 100, created })) {
    if (!ch.paid) continue;
    charges.push({
      id: ch.id,
      created: new Date(ch.created * 1000).toISOString(),
      amount: ch.amount,
      amount_refunded: ch.amount_refunded,
      currency: ch.currency.toUpperCase(),
      refunded: ch.refunded,
      billing_country: ch.billing_details?.address?.country ?? null,
      billing_state: ch.billing_details?.address?.state ?? null,
      card_country: ch.payment_method_details?.card?.country ?? null,
      customer:
        typeof ch.customer === "string" ? ch.customer : ch.customer?.id ?? null,
      // charge.invoice was removed in newer Stripe API versions — when absent,
      // subscription share is reported as unavailable rather than guessed.
      invoice: extractInvoice(ch),
    });
  }
  const path = writeRaw("charges.json", {
    window: { from: from.toISOString(), to: to.toISOString() },
    charges,
  });
  return { count: charges.length, written_to: path };
}

function extractInvoice(ch: Stripe.Charge): string | null {
  const inv = (ch as Stripe.Charge & { invoice?: string | { id: string } | null })
    .invoice;
  if (!inv) return null;
  return typeof inv === "string" ? inv : inv.id;
}
