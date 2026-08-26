import type Stripe from "stripe";
import { fetchWindow, writeRaw } from "./_params";

// How the merchant actually takes payments, read from their account instead of
// asked in chat. A finance lead cannot reliably answer "Payment Links or Hosted
// Checkout or Elements?" — but the account knows.
//
// ui_mode separates hosted from embedded. A session with payment_link set came
// from a Payment Link. Sessions with invoice_creation enabled are the one
// unsupported Checkout configuration, and it is worth catching.
// npx tsx src/run.ts actions/fetch-checkout-config.ts [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
export default async function fetchCheckoutConfig(
  stripe: Stripe,
  params: Record<string, string>
) {
  const { from, to, created } = fetchWindow(params);

  const modes: Record<string, number> = {};
  const uiModes: Record<string, number> = {};
  let sessions = 0;
  let fromPaymentLink = 0;
  let withInvoiceCreation = 0;
  try {
    for await (const s of stripe.checkout.sessions.list({ limit: 100, created })) {
      sessions += 1;
      const mode = s.mode ?? "unknown";
      modes[mode] = (modes[mode] ?? 0) + 1;
      const ui = s.ui_mode ?? "hosted";
      uiModes[ui] = (uiModes[ui] ?? 0) + 1;
      if (s.payment_link) fromPaymentLink += 1;
      if (s.invoice_creation?.enabled === true) withInvoiceCreation += 1;
    }
  } catch {
    // Checkout scope not granted — report as unreadable, never as zero.
    const path = writeRaw("checkout-config.json", {
      window: { from: from.toISOString(), to: to.toISOString() },
      readable: false,
      note: "The restricted key has no Checkout read scope, so the integration type could not be detected from the account.",
    });
    return { readable: false, written_to: path };
  }

  let paymentLinks = 0;
  let paymentLinksReadable = true;
  try {
    for await (const _ of stripe.paymentLinks.list({ limit: 100 })) {
      paymentLinks += 1;
    }
  } catch {
    paymentLinksReadable = false;
  }

  const path = writeRaw("checkout-config.json", {
    window: { from: from.toISOString(), to: to.toISOString() },
    readable: true,
    checkout_sessions: sessions,
    sessions_by_mode: modes,
    sessions_by_ui_mode: uiModes,
    sessions_from_payment_link: fromPaymentLink,
    sessions_with_invoice_creation: withInvoiceCreation,
    payment_links_defined: paymentLinksReadable ? paymentLinks : null,
  });
  return {
    checkout_sessions: sessions,
    sessions_from_payment_link: fromPaymentLink,
    payment_links_defined: paymentLinksReadable ? paymentLinks : null,
    written_to: path,
  };
}
