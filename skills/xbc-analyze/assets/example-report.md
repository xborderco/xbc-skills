<!-- EXAMPLE — illustrative, FICTIONAL data. This file exists to steer tone,
 structure, and honest framing by example (the best way to guide the model). It is
 NOT a template and NOT a source of numbers. When you render a real report, every
 number comes verbatim from xbc-analysis/computed/ — NEVER copy a figure from this
 file. Match the voice and the honesty here, not the data.

 "Lumen Type Co." is a made-up digital-font merchant (head office Germany, Stripe
 Checkout, ~12-month window). Numbers are round and invented.

 Note what this example does NOT do, because that is the part worth copying: it
 never tells the reader what to do, never quantifies a consequence, and says
 plainly where the analysis couldn't reach. -->

How the closing chat message should sound. Short. Five parts. Nothing else. The
report below carries the caveats, so the message does not repeat them.

> Your report: `xbc-analysis/reports/lumen-type-co-report.md`
>
> - MRR $12,400. Estimated ARR $148,800.
> - 2 jurisdictions need attention: the UK and EU OSS.
> - 148 of your 412 EU and UK invoices carry no customer tax number.
> - Your Stripe Checkout setup is one XBC supports today.
>
> I noted 2 questions I couldn't answer: `xbc-analysis/questions.md`.
>
> When you're done: delete `.env`, and delete the restricted key at
> https://dashboard.stripe.com/apikeys.

---

# Tax analysis — Lumen Type Co.

> **Not tax advice.** This is an automated reading of your own Stripe data against
> published registration thresholds. It doesn't know your entity structure, your
> exemptions, or any registrations you already hold. Before you act on anything
> here, take advice from a qualified professional. Generated locally from your own
> Stripe account with a read-only key — nothing was sent to XBorderCo or anywhere
> else, and this report is yours to keep, share, or delete. Analysis window
> 2025-06-01 → 2026-05-31.

**Bottom line:** Two thresholds appear crossed — the UK and EU OSS — covering
$39,600 of revenue in those two markets. A third, Australia, is at about 12% of
its threshold.

## Where your revenue comes from

| Country | Revenue (USD) | % of total | Transactions |
|---|---|---|---|
| Germany (home) | $54,100 | 36.5% | 1,180 |
| United States | $28,300 | 19.1% | 540 |
| United Kingdom | $19,200 | 13.0% | 410 |
| France | $13,050 | 8.8% | 300 |
| Australia | $6,000 | 4.0% | 110 |
| (other, 14 countries) | $27,550 | 18.6% | 600 |

63% of your revenue is cross-border. 91% of charges resolved to a country
(billing address 2,740 · card issuer 120 · customer address 50 · unresolved 230).

## Markets that need attention

| Jurisdiction | Your revenue | Threshold | Status |
|---|---|---|---|
| United Kingdom | £15,140 (≈ $19,200) | £0 — non-resident digital supplies | Needs attention |
| EU OSS (cross-border, excl. Germany) | €20,400 (≈ $22,100) | €10,000 | Needs attention — 204% of threshold |
| Australia | A$9,000 (≈ $6,000) | A$75,000 | Approaching — 12% |
| Japan | — | ¥10,000,000 | Not enough data |
| US — California | $4,100 | $500,000 | Below threshold |

You charged your customers in EUR and USD. The figures above are converted into
each jurisdiction's own currency, because that is the currency its threshold is
written in — you have not invoiced anyone in pounds or Australian dollars. The USD
figure in brackets is the same money again, for comparison only. Conversions use a
single spot rate as of 2026-05-31.

Six other jurisdictions had no revenue in the window and are not listed.

Two of these you are not registered for. The UK has no threshold at all for
non-established businesses supplying digital services — the first sale creates the
obligation. EU OSS has a €10,000 Union micro-threshold measured across your
cross-border EU sales, excluding domestic German ones; you're at roughly double it.

"Crossed" means your data passes the published line. Whether you must register
depends on your entity, your products and any exemptions — a question for a tax
professional. Domestic German VAT is out of scope here.

Japan measures its threshold over a base period two fiscal years back, which this
12-month window doesn't contain, so the analysis can't speak to it either way. It
is reported as insufficient data rather than clear. Re-running with a wider
`--from` would answer it.

## Your invoices and business customers

$45,900 of your revenue arrived on 1,240 paid invoices (31% of charge revenue).
Of those, 412 went to customers whose address resolved to the EU or the UK.

| | Count | Revenue (USD) |
|---|---|---|
| Paid invoices in the window | 1,240 | $45,900 |
| — to EU/UK customers | 412 | $31,200 |
| — of those, carrying a customer tax number | 264 | $14,600 |
| — of those, verified by Stripe (VIES/HMRC) | 116 | $9,400 |
| — of those, not verified by Stripe | 148 | $5,200 |
| — carrying no customer tax number at all | 148 | $16,600 |
| Invoices showing no supplier tax number | 1,240 | $45,900 |

What follows from that:

- B2B customers commonly need your VAT number on the invoice to reclaim the tax at
  their end. An invoice without one can be returned for reissue before it is paid.
- Where a valid VAT number is present on a cross-border EU B2B sale, the sale is
  normally zero-rated under the reverse charge and the customer accounts for the
  tax. That treatment depends on the number being validated and the invoice
  saying so.
- Where no number is present, the sale is generally treated as B2C and taxed at
  the customer's local rate.

This section counts what your invoices carry. It does not classify your customers:
a business customer who never gave you a number looks the same here as a consumer.
"Not verified by Stripe" includes ID types Stripe doesn't check at all — it is not
the same as invalid. And the analysis can't tell you why no supplier tax number
appears on your invoices; registrations held outside Stripe aren't visible to it.

## Your Stripe setup

You have 34 active products, all carrying digital tax codes (`txcd_10000000`), 61
active prices, all tax-inclusive, in 3 currencies, and 620 active subscriptions.
Stripe Tax is not configured on the account. 98.4% of charges in the window carry
an invoice.

Your active subscriptions are worth $12,400 a month, which puts your estimated ARR
at $148,800. That covers active subscriptions only. It excludes one-off sales, and
it does not model discounts or usage-based prices. ARR is this month's book
multiplied by 12 — it is not a forecast and not a record of last year.

You're on Stripe Checkout (`mode: subscription` and `mode: payment`) — a setup XBC
supports today.

What integrating would involve (effort figures are XBorderCo's estimates, not
measurements from completed onboardings):

| Step | Who | Effort |
|---|---|---|
| Install the XBC app from the Stripe App Marketplace | You | Minutes |
| Grant permissions at the OAuth consent screen | You | Minutes |
| Onboarding: terms, business details, tax settings | You | Under an hour |
| Existing subscription renewals | — | Nothing — handled automatically |
| Test transactions per country | Both | 1–2 days |

There's no registration queue to wait in, because on XBorderCo's model the
registrations aren't yours: XBC holds them, files and remits, and is the party
liable for the tax on sales where it acts as the deemed supplier. You keep your
Stripe account, your customers and your payouts, and you remain the supplier of
your product to your customer.

## Which of your markets are covered

| Your market | % of revenue | Status |
|---|---|---|
| United Kingdom | 13.0% | Covered today |
| France | 8.8% | Covered today |
| Australia | 4.0% | Covered today |
| United States | 19.1% | Not covered yet — expected 2027 |
| Germany | 36.5% | Out of scope — your own domestic VAT |
| (11 other countries) | 9.1% | Not in XBC's coverage data — treat as not covered |

On this revenue mix, 25.8% of your revenue sits in markets covered today, and both
jurisdictions that appear crossed are among them. The United States is the largest
single gap: it is 19.1% of your revenue and XBC has no US support until 2027.

Coverage is recorded country by country, not by bloc — an EU member state XBC
hasn't enabled is not covered just because France is.

## Questions this usually raises

**"Should we just turn on Stripe Tax?"** They do different things, and they aren't
mutually exclusive. Stripe Tax calculates the tax due at checkout and monitors your
revenue against registration thresholds — it will tell you where you've crossed
one. It does not register you, file returns, remit the money, or take on the
liability: you remain the party liable for the tax, and you appear on the invoice
as that party. XBC registers, files and remits, and is named as the liable party
on sales where it is the deemed supplier.

## Assumptions and method

- Charge amounts treated as tax-inclusive totals.
- Country attribution: billing address, then card-issuer country, then customer
  address. 230 charges (9%) couldn't be resolved and are excluded from threshold
  tests.
- Each jurisdiction is measured over its own documented window, anchored to the end
  of the analysis window — never to today. Where the data covers less than 95% of a
  jurisdiction's window, a negative result is reported as insufficient data rather
  than clear.
- Thresholds tested in local currency; a single spot rate as of 2026-05-31;
  daily-rate effects not modelled. USD equivalents are for comparison only.
- Invoice counts cover paid invoices only. A customer tax number being present is
  what is counted — no customer is classified as a business.
- Growth is not projected; the figures are what happened in the window.
- Threshold dataset status: prototype starter dataset, 20 of the eventual 80+
  jurisdictions, not yet through authoring review.

## Sources

- HMRC — register for VAT (UK, non-established digital supplies)
- European Commission — VAT One Stop Shop
- Australian Taxation Office — GST on imported services and digital products
- National Tax Agency (Japan) — consumption tax
- California Department of Tax and Fee Administration — Wayfair economic nexus
- Stripe Tax — supported countries and thresholds, and how threshold monitoring
  works, as a cross-check on the above
- FX — single spot rate, retrieved 2026-05-31

## Appendix — configuration detail

| Your pattern | What XBorderCo configures |
|---|---|
| Checkout, `mode: subscription` | `billing_address_collection: "auto"`. The first invoice is created and paid by Stripe in one step and can't be amended afterwards — XBC leaves it alone and points the customer to XBC's own tax invoice through the invoice footer. Renewals are amended automatically, with no configuration. |
| Checkout, `mode: payment` | `billing_address_collection: "auto"`, `customer_creation: "always"`, `payment_intent_data.setup_future_usage: "off_session"` — and do **not** enable `invoice_creation.enabled`, which finalises the invoice before XBC can amend it. |
| Invoice API | `auto_advance: false`, and `address.country` on the customer. |
| Subscription API | A future `billing_cycle_anchor`, `proration_behavior: "none"`, an attached `default_payment_method`, and `address.country` on the customer. |

XBC listens for `invoice.created`. Checkout-originated invoices are handled inline
by the checkout path; API and renewal invoices are paused as drafts. Before acting
it runs a set of gates: whether the invoice was already processed, whether the
merchant and the customer's country are eligible and whether liability sits with
XBC, whether every product classifies to a supported tax code, and whether a
customer tax ID is awaiting verification — in which case the invoice is held rather
than processed. Jurisdiction is decided from an evidence hierarchy rather than a
single address lookup: billing address, payment-instrument country, Stripe's own
location signals, and any customer tax ID, with a validated VAT number driving
reverse-charge treatment. It then calculates and applies the tax, writes its own
sequential tax invoice, and finalises so payment collects as normal. Anything out
of scope is restored untouched.

---
*Threshold data as of 2026-06 · FX as of 2026-05-31 · Not tax advice —
registration decisions need a qualified professional.*

---

**Want to talk any of this through?** Book a call: https://xborderco.com/book-a-call
— or just keep the report; it's yours either way. If you'd like XBC to review your
numbers, share whichever report(s) you choose by attaching them to an email —
nothing is sent automatically.
