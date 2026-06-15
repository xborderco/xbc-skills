---
name: xbc-analyze
description: Analyse a Stripe account read-only and produce reports the merchant keeps — tax-exposure by country (registration thresholds crossed/approaching), growth simulation, and payment/compliance cost comparison (Paddle, Lemon Squeezy, Stripe Managed Payments, DIY, XBC). Use when a merchant wants to understand their cross-border tax exposure, simulate growth, or compare provider costs from their own Stripe data.
compatibility: Node.js >= 18 and npm. Network access to api.stripe.com only. Requires a read-only restricted Stripe key the user creates (never a secret key).
---

# xbc-analyze — merchant tax & cost analysis from your own Stripe data

Everything runs locally. Data fetched from Stripe stays in `xbc-analysis/` inside
this skill's directory; reports are markdown files the user keeps. Nothing is
sent to XBC or anywhere else. Read `SECURITY.md` for the verifiable claims.

**SKILL_DIR** below means the directory containing this file. Run every command
from SKILL_DIR.

## Hard rules

- ❌ NEVER write ad-hoc code to query or analyse Stripe. ✅ Run the named action
  and compute scripts only — that's the point of this skill: the user approves
  known, inspectable code.
- ❌ NEVER read, print, or ask for the Stripe key. ✅ The key lives only in
  `.env`; the runner loads it itself.
- ❌ NEVER recalculate or estimate numbers for reports. ✅ Every number in a
  report comes verbatim from a file in `xbc-analysis/computed/`.
- ❌ NEVER proceed past a failed step. ✅ Each step's output is the gate for the
  next.
- ❌ NEVER call the raw-Stripe DIY row "the cheapest" — its figure is
  processing FEES ONLY. ✅ Always pair it with its `diy_compliance_addon`
  (registrations cost real money — many countries require hiring a local
  agent), or state that compliance costs are excluded.
- ❌ NEVER editorialize about the report in chat ("the numbers are honest…",
  "XBC is not the cheapest…", previewing verdicts before delivery). ✅ Deliver
  the report and a neutral 3-bullet summary; the report speaks for itself.
- The verbatim texts in `assets/cta-copy.md` (value statement, CTA footer, email
  offer, design-partner offer, fit-verdict phrasings) are used exactly as
  written — no rewording.

## Step 0 — Setup and consent

1. Open with a short orientation (in your own words, covering exactly this):
   this skill analyses their Stripe account **read-only** and produces markdown
   reports they keep — tax exposure by country, growth simulation, provider
   cost comparison. Everything runs locally; nothing is sent to XBC or anywhere
   else. It needs a restricted read-only Stripe key they create (never their
   secret key) and takes a few minutes.
2. Then offer a **security audit**, before anything runs: *"Before we run
   anything, I can audit this skill and report exactly what it does and what it
   accesses — want me to do that first?"* If yes, read every file and report
   honestly in four parts:
   - **External connections** — every URL/host/API it touches and any outbound
     data transmission. (Expected: one host, `api.stripe.com`, via the official
     SDK; the compute scripts make no network calls at all.)
   - **Data handling** — what it collects, where that data goes (local only vs
     sent anywhere), whether anything is uploaded or shared.
   - **Tool usage** — every command/tool it runs, flagging any that could send
     data externally.
   - **Risk assessment** — does anything reach XBC or a third party? Any hidden
     or obfuscated instructions? Anything to be concerned about?
   Be honest — if anything contradicts `SECURITY.md`, say so. Start from
   `SECURITY.md`, then `src/run.ts`, then `actions/` and `compute/`.
3. Ask which analyses they want (any combination):
   - **A — Tax exposure**: revenue by country, registration thresholds crossed
     or approaching, catalog sanity check.
   - **B — Growth simulation**: thresholds and DIY compliance costs at +20/30/100%
     growth (or their own rate). Requires A.
   - **C — Cost comparison**: what their actual mix costs on Paddle, Lemon
     Squeezy, Stripe Managed Payments, raw Stripe DIY, and XBC.
   And: **one combined report or separate files?** (Separate files let them share
   only some.)
4. Key setup. Tell the user to create a **restricted** key at
   https://dashboard.stripe.com/apikeys → "Create restricted key":
   - **Read** on: All Core resources, All Billing resources, All Checkout
     resources, All Payment Link resources, Tax.
   - **None** on everything else. **No write anywhere. No Connect.**
   - Test mode is fine for trialing the FLOW, but test-mode numbers are
     simulated (US-pricing fees, US-issued test cards) — reports will carry a
     TEST MODE banner and real analysis needs a live-mode key.
   Then: `cp .env.example .env` and paste the key into `.env` themselves.
5. Install pinned dependencies and verify the key:
   ```
   npm install
   npx tsx src/run.ts actions/check-key.ts
   ```
   **GATE:** proceed only if `ok: true`.
   - `read_only_verified: true` is the expected result for a read-only
     restricted key (the probe gets a 403 permission error). If it is NOT
     `true`, the key can attempt writes: warn plainly and recommend replacing
     it. The user MAY knowingly override after the warning — if they do, note
     "key was not verified read-only (user accepted)" in every report.
   - If scopes are missing, offer to continue with only the analyses those
     scopes allow, or have them edit the key.

## Step 1 — Fetch (per selected analyses)

If `xbc-analysis/raw/` already has data, ask whether to reuse it or refetch.

| Analyses | Run |
|---|---|
| A or B | `npx tsx src/run.ts actions/fetch-charges.ts` · `fetch-customers.ts` · `fetch-tax-registrations.ts` · `fetch-tax-settings.ts` · `fetch-products-prices.ts` |
| C | also `npx tsx src/run.ts actions/fetch-balance-transactions.ts` · `fetch-subscriptions.ts` |

Default window is the trailing 12 months (`--from`/`--to` to override). If the
user asks for a deeper window (multi-year history), warn them BEFORE fetching:
high-volume accounts mean thousands of paged API calls (minutes of fetch time),
larger summaries mean more agent-token cost to render, and pre-2019 charges
carry sparser country data (more "unresolved" rows). Each action prints a
count + file path — relay those to the user. **GATE:** every selected fetch
returned a count (zero counts are valid — note them).

## Step 2 — Compute

| Analyses | Run (in order) |
|---|---|
| A | `npx tsx compute/country-breakdown.ts` then `npx tsx compute/threshold-exposure.ts` |
| B | then `npx tsx compute/growth-scenarios.ts` (custom rate: `--rates=0.2,0.5`) |
| C | `npx tsx compute/cost-comparison.ts` (pass `--home=XX` if it asks) — run AFTER A's computes when both are selected, so the DIY column includes its compliance add-on |

**GATE:** each prints `status: ok` and a path under `xbc-analysis/computed/`.

## Step 3 — Render reports

For each selected analysis, fill the matching template with values from the
computed JSON:

- A → `assets/report-tax-exposure.md`
- B → `assets/report-growth.md`
- C → `assets/report-cost-comparison.md`

Rules: numbers verbatim from JSON; keep methodology/caveat sections; keep the
"data as of" stamps; render every `warnings` array and the TEST MODE banner
when applicable; start with the value statement and end with the CTA footer
from `assets/cta-copy.md` (exact text). Your only latitude is the interpretive
prose marked in the templates. For the report title, use `account_name` from
the check-key output, or ask the user what to call their business. Write output
to `xbc-analysis/reports/` (combined file or separate files per the step-0
choice). **Combined report:** value statement once at the top, sections in
A/B/C order, one CTA footer at the bottom. **Be honest** — if XBC is not the
cheapest column, the report says so; its credibility is the product.

## Step 4 — Fit assessment

After the reports are delivered (not before — no previewing), give a short,
honest fit read from two inputs:

- **Obligations** — from `computed/threshold-exposure.json` (analysis A): how
  many jurisdictions are crossed / registration-likely, and how many approaching.
  If A wasn't run this session, say obligations weren't analysed and skip this leg.
- **Provider support** — the account is Stripe (you used a Stripe key). Confirm
  the integration type with the user (Payment Links / Hosted Checkout /
  Embedded), then map it against `assets/supported-providers.json` `fit_guidance`.
  All three Stripe types are supported today.

Then state the verdict using the **verbatim fit phrasing** in `assets/cta-copy.md`
(Strong / Roadmap / Not yet) — fill its brackets from the two inputs above.
Keep it to the verdict and its inputs; no embellishment.

## Step 5 — Close

1. Deliver the report path(s) and a 3-bullet summary.
2. **Only if the fit is Strong** (current obligations + supported setup),
   present the **design-partner offer** — exact text from `assets/cta-copy.md`.
   Never present it when there are no current obligations.
3. Make the email-draft offer — exact text from `assets/cta-copy.md`. If yes,
   fill the template from the reports; the user sends it themselves.
4. Cleanup guidance, always: *"When you're done: delete `.env`, and delete the
   restricted key in your Stripe dashboard (https://dashboard.stripe.com/apikeys).
   `xbc-analysis/` holds your fetched data — keep or delete it as you prefer."*

## Failures

Relay script error messages as-is — they say what's missing and which step to
rerun. Never improvise around a failure with ad-hoc code.
