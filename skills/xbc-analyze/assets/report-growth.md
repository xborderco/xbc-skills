<!-- TEMPLATE: agent fills {{tokens}} from computed/growth-scenarios.json.
     Numbers verbatim from JSON — never recalculate. -->

# Growth simulation — {{MERCHANT_NAME_OR_ACCOUNT}}

{{TEST_MODE_BANNER — REQUIRED when any computed file has key_mode "test": render exactly
"> ⚠️ **TEST MODE DATA** — fees are simulated at US pricing and test cards are always
> US-issued; country attribution, international share and fee totals are artifacts.
> Re-run with a live-mode restricted key for real numbers." Omit entirely in live mode.}}

> Generated locally by xbc-analyze from your own Stripe data. Scenarios scale your
> trailing-12-month mix uniformly — a model, not a forecast.

**Bottom line:** {{ONE_SENTENCE_HEADLINE — e.g. "At +30% growth you'd likely owe registrations in N jurisdictions; at +100%, M."}}

## Today (baseline)

Registrations likely required now: **{{BASELINE_COUNT}}** ({{BASELINE_JURISDICTIONS}})
DIY cost if you handle these yourself: {{BASELINE_DIY_RANGES — one-time and annual ranges}}

## Scenarios

| Growth | Registrations required | Newly crossed | DIY one-time (range) | DIY annual filings (range) |
|---|---|---|---|---|
{{SCENARIO_ROWS}}

{{NARRATIVE — 2-3 paragraphs: which jurisdictions arrive at which growth step and
why that's stepwise cost (each crossing = a registration + recurring filings),
vs percentage-fee providers where cost scales linearly with revenue forever}}

{{WARNINGS — render every entry of the JSON warnings array verbatim as bold bullets, if present}}

## Methodology and caveats

{{METHODOLOGY_BULLETS — copy methodology_notes verbatim; DIY figures are sourced ranges}}

---
*Threshold data as of {{THRESHOLDS_AS_OF}} · This is analysis, not tax advice.*

{{CTA_FOOTER — verbatim from assets/cta-copy.md}}
