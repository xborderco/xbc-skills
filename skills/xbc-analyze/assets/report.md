<!-- TEMPLATE: the agent fills {{tokens}} from files in xbc-analysis/computed/.
     Numbers come from that JSON verbatim — never recalculate, never estimate,
     never carry a figure across from assets/example-report.md.

     Two sections are CONDITIONAL and are dropped entirely, heading and all,
     when their data isn't there: "Your invoices and business customers" and
     "Which of your markets are covered". An empty section is worse than no
     section — it implies a measurement that wasn't made.

     Working rule for anything you write into the gaps: state what the data
     shows. Do not tell the reader what it means for them, what they should do
     about it, or how to feel about it.

     LENGTH. assets/example-report.md is the budget, section by section. If a
     section you have written is longer than the same section in the example, it
     is too long. Cut it. The example is not a floor to build on.

     NEVER PUT THESE IN THE REPORT. They are internal, and they leaked into an
     earlier run:
       - JSON field names (revenue_usd_equivalent, insufficient_data, fx_as_of).
         Write the plain-English meaning instead.
       - Any `_meta.needs_signoff` note, any `supersedes` note, any "PRD open
         item" reference. Follow those notes silently; do not report them.
       - Statements that a figure was NOT computed, unless a section depends on
         it. "The cross-border share was not computed" tells the reader nothing.
       - The same sentence twice. Check the report for repeats before you save.
       - ANY HTML tag inside a markdown table cell — `<br>`, `<b>`, anything.
         Table cells do not reliably render it, and an earlier report printed the
         literal text "<br>" in every row of its main table. If a cell needs two
         facts, put them on one line in brackets. -->

<!-- DEDUPE THE WARNINGS. Four compute scripts each emit their own test-mode
     warning in near-identical words. Rendering all of them produced five copies
     of the same sentence in one report. Collect the warnings from every computed
     file, remove the duplicates and the near-duplicates, and render what is left
     ONCE. If the TEST MODE banner is already at the top of the report, drop every
     test-mode warning — the banner has said it. -->

# Tax analysis — {{MERCHANT_NAME_OR_ACCOUNT}}

{{TEST_MODE_BANNER — REQUIRED when any computed file has key_mode "test": render exactly
"> ⚠️ **TEST MODE DATA** — fees are simulated at US pricing and test cards are always
> US-issued; country attribution, international share and fee totals are artifacts.
> Re-run with a live-mode restricted key for real numbers." Omit entirely in live mode.}}

{{NOT_TAX_ADVICE_BLOCK — verbatim from assets/cta-copy.md. Pick version A or B by
checking `_meta.source` in the computed files: "csv_import" means version B. The
provenance sentence must be true — version A claims a read-only key was used, and
on the CSV path no key exists. Then append: "Analysis window {{WINDOW_FROM}} →
{{WINDOW_TO}}."}}

**Bottom line:** {{HEADLINE — TWO SENTENCES MAXIMUM. Name the jurisdictions in
summary.actionable_unregistered and the revenue behind them from
at_risk_revenue_usd: "covering $X of revenue in those markets". Never "revenue
that should have been taxed", never "$X of tax owed" — read at_risk_revenue_meaning
first. A second sentence may name the closest approaching jurisdiction. Nothing
else goes here: no insufficient-data count, no registration status, no hedging
clause. If nothing is actionable, say that in one sentence.}}

## Where your revenue comes from

| Country | Revenue (USD) | % of total | Transactions |
|---|---|---|---|
{{TOP_COUNTRY_ROWS — up to 10, from country-breakdown.countries}}

{{RESOLUTION_LINE — ONE line: "{{RESOLVED_PCT}}% of charges resolved to a country
(billing address N · card issuer N · customer address N · unresolved N)." Do not
explain the fallback order here — it is already in Assumptions. Do not state that
the cross-border share was not computed; say nothing about figures that were not
produced. Omit the whole line if resolution was 100% and nothing was unresolved.}}

## Markets that need attention

| Jurisdiction | Your revenue | Threshold | Status |
|---|---|---|---|
{{THRESHOLD_ROWS — SELECT, do not dump. An earlier run rendered 20 rows, 14 of
them with zero revenue, and the table said nothing.

Include a row ONLY if it meets one of these:
  - status is crossed or registration_likely_required, or
  - status is approaching, or
  - revenue in that jurisdiction is above zero.
A jurisdiction with no revenue carries no information. Leave it out.

Then, in one line under the table, account for what you left out: "N other
jurisdictions had no revenue in the window and are not listed."

CURRENCY. Three currencies are in play and showing only one made an earlier
report unreadable: a reader saw "₩263,047.50" for a merchant who has never billed
in won, and assumed the analysis was broken.

Revenue and threshold go in the jurisdiction's own currency, side by side, because
that is the comparison the row exists to make. Put the USD equivalent after it in
brackets, ON THE SAME LINE:

  | South Korea | ₩263,048 (≈ $194.85) | ₩0 | Needs attention |

Do NOT use `<br>` to split the cell. Markdown table cells do not reliably render
inline HTML — an earlier report printed the literal text "<br>" in every row.
Never put any HTML tag in a table cell.

OMIT the bracket when the jurisdiction's currency IS USD. "$34.78 (≈ $34.78)" is
noise. US state rows and any other USD jurisdiction show one figure only.

Then, directly under the table, one line naming what the merchant actually
charged in, from each row's `charged_in`:

  "You charged in EUR and USD. Figures above are converted to each
  jurisdiction's own currency, because that is the currency its threshold is
  written in."

If any rendered row has `local_currency_is_derived` true, say so in that same
line: the local figure is a conversion of their own charges, not an amount they
ever invoiced. Do not add a separate USD column, and do not list USD equivalents
in a trailing paragraph.

Status in PLAIN ENGLISH, never the raw JSON value. These labels follow Stripe
Tax's own Dashboard vocabulary, so a merchant who checks both sees one language:
  registration_likely_required → "Needs attention"
  crossed                      → "Needs attention — N% of threshold"
  approaching                  → "Approaching — N%"
  insufficient_data            → "Not enough data"
  clear                        → "Below threshold"
A row whose status is crossed or likely BUT which has an active Stripe Tax
registration does NOT need attention — label it "Registered". Stripe treats an
active registration as "Collecting tax", not as an open item, and saying a
merchant must act where they have already acted destroys trust in the rest.

Never write "you need to register" or "registration required". XBorderCo holds
the registrations for merchants who use it, so the report must not assume the
merchant is the party who registers. State the threshold fact; leave the actor
open.
Put the Stripe Tax registration status in its own column only if at least one row
differs; otherwise say it once in the paragraph below.}}

Thresholds are tested in local currency; conversions use a single spot rate as of {{FX_AS_OF}}.

{{ACTIONABLE_PARAGRAPH — plain English on summary.actionable_unregistered, with
each row's own note. Say what "needs attention" means: the sales data passes the
published threshold, so tax is likely due there and someone has to be registered
and remitting. Whether that duty falls on them, and who carries it, depends on
their entity, their products and any exemptions — a question for a tax
professional. Do not sequence their decisions, and do not say they must register.}}

{{INSUFFICIENT_DATA_PARAGRAPH — REQUIRED if any row has status insufficient_data,
but keep it to THREE SENTENCES. Group the jurisdictions by cause; do not list ten
US states one by one when one cause covers them all. Say what would answer them.
Silence here reads as an all-clear that was never computed — but a paragraph this
long buries the finding above it.}}

{{WARNINGS — deduplicated, per the note at the top of this file. One bullet per
distinct warning. Drop every test-mode warning when the TEST MODE banner is
already rendered. If nothing survives deduplication, omit the heading too.}}

## Your invoices and business customers

<!-- CONDITIONAL: render only when computed/invoice-b2b.json has
     has_invoice_data: true. Otherwise delete this whole section. -->

{{INVOICE_INTRO — from invoice-b2b.json: paid invoice count and value, and the
invoice-backed share of revenue if invoice_backed_share is not null. If
invoice_link_on_charges_available is false, say the share couldn't be measured
rather than reporting a number.}}

| | Count | Revenue (USD) |
|---|---|---|
{{INVOICE_ROWS — paid_invoices, eu_uk_customers, eu_uk_with_customer_tax_id,
eu_uk_tax_id_stripe_verified, eu_uk_tax_id_not_verified, eu_uk_no_customer_tax_id,
invoices_without_supplier_tax_number. Use the JSON's own counts; label the rows in
plain English.}}

What follows from that:

- B2B customers commonly need your VAT number on the invoice to reclaim the tax at their end. An invoice without one can be returned for reissue before it is paid.
- Where a valid VAT number is present on a cross-border EU B2B sale, the sale is normally zero-rated under the reverse charge and the customer accounts for the tax. That treatment depends on the number being validated and the invoice saying so.
- Where no number is present, the sale is generally treated as B2C and taxed at the customer's local rate.

{{INVOICE_CAVEAT — REQUIRED, four sentences maximum: this analysis counts what the
invoices carry; it does not classify customers as businesses; "not verified" is not
the same as invalid; it cannot tell you why a supplier tax number is absent. Add
the tax-ID caveat ONLY when customer_tax_ids_readable is false. When it is true,
say nothing — "customer tax IDs were readable on this key" reports a non-event.}}

## Your Stripe setup

{{SETUP_PARAGRAPH — from computed/stripe-setup.json: catalogue size and tax codes,
price tax behaviour, subscription counts, Stripe Tax status, and invoice coverage.
Every figure from the JSON.}}

{{RECURRING_REVENUE — from stripe-setup.json recurring_revenue, when it is not null
and MRR is above zero: the MRR and the ARR estimate, with the `basis` line so the
reader can see what the figures do and do not include. This is the same number the
closing chat message quotes — it has to be checkable here.}}

{{SUPPORT_VERDICT — map the integration type against assets/supported-providers.json
and follow its fit_guidance. Never default to supported. If stripe-setup.json warns
about charges without invoices, say so here.}}

What integrating would involve:

| Step | Who | Effort |
|---|---|---|
{{INTEGRATION_STEPS — from assets/integration.json "install". Use the `step` field
only. Do NOT paste the `detail` field into the cell: an earlier run produced
40-word table cells. Keep every cell under 10 words. Label the effort column as
XBorderCo's estimate.}}

{{NO_REGISTRATIONS_PARAGRAPH — FOUR SENTENCES MAXIMUM, from
integration.json what_the_merchant_never_does. XBorderCo holds the registrations,
files and remits, and is the party liable for the tax on sales where it is the
deemed supplier. The merchant keeps their Stripe account, their customers and
their payouts. Say "on XBorderCo's model" once. Do NOT reproduce the
needs_signoff note — no "defensible position", no "contractual and evidential work
outstanding". That is an internal caveat for XBC, not text for a merchant.
Configuration detail goes in the appendix, not here.}}

## Which of your markets are covered

<!-- CONDITIONAL: render only when computed/market-coverage.json has status "ok".
     When it has status "blocked", delete this whole section and do NOT describe
     XBorderCo's country coverage from any other source. -->

| Your market | % of revenue | Status |
|---|---|---|
{{COVERAGE_ROWS — from market-coverage.json markets. Render "not_listed" as not
covered, never as covered.}}

{{COVERAGE_SUMMARY — from revenue_share_pct, plus whether the jurisdictions that
appear crossed sit inside the covered set. Render every warning.}}

## Questions this usually raises

**"Should we just turn on Stripe Tax?"** {{STRIPE_TAX_ANSWER — from
assets/integration.json stripe_tax_comparison: what Stripe Tax does, what it does
not do, what XBC does, and that they are not mutually exclusive. Factual only — no
recommendation, and nothing disparaging.}}

## Assumptions and method

{{METHODOLOGY_BULLETS — from the methodology_notes of the computed files whose
sections you actually rendered, plus the thresholds_status line. Keep the meaning
exactly; these are the caveats the report stands on. But:
  - One flat list. No sub-headings — an earlier run produced four groups and 17
    bullets against the example's eight.
  - Drop any note about a section you did not render.
  - Merge notes that say the same thing twice.
  - Replace JSON field names with plain English. Not "'revenue_usd_equivalent' is
    for comparison only" but "USD figures are shown for comparison only".
  - Drop internal references such as "PRD open item #2" and "(see fx_as_of)".
Aim for the example's eight bullets. Ten is the ceiling.}}

## Sources

{{SOURCES — the tax authority's own page for every jurisdiction you RENDERED in
the threshold table, and no others. These primary sources stay; do not collapse
them to Stripe's documentation. Then the sources_for_report list from
assets/integration.json as a cross-check, and the FX source with its date. One
flat list of links, no sub-headings. Because the table now excludes zero-revenue
rows, this list should be short — an earlier run listed 20 tax authorities for a
table that only said something about three of them.

When `_meta.source` is "csv_import", add one line naming where the data itself
came from, so the reader can reproduce the run:
  "Source data — a payments export from your Stripe Dashboard, covering
  {{WINDOW_FROM}} to {{WINDOW_TO}}. How to produce it:
  https://support.stripe.com/questions/exporting-payment-data"}}

## Appendix — configuration detail

{{CONFIGURATION_TABLE — from assets/integration.json configuration_patterns, the
merchant's own pattern first. Two columns: the pattern, and what the configuration
is. This is reference, not a task list — XBorderCo applies it during onboarding,
so do not write it as something the merchant or their developer must do. Keep each
cell under 25 words — an earlier run wrote a 60-word cell. Where a pattern carries
a "supersedes" note, follow the superseding source SILENTLY: use the correct
configuration and say nothing about the older document. A merchant does not need
to know which XBC doc was out of date. Where first_cycle says UNDOCUMENTED, say
that rather than filling the gap.}}

{{ENGINE_FLOW — from integration.json engine_flow, verbatim.}}

---
*Threshold data as of {{THRESHOLDS_AS_OF}} · FX as of {{FX_AS_OF}} · Not tax advice —
registration decisions need a qualified professional.*

{{CTA_FOOTER — verbatim from assets/cta-copy.md}}
