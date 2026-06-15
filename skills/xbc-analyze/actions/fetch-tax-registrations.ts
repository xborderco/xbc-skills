import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store existing Stripe Tax registrations (feeds the registered-vs-exposed
// gap in the threshold analysis). Accounts without Stripe Tax return empty.
// npx tsx src/run.ts actions/fetch-tax-registrations.ts
export default async function fetchTaxRegistrations(stripe: Stripe) {
  const registrations = [];
  try {
    for await (const r of stripe.tax.registrations.list({ limit: 100 })) {
      // country_options carries the registration TYPE (standard vs OSS
      // schemes) and, for the US, the state — both needed so a domestic
      // registration is never mistaken for OSS coverage, nor one state's
      // registration for all states'.
      const opts = (r.country_options ?? {}) as Record<
        string,
        { type?: string; state?: string }
      >;
      const detail = opts[r.country.toLowerCase()] ?? {};
      registrations.push({
        id: r.id,
        country: r.country,
        state: detail.state ?? null,
        type: detail.type ?? null,
        status: r.status,
        active_from: r.active_from
          ? new Date(r.active_from * 1000).toISOString()
          : null,
      });
    }
  } catch {
    // Tax scope missing or product unused — report as none, don't crash.
  }
  const path = writeRaw("tax-registrations.json", { registrations });
  return { count: registrations.length, written_to: path };
}
