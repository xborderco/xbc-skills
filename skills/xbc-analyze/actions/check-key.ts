import type Stripe from "stripe";

// Verify the restricted key before any analysis runs.
// 1. Read-only proof: a DELETE on a customer id that cannot exist. This can
//    never mutate anything. A read-only key gets a 403 permission error (good);
//    a key with write access gets a 404 resource_missing (we reject it loudly).
// 2. Scope check: one limit=1 read per resource the analyses need, reported
//    as granted/missing so a partial key fails here, not mid-analysis.
// npx tsx src/run.ts actions/check-key.ts
export default async function checkKey(stripe: Stripe) {
  const key = process.env.STRIPE_API_KEY ?? "";
  const mode = key.startsWith("rk_live_") ? "live" : "test";

  let readOnly: boolean | "unknown" = "unknown";
  try {
    await stripe.customers.del("cus_xbc_readonly_probe_does_not_exist");
    readOnly = false; // a successful delete is impossible, but be explicit
  } catch (err) {
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 401) {
      return {
        key_mode: mode,
        ok: false,
        error: "authentication_failed",
        hint: "The key was loaded from .env but Stripe rejected it. Check for a copy-paste error, or create a fresh restricted key and update .env.",
      };
    }
    if (e.statusCode === 403) readOnly = true;
    else if (e.statusCode === 404 || e.code === "resource_missing")
      readOnly = false;
  }

  const probes: Record<string, () => Promise<unknown>> = {
    charges: () => stripe.charges.list({ limit: 1 }),
    customers: () => stripe.customers.list({ limit: 1 }),
    subscriptions: () => stripe.subscriptions.list({ limit: 1 }),
    products: () => stripe.products.list({ limit: 1 }),
    prices: () => stripe.prices.list({ limit: 1 }),
    balance_transactions: () => stripe.balanceTransactions.list({ limit: 1 }),
    tax_registrations: () => stripe.tax.registrations.list({ limit: 1 }),
    tax_settings: () => stripe.tax.settings.retrieve(),
  };

  const scopes: Record<string, "granted" | "missing"> = {};
  for (const [name, probe] of Object.entries(probes)) {
    try {
      await probe();
      scopes[name] = "granted";
    } catch {
      scopes[name] = "missing";
    }
  }

  const missing = Object.entries(scopes)
    .filter(([, v]) => v === "missing")
    .map(([k]) => k);

  // Optional nicety: account display name for report headers (needs the
  // Account read scope; absence is fine — the agent asks the user instead).
  let accountName: string | null = null;
  try {
    const acct = await stripe.accounts.retrieve();
    accountName =
      acct.business_profile?.name ??
      acct.settings?.dashboard?.display_name ??
      null;
  } catch {
    // scope not granted — not required
  }

  return {
    key_mode: mode,
    account_name: accountName,
    read_only_verified: readOnly,
    scopes,
    ok: readOnly === true && missing.length === 0,
    ...(readOnly !== true && {
      warning:
        "KEY IS NOT VERIFIED READ-ONLY. Stop, delete this key in the Stripe dashboard, and create a restricted key with Read-only permissions (see SKILL.md).",
    }),
    ...(missing.length > 0 && {
      missing_scopes: missing,
      hint: "Edit the restricted key in the Stripe dashboard and grant Read on the missing resources, or proceed with only the analyses these scopes allow.",
    }),
  };
}
