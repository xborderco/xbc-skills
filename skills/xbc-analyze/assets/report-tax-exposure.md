<!-- TEMPLATE: agent fills {{tokens}} from computed/threshold-exposure.json and
     computed/country-breakdown.json. Numbers come from the JSON verbatim —
     never recalculate. Keep every section; keep the data-stamp footer. -->

# Tax exposure analysis — {{MERCHANT_NAME_OR_ACCOUNT}}

{{TEST_MODE_BANNER — REQUIRED when any computed file has key_mode "test": render exactly
"> ⚠️ **TEST MODE DATA** — fees are simulated at US pricing and test cards are always
> US-issued; country attribution, international share and fee totals are artifacts.
> Re-run with a live-mode restricted key for real numbers." Omit entirely in live mode.}}

> Generated locally by xbc-analyze from your own Stripe data ({{WINDOW_FROM}} → {{WINDOW_TO}}).
> Nothing in this report has been sent anywhere — it's yours.

**Bottom line:** {{ONE_SENTENCE_HEADLINE — e.g. "You appear to have crossed registration thresholds in N jurisdictions and are approaching M more."}}

## Where your revenue comes from

| Country | Revenue (USD) | % of total | Transactions |
|---|---|---|---|
{{TOP_COUNTRY_ROWS — up to 10, from country-breakdown.countries}}

Data quality: {{RESOLVED_PCT}}% of charges resolved to a country
({{TIER_BREAKDOWN — billing address / card issuer / customer address / unresolved counts}}).

## Registration threshold status

| Jurisdiction | Your revenue | Threshold | % of threshold | Status | Registered? |
|---|---|---|---|---|---|
{{THRESHOLD_ROWS — every non-clear row, then notable clear rows; status verbatim from JSON}}

{{ACTIONABLE_PARAGRAPH — plain-English walk through summary.actionable_unregistered:
what "registration_likely_required" and "crossed" mean, with each row's note}}

## Catalog sanity check

{{CATALOG_PARAGRAPH — from raw/products-prices.json: do tax codes look like
digital services; tax_behavior inclusive/exclusive mix; anything odd}}

{{WARNINGS — render every entry of the JSON warnings array verbatim as bold bullets, if present}}

## Methodology and caveats

{{METHODOLOGY_BULLETS — copy methodology_notes from the JSON verbatim, plus
the thresholds_status line}}

---
*Threshold data as of {{THRESHOLDS_AS_OF}} · FX rates as of {{FX_AS_OF}} · This is
analysis, not tax advice — registration decisions need a human professional.*

{{CTA_FOOTER — verbatim from assets/cta-copy.md}}
