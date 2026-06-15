import type Stripe from "stripe";
import { fetchWindow, writeRaw } from "./_params";

// Store balance transactions (actual Stripe fees paid + FX) — the honest
// baseline for the cost comparison.
// npx tsx src/run.ts actions/fetch-balance-transactions.ts [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
export default async function fetchBalanceTransactions(
  stripe: Stripe,
  params: Record<string, string>
) {
  const { from, to, created } = fetchWindow(params);
  const transactions = [];
  for await (const t of stripe.balanceTransactions.list({
    limit: 100,
    created,
  })) {
    transactions.push({
      id: t.id,
      created: new Date(t.created * 1000).toISOString(),
      type: t.type,
      amount: t.amount,
      fee: t.fee,
      currency: t.currency.toUpperCase(),
      exchange_rate: t.exchange_rate,
    });
  }
  const path = writeRaw("balance-transactions.json", {
    window: { from: from.toISOString(), to: to.toISOString() },
    transactions,
  });
  return { count: transactions.length, written_to: path };
}
