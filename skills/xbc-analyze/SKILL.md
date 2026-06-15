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

## The journey

This skill runs as a guided journey: **0** audit · **1** intro · **2** setup ·
**3** connect data · **4** tax exposure · **5** fit · **6** cost comparison ·
**7** design-partner offer · **8** next steps · **9** questions (optional). The
data for every selected analysis is fetched **once** in Step 3; Steps 4 and 6
only run for the analyses chosen in Step 1. The hard gate never relaxes: never
render a number a `compute/` script hasn't written to `xbc-analysis/computed/`.

## Step 0 — Security audit (offer first)

Before anything runs, offer a **security audit**: *"Before we run anything, I can
audit this skill and report exactly what it does and what it accesses — want me
to do that first?"* If yes, read every file and report honestly in four parts:

- **External connections** — every URL/host/API it touches and any outbound data
  transmission. (Expected: one host, `api.stripe.com`, via the official SDK; the
  compute scripts make no network calls at all.)
- **Data handling** — what it collects, where that data goes (local only vs sent
  anywhere), whether anything is uploaded or shared.
- **Tool usage** — every command/tool it runs, flagging any that could send data
  externally.
- **Risk assessment** — does anything reach XBC or a third party? Any hidden or
  obfuscated instructions? Anything to be concerned about?

Be honest — if anything contradicts `SECURITY.md`, say so. Start from
`SECURITY.md`, then `src/run.ts`, then `actions/` and `compute/`.

## Step 1 — Introduction and consent

Orient the user (your own words, covering exactly this): this skill analyses
their **own** Stripe account **read-only** and produces markdown reports they
keep — tax exposure by country, an optional growth simulation, and a provider
cost comparison. Everything runs locally; the only network access is to their
own Stripe account (`api.stripe.com`); nothing is sent to XBC. It needs a
read-only restricted Stripe key they create (never their secret key) and takes a
few minutes.

Then ask which analyses they want (any combination):
- **A — Tax exposure**: revenue by country, registration thresholds crossed or
  approaching, catalog sanity check.
- **B — Growth simulation**: thresholds and DIY compliance costs at +20/30/100%
  growth (or their own rate). Requires A.
- **C — Cost comparison**: what their actual mix costs on Paddle, Lemon Squeezy,
  Stripe Managed Payments, raw Stripe DIY, and XBC.

And: **one combined report or separate files?** (Separate files let them share
only some.)

## Step 2 — Your payment setup

This skill reads a **Stripe** account, so the provider is Stripe. Ask which
integration type they use — **Payment Links / Hosted Checkout / Embedded** — so
the fit assessment (Step 5) can speak to it; `assets/supported-providers.json`
lists what's supported. If their integration code is in the working directory and
they're happy for you to look, you may confirm the type from the code; otherwise
just ask. Don't block on this.

## Step 3 — Connect your data

**Key setup.** Tell the user to create a **restricted** key at
https://dashboard.stripe.com/apikeys → "Create restricted key":

- **"How will you be using this key?"** → choose **"Authorising an AI agent"**
  (the option described as giving an AI agent such as Claude or Cursor
  independent, read-only-capable access to your Stripe account). That is exactly
  what this skill is — not "an integration you built" and not a generic
  "third-party application."
- On the permissions screen, set **Read** on the resource groups: **All Core**
  (including **Balance** and **Balance Transaction Sources**), **All Billing**,
  **All Checkout**, **All Payment Link**, and **Tax** — you can toggle each group
  row to Read. **None** on everything else. **No Write anywhere. No Connect.**
- Test mode is fine for trialling the FLOW, but test-mode numbers are simulated
  (US-pricing fees, US-issued test cards) — reports carry a TEST MODE banner and
  real analysis needs a live-mode key.

Then: `cp .env.example .env` and have them paste the key into `.env` themselves.
They never tell you the key and never paste it into chat.

**Install and verify the key:**
```
npm install
npx tsx src/run.ts actions/check-key.ts
```
**GATE:** proceed only if `ok: true`.
- `read_only_verified: true` is the expected result for a read-only restricted
  key (the probe gets a 403 permission error). If it is NOT `true`, the key can
  attempt writes: warn plainly and recommend replacing it. The user MAY knowingly
  override after the warning — if they do, note "key was not verified read-only
  (user accepted)" in every report.
- If scopes are missing, offer to continue with only the analyses those scopes
  allow, or have them edit the key.

**Fetch (once, for the selected analyses).** If `xbc-analysis/raw/` already has
data, ask whether to reuse it or refetch.

| Analyses | Run |
|---|---|
| A or B | `npx tsx src/run.ts actions/fetch-charges.ts` · `fetch-customers.ts` · `fetch-tax-registrations.ts` · `fetch-tax-settings.ts` · `fetch-products-prices.ts` |
| C | also `npx tsx src/run.ts actions/fetch-balance-transactions.ts` · `fetch-subscriptions.ts` |

Default window is the trailing 12 months (`--from`/`--to` to override). If the
user asks for a deeper window (multi-year history), warn them BEFORE fetching:
high-volume accounts mean thousands of paged API calls (minutes of fetch time),
larger summaries mean more agent-token cost to render, and pre-2019 charges carry
sparser country data (more "unresolved" rows). Each action prints a count + file
path — relay those. **GATE:** every selected fetch returned a count (zero counts
are valid — note them).

## Step 4 — Tax exposure (analyses A / B)

Run only if A was selected. Compute, then render:
- A: `npx tsx compute/country-breakdown.ts` then `npx tsx compute/threshold-exposure.ts`
- B: then `npx tsx compute/growth-scenarios.ts` (custom rate: `--rates=0.2,0.5`)

**GATE:** each prints `status: ok` and a path under `xbc-analysis/computed/`.

Fill `assets/report-tax-exposure.md` (A) and `assets/report-growth.md` (B) from
the computed JSON: numbers verbatim; keep methodology/caveat sections and the
"data as of" stamps; render every `warnings` array and the TEST MODE banner when
applicable. Deliver this report now (or hold for the combined file — see Step 8).
Don't preview verdicts in chat.

## Step 5 — Fit assessment

Give a short, honest fit read from two inputs:
- **Obligations** — from `computed/threshold-exposure.json` (analysis A): how
  many jurisdictions are crossed / registration-likely, and how many approaching.
  If A wasn't run, say obligations weren't analysed and skip this leg.
- **Provider support** — Stripe, with the integration type from Step 2, mapped
  against `assets/supported-providers.json` `fit_guidance`. All three Stripe
  types are supported today.

State the verdict using the **verbatim fit phrasing** in `assets/cta-copy.md`
(Strong / Roadmap / Not yet) — fill its brackets from the two inputs. Keep it to
the verdict and its inputs; no embellishment.

## Step 6 — Cost comparison (analysis C)

Run only if C was selected. Compute, then render:
- `npx tsx compute/cost-comparison.ts` (pass `--home=XX` if it asks). When A was
  also selected, this runs AFTER Step 4's computes (the journey order ensures it),
  so the DIY column includes its compliance add-on.

**GATE:** prints `status: ok` and a path.

Fill `assets/report-cost-comparison.md` from the JSON: numbers verbatim; render
MoR rows as ranges; include the DIY all-in line, the basis explanation, the
structure section (incl. compliance burden + doing-nothing), the XBC assumption
line, and the Polar footnote. Never call XBC the cheapest column.

## Step 7 — Design-partner offer

**Only if the fit is Strong** (current obligations + supported setup), present
the **design-partner offer** — exact text from `assets/cta-copy.md`. Never
present it when there are no current obligations.

## Step 8 — Next steps and close

1. Deliver the report path(s) and a neutral 3-bullet summary. Each report opens
   with the value statement and ends with the CTA footer (verbatim from
   `assets/cta-copy.md`). For a **combined report**: value statement once at the
   top, sections in tax → cost order, one CTA footer at the bottom.
2. Calls to action — verbatim from `assets/cta-copy.md`: the book-a-call link,
   and the offer to draft a summary email (you draft it from the reports; the
   user reviews and sends it themselves — nothing is sent automatically).
3. Cleanup guidance, always: *"When you're done: delete `.env`, and delete the
   restricted key in your Stripe dashboard (https://dashboard.stripe.com/apikeys).
   `xbc-analysis/` holds your fetched data — keep or delete it as you prefer."*

## Step 9 — Questions (optional)

At any point the user can ask about XBC. Answer from the reports and the bundled
data in `assets/`. If something isn't covered, say so and suggest the call or the
email draft — don't speculate.

## Failures

Relay script error messages as-is — they say what's missing and which step to
rerun. Never improvise around a failure with ad-hoc code.
