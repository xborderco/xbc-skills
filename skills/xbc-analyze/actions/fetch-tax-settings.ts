import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store Stripe Tax settings: head-office country (home-country signal for the
// cost model) and default tax behaviour. Absent/unused tax setups are fine.
// npx tsx src/run.ts actions/fetch-tax-settings.ts
export default async function fetchTaxSettings(stripe: Stripe) {
  let settings: {
    head_office_country: string | null;
    default_tax_behavior: string | null;
    status: string | null;
  } = { head_office_country: null, default_tax_behavior: null, status: null };
  try {
    const s = await stripe.tax.settings.retrieve();
    settings = {
      head_office_country: s.head_office?.address?.country ?? null,
      default_tax_behavior: s.defaults?.tax_behavior ?? null,
      status: s.status ?? null,
    };
  } catch {
    // Tax scope missing or product unused — store nulls, don't crash.
  }
  const path = writeRaw("tax-settings.json", settings);
  return { ...settings, written_to: path };
}
