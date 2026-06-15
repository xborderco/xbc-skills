<!-- TEMPLATE: agent fills {{tokens}} from computed/cost-comparison.json.
     Numbers verbatim from JSON — never recalculate. The comparison is
     structure-and-cost: the table is evidence, the structure section is the
     point. Never overstate XBC's cost position; the JSON is what it is. -->

# Payment & compliance cost comparison — {{MERCHANT_NAME_OR_ACCOUNT}}

{{TEST_MODE_BANNER — REQUIRED when any computed file has key_mode "test": render exactly
"> ⚠️ **TEST MODE DATA** — fees are simulated at US pricing and test cards are always
> US-issued; country attribution, international share and fee totals are artifacts.
> Re-run with a live-mode restricted key for real numbers." Omit entirely in live mode.}}

> Generated locally by xbc-analyze from your own Stripe data ({{WINDOW_FROM}} → {{WINDOW_TO}}).
> All percentage fees are applied to tax-inclusive totals — that's how the vendors document them.

**Your mix:** {{MIX_SENTENCE — gross revenue, tx count, avg transaction, international share, subscription share, actual Stripe fees if present}}

## Cost over the analysis window, on your actual mix

| Provider | Basis | Cost over window (USD, low–high) | % of gross (low–high) | Key caveats |
|---|---|---|---|---|
{{PROVIDER_ROWS — sorted as in JSON; render cost_usd_low–cost_usd_high as a RANGE when
they differ (MoR rows), single figure otherwise; basis verbatim; one-line caveat from notes.
NEVER quote only an MoR row's low number in prose — ranges or nothing.}}

{{DIY_ALL_IN_LINE — REQUIRED, directly under the table: render the raw-Stripe row's
diy_compliance_addon as "DIY's figure is processing fees only — its real total adds
N registration(s): $X–Y/yr in filings plus $A–B one-time (local agents are usually
required for non-resident registrations)." If 'not_computed', state compliance costs
are excluded and why. NEVER present DIY as cheapest without this line.}}

{{BASIS_EXPLANATION — copy the 'BASIS PER ROW' assumption line verbatim; floors
understate the MoR columns, and the report must say so under the table}}

{{WARNINGS — render every entry of the JSON warnings array verbatim as bold bullets, if present}}

{{XBC_ASSUMPTION_LINE — verbatim from JSON xbc_assumption}}

## What the table can't show

{{STRUCTURE_SECTION — render EVERY key in structure_facts as a short subsection,
humanising the key name: MoR trade-offs, Stripe Managed Payments constraints, the
XBC position, the DIY position, the compliance burden (cited World Bank / Vertex
figures), and what doing nothing costs. Each bullet verbatim, including its source
URL. This is the substance; write it plainly, not as a pitch.}}

{{POLAR_FOOTNOTE — verbatim from cost-model polar_footnote, as a footnote}}

## Assumptions

{{ASSUMPTIONS_BULLETS — copy assumptions array verbatim}}

---
*Cost model as of {{COST_MODEL_AS_OF}} · Vendor fees are documented rates; volume
discounts ("contact sales") are not modeled.*

{{CTA_FOOTER — verbatim from assets/cta-copy.md}}
