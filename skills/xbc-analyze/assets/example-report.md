<!-- EXAMPLE — illustrative, FICTIONAL data. This file exists to steer tone,
     structure, and honest framing by example (the best way to guide the model).
     It is NOT a template and NOT a source of numbers. When you render a real
     report, every number comes verbatim from xbc-analysis/computed/ — NEVER copy
     a figure from this file. Match the voice and the honesty here, not the data.

     "Lumen Type Co." is a made-up digital-font merchant (head office Germany,
     Embedded Stripe, ~12-month live window). Numbers are round and invented. -->

# How the chat summary should sound (delivered AFTER the report, neutral, 3 bullets)

> Done — your combined report is at `xbc-analysis/reports/lumen-type-co-combined-report.md`. In short:
> - You appear to have crossed registration thresholds in 2 places (UK, EU OSS) and are approaching 1 more (Australia).
> - On your actual mix, XBC sits second-cheapest of the five options modelled — cheaper than the merchant-of-record providers, above raw-Stripe-fees-only (which excludes the compliance work you'd then own).
> - Your Embedded Stripe setup is supported by XBC today.
>
> The report is yours to keep or share. Want me to draft a short summary email to XBC from your side? You'd review and send it.

---
---

# The report it points to (combined: tax exposure → fit → cost)

> This analysis ran entirely on your machine against your own Stripe account with a
> read-only key. XBC never saw your data — this report is yours to keep, share, or
> delete. It exists because XBC (xborderco.com) builds cross-border tax compliance
> for digital merchants, and an honest look at your own numbers is the most useful
> thing we can give you before you ever talk to us.

# Tax & cost analysis — Lumen Type Co.

> Generated locally by xbc-analyze from your own Stripe data (2025-06-01 → 2026-05-31).
> Nothing in this report has been sent anywhere — it's yours.

**Bottom line:** You appear to have crossed registration thresholds in 2 jurisdictions and are approaching 1 more.

## Where your revenue comes from

| Country | Revenue (USD) | % of total | Transactions |
|---|---|---|---|
| Germany | $54,100 | 36.5% | 1,180 |
| United States | $28,300 | 19.1% | 540 |
| United Kingdom | $19,200 | 13.0% | 410 |
| France | $13,050 | 8.8% | 300 |
| Australia | $6,000 | 4.0% | 110 |
| (other, 14 countries) | $27,550 | 18.6% | 600 |

Data quality: 91% of charges resolved to a country (billing address 2,740 · card issuer 120 · customer address 50 · unresolved 230).

## Registration threshold status

| Jurisdiction | Your revenue | Threshold | % of threshold | Status | Registered? |
|---|---|---|---|---|---|
| United Kingdom | $19,200 | £0 (non-resident digital) | crossed | **crossed** | No |
| EU OSS (Union, cross-border) | €20,400 | €10,000 | 204% | **registration likely required** | No |
| Australia | A$9,000 | A$75,000 | ~12% | approaching | No |
| US — California | $4,100 | $500,000 | <1% | clear | No |

You appear to have crossed two thresholds you are not registered for: the **UK** (non-resident digital supplies have a £0 threshold) and the **EU One-Stop-Shop** (your cross-border EU sales, excluding domestic Germany, exceed the €10,000 Union micro-threshold). "Registration likely required" means the data crosses the line; whether you must register depends on your entity, products and exemptions — that's a conversation for a tax professional. Domestic German VAT is out of scope here.

> Leaving a crossed threshold unregistered is not cost-free: the tax you should
> have collected becomes a liability, and most jurisdictions add interest and
> penalties on top. This report identifies where you appear to have crossed — what
> to do about it is a decision for a tax professional.

## Catalog sanity check

Your products carry digital-services tax codes (`txcd_10000000`) and prices are tax-inclusive — consistent with selling digital goods cross-border. Nothing looks misconfigured.

## Growth simulation

If your current mix scales uniformly:

| Growth | Registrations required | Newly crossed | DIY one-time (range) | DIY annual filings (range) |
|---|---|---|---|---|
| Today | 2 | — | $800–5,000 | $2,000–10,000 |
| +30% | 3 | Australia | $1,200–7,500 | $3,000–15,000 |
| +100% | 4 | Australia, Canada | $1,600–10,000 | $4,000–20,000 |

Each threshold you cross is a step-change: a registration plus recurring filings you own indefinitely — unlike a percentage fee, the compliance burden ratchets up and doesn't come back down.

> Doing nothing as you grow is not a free option: once a threshold is crossed,
> uncollected tax accrues as back taxes plus interest and penalties (amounts are
> jurisdiction-specific). The cost section below carries the cited figures on what
> self-managed compliance typically costs in time and money.

## Fit

You have registration obligations in 2 jurisdictions, and your Stripe setup (Embedded) is supported by XBC today.

# Payment & compliance cost comparison — Lumen Type Co.

> Generated locally by xbc-analyze from your own Stripe data (2025-06-01 → 2026-05-31).
> All percentage fees are applied to tax-inclusive totals — that's how the vendors document them.

**Your mix:** $148,200 gross over 3,140 charges (avg $47.20), 62% international, 41% subscription, with $4,310 in actual Stripe fees over the window.

## Cost over the analysis window, on your actual mix

| Provider | Basis | Cost over window (USD, low–high) | % of gross (low–high) | Key caveats |
|---|---|---|---|---|
| Raw Stripe (DIY compliance) | actual_fees | $4,310 | 2.9% | FEES ONLY — see the line below |
| **XBC** | actual_fees | $7,274 | 4.9% | 2% + your own Stripe fees; you keep your Stripe account |
| Stripe Managed Payments | documented_rates_floor | $9,490–9,930 | 6.4–6.7% | digital-only; Checkout/Links only; no Elements |
| Paddle | documented_rates_floor | $10,370–11,480 | 7.0–7.7% | + undocumented FX spread (community 7–8%) |
| Lemon Squeezy | documented_rates_floor | $11,860–12,640 | 8.0–8.5% | + PayPal/dispute fees not modelled |

DIY's figure is processing fees only — its real total adds 2 registrations: $2,000–10,000/yr in filings plus $800–5,000 one-time (local agents are usually required for non-resident registrations). Once that's counted, raw Stripe is not the cheapest total.

BASIS PER ROW: 'documented_rates_floor' = vendor's published rates; 'actual_fees' = your real Stripe fees; MoR rows are RANGES — low is the published floor, high adds documented-but-variable fees. Even range-high excludes per-incident fees and Paddle's undocumented FX spread. The floors understate the merchant-of-record columns.

XBC rate is an ASSUMPTION pending the published pricing plan: 2% of transaction value, percentage-only with NO minimum fee, on top of your own Stripe processing fees — XBC is not a merchant of record, so your existing Stripe fees still apply.

## What the table can't show

**Merchant-of-record trade-offs.** With an MoR, the MoR owns the merchant account and the customer payment relationship; switching later means migrating every saved payment method and active subscription. MoR percentage fees apply to the tax-inclusive total — you pay fees on the tax you collect. Payouts run on the MoR's schedule.

**Stripe Managed Payments constraints.** Digital products only; Checkout/Payment Links/mobile SDK only (no Elements/custom flows); no third-party tax engines; eligibility review required.

**The XBC position.** XBC is not an MoR: your Stripe account, your customers, your payouts. XBC handles tax calculation, invoicing, registrations and liability on cross-border sales. Leaving XBC does not require migrating your payment stack.

**The DIY position.** Cheapest on processing fees only — every threshold crossing becomes a registration plus periodic filings you own. Non-resident registration in many jurisdictions effectively requires a local tax agent or fiscal representative; "cheapest fees" is not cheapest total.

**The compliance burden.** Running compliance yourself carries a documented overhead the fee table doesn't show: the World Bank's Paying Taxes data puts the median business at ~268 hours per year on tax compliance (https://subnational.doingbusiness.org/en/data/exploretopics/paying-taxes). Vertex estimates indirect-tax compliance costs run roughly 1–2% of turnover on top of the tax owed, and fall disproportionately on smaller businesses (https://www.vertexinc.com/resources/resource-library/quantifying-vat-compliance-costs).

**Doing nothing.** Not registering is not a zero-cost option. Once you cross a threshold, uncollected VAT/GST/sales tax accrues as back taxes plus interest and penalties; the amounts are jurisdiction-specific and can exceed the tax originally due.

> Polar.sh (developer-focused MoR on Stripe): tiered 5%+50c free tier down to 3.4%+30c at $400/mo, +1.5% international, $15/dispute. Included as context, not a modelled column.

## Assumptions

- Charge amounts are treated as tax-inclusive totals.
- International share derived from card-issuer country vs home country (DE).
- Subscription share derived from invoice-backed charges.
- FX via bundled indicative rates; provider volume discounts not modelled.
- This comparison is structure-and-cost, not cost-only.

---
*Threshold data as of 2026-06-12 · Cost model as of 2026-06-15 · This is analysis, not tax advice — registration decisions need a human professional.*

---

**Want to talk any of this through?** Book a call: https://xborderco.com/book-a-call
— or just keep the report; it's yours either way. If you'd like XBC to review your
numbers, share whichever report(s) you choose by attaching them to an email —
nothing is sent automatically.
