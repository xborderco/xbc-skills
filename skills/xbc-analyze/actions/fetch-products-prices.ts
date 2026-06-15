import type Stripe from "stripe";
import { writeRaw } from "./_params";

// Store the product/price catalog: tax codes (digital-services sanity check),
// currencies and tax_behavior (tax-inclusive vs exclusive pricing).
// npx tsx src/run.ts actions/fetch-products-prices.ts
export default async function fetchProductsPrices(stripe: Stripe) {
  const products = [];
  for await (const p of stripe.products.list({ limit: 100, active: true })) {
    products.push({
      id: p.id,
      name: p.name,
      tax_code: typeof p.tax_code === "string" ? p.tax_code : p.tax_code?.id ?? null,
    });
  }
  const prices = [];
  for await (const pr of stripe.prices.list({ limit: 100, active: true })) {
    prices.push({
      id: pr.id,
      product:
        typeof pr.product === "string" ? pr.product : pr.product?.id ?? null,
      currency: pr.currency.toUpperCase(),
      unit_amount: pr.unit_amount,
      interval: pr.recurring?.interval ?? null,
      tax_behavior: pr.tax_behavior ?? null,
    });
  }
  const path = writeRaw("products-prices.json", { products, prices });
  return { products: products.length, prices: prices.length, written_to: path };
}
