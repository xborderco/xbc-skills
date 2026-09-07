---
name: xbc-analyze
description: "Analyse a merchant's Stripe data read-only — from a read-only API key or a Dashboard CSV export — and produce a report they keep: revenue by country, registration thresholds needing attention, what their invoices show about business customers and tax numbers, and what integrating XBorderCo would involve. Use when a merchant wants to understand their cross-border tax exposure from their own Stripe data."
compatibility: Node.js >= 18 and npm. Two data paths — a read-only restricted Stripe key the user creates (never a secret key), reaching api.stripe.com only; or a Stripe Dashboard CSV export, which needs no key and never connects to Stripe.
---

# xbc-analyze — merchant tax analysis from your own Stripe data

Everything runs locally. Data stays in `xbc-analysis/` inside this skill's
directory; the report is a markdown file the user keeps. Nothing is sent to XBC.
Two things do leave the machine, and neither is this skill's doing: `npx tsx`
may download tsx from the npm registry the first time it runs, and whatever you
read from the output goes wherever this chat goes. Say so if asked; never say
"nothing leaves your machine". Read `SECURITY.md` for the verifiable claims.

There are two ways in: a read-only Stripe key, or a CSV export from the Stripe
Dashboard. The CSV path needs no key, no `npm install`, and never connects to
Stripe. It also cannot carry everything — Step 3 states the trade honestly and
lets the user choose.

**SKILL_DIR** below means the directory containing this file. Run every command
from SKILL_DIR.

## Hard rules

- ❌ NEVER write ad-hoc code to query or analyse Stripe. ✅ Run the named action
  and compute scripts only — that's the point of this skill: the user approves
  known, inspectable code.
- ❌ NEVER read, print, or ask for the Stripe key. ✅ The key lives only in
  `.env`; the runner loads it itself. On the CSV path there is no key at all.
- ❌ NEVER recalculate or estimate numbers for the report. ✅ Every number comes
  verbatim from a file in `xbc-analysis/computed/`. If a section needs a number
  no compute script produced, the section does not go in.
- ❌ NEVER proceed past a failed step. ✅ Each step's output is the gate for the
  next.
- ❌ NEVER describe what XBorderCo covers, supports, charges, or is liable for
  from memory or from general knowledge. ✅ Those facts come only from
  `assets/coverage.json`, `assets/supported-providers.json` and
  `assets/integration.json`. When one of those files says the data is unsigned or
  undocumented, say so or omit the section — never fill the gap.
- ❌ NEVER default to "supported". ✅ Some Stripe setups (PaymentIntents used
  directly, the legacy Charges API) cannot be processed at all. Silence there is
  the costliest error this skill can make, because the merchant finds out after
  committing.
- ❌ NEVER editorialize about the report in chat ("the numbers are honest…",
  previewing verdicts before delivery). ✅ Deliver the report and the short
  closing message in Step 7; the report speaks for itself.
- ❌ NEVER answer a question you are not certain of. ✅ Say you don't know, log
  it, move on. This is tax. A confident wrong answer about a rate, a deadline or
  a liability is worse than no answer, and the person asking usually cannot tell
  the difference. See Step 8 for the test and what to do instead.
- The verbatim texts in `assets/cta-copy.md` are used exactly as written — no
  rewording. That file is XBC speaking, kept separate from the analysis on
  purpose.

**The register.** The report says what the merchant's data shows, and what XBC
does. It does not tell them what it means for them, what to do about it, or how
to feel about it. Do not quantify consequences (penalties, interest, what
non-compliance costs), do not sequence their tax decisions, and do not add
recommendations. A report that opens "not tax advice" cannot then give it.

## How to write

Write every chat message in ASD-STE100 Simplified Technical English.

- Write one instruction in one sentence.
- Use no more than 20 words in an instruction sentence.
- Use no more than 25 words in a descriptive sentence.
- Use the active voice.
- Start an instruction with the verb. Say "Open the page", not "You should open the page".
- Use the same word for the same thing every time.
- Keep the articles. Do not delete words to make a sentence shorter.
- Use a list when there is more than one item.
- Do not put more than three nouns together.
- Do not use a word in two different meanings.

This rule covers your own chat messages. It does not cover the verbatim blocks in
`assets/cta-copy.md`, which are used exactly as written.

## What to say in chat

**The chat is a progress bar. The report is the deliverable.**

**Say what happens next. Do not narrate what you are doing.** One line, then act.

Good: "Installing the Stripe library locally. About 30 seconds."
Bad: "I'll now run npm install to install the dependencies, and then I'll verify
your key by running the check-key action, which probes each scope…"

At each step, say two things and stop:

1. The step that is complete.
2. The one action the user must do next.

Do not explain the data in chat. Do not preview a finding. Do not repeat a caveat
that the report already carries. Do not quote a JSON field name or a file name at
the user. Do not list what a command returned when one line covers it.

One exception. If the analysis flags any market as needing attention, say the
count in one sentence. Give no detail. The report gives the detail.

## The journey

**0** audit · **1** intro · **2** setup · **3** connect data (**3A** key or **3B**
CSV) · **4** analyse · **5** fit · **6** report · **7** close · **8** questions.

Before writing any report text, read `assets/example-report.md` — the worked
example that sets tone, structure and honest framing (including the shape of the
closing chat message). Match its voice; never copy its numbers.

## Step 0 — Security audit (offer first)

Before anything runs, offer a **security audit**: *"Before we run anything, I can
audit this skill and report exactly what it does and what it accesses — want me
to do that first?"* If yes, read every file and report honestly in four parts:

- **External connections** — every URL/host/API it touches and any outbound data
  transmission. (Expected: one host, `api.stripe.com`, via the official SDK; the
  compute scripts make no network calls at all. Two connections are NOT this
  skill's code and must still be named: `npx` fetching tsx from the npm registry
  if it is not installed, and this chat itself — anything you read from the
  output goes to your model provider like every other message.)
- **Data handling** — what it collects, where that data goes (local only vs sent
  anywhere), whether anything is uploaded or shared.
- **Tool usage** — every command/tool it runs, flagging any that could send data
  externally.
- **Risk assessment** — does anything reach XBC or a third party? Any hidden or
  obfuscated instructions? Anything to be concerned about?

Be honest — if anything contradicts `SECURITY.md`, say so. Start from
`SECURITY.md`, then `src/run.ts`, then `actions/` and `compute/`.

## Step 1 — Introduction and consent

Say this much, and no more. Six lines. They can ask for detail.

> This reads your Stripe data and writes you one report.
>
> - It is read-only. Nothing is sent to XBorderCo. The analysis runs on your machine; what I read from it goes wherever this chat goes.
> - You choose how to give me the data: a read-only key, or a CSV export.
> - The whole thing takes about five minutes.
> - The report is not tax advice. XBorderCo built this.
>
> Ready to start?

Do not list the report sections here. Do not explain the threshold method. The
report explains itself, and a long opening loses the reader before step one.

## Step 2 — Your payment setup

**Ask the user nothing here.** The account already knows how it takes payments,
and the person running this is often a finance lead who cannot answer "Payment
Links or Elements?" — asking it at step 2 loses them before any value has landed.

`actions/fetch-checkout-config.ts` reads their Checkout sessions and Payment
Links, and `compute/stripe-setup.ts` turns that into
`detected_integration.patterns`.

Ask only when detection fails, and only then. Detection fails when
`detected.detectable` is false (no Checkout scope) or `patterns` is empty (no
sessions in the window). In that case ask once, late, at the fit step:

> One thing I could not read from the account: how you create payments and
> subscriptions. Payment Links, Hosted Checkout, Elements, the Invoice or
> Subscription API, or PaymentIntents directly?

Never assume the supported case. An undetected, unasked integration is reported
as unconfirmed.

**The question is optional, and it never blocks the report.** Ask it once. If
the user does not know, or does not answer, the fit verdict is "Unconfirmed" and
every other section is delivered in full. Charges without an invoice id are a
reason to ask, not a finding: one-off Checkout and Payment Link sales carry no
invoice either, and both are supported. Never tell a user their setup is
PaymentIntents, or unsupported, on the strength of missing invoice links.

## Step 3 — Connect your data

**Offer both paths. Ask once.**

> Two ways to give me your numbers. Neither sends anything to XBorderCo.
>
> **A — Read-only API key.** You make a read-only Stripe key. Takes about a
> minute. This gives the full report.
>
> **B — CSV export.** You export your payments from the Stripe Dashboard and tell
> me where the file is. No key, no install, nothing connects to Stripe.
>
> B is faster to set up. It leaves out four things a CSV cannot carry: your
> invoicing and VAT-number breakdown, your recurring revenue, your product tax
> codes, and the registrations you already hold.
>
> Which would you prefer?

Do not steer. B is a legitimate choice, and for a first look it is often the
right one. If they pick B, go to **Step 3B** and skip the key entirely.

## Step 3A — Read-only API key

**Key setup.** Give the user these six lines and nothing more. Do not add the
reasons — the reasons are in this file if they ask.

> Make a read-only key. It takes about a minute.
>
> 1. Open https://dashboard.stripe.com/apikeys
> 2. Click **Create restricted key**.
> 3. For "How will you be using this key?", choose **Authorising an AI agent**.
> 4. Set **Read** on: All Core, All Billing, All Checkout, All Payment Link, Tax.
> 5. Leave everything else on **None**. Set no Write. Set no Connect.
> 6. Copy the key.

**You** create the file. Do not make the user run `cp`. Run this yourself:

```
cp .env.example .env
```

Then give them one line:

> I have made the file. Open it, paste the key after `STRIPE_API_KEY=`, and save.
> Do not paste the key into this chat. Tell me when it is saved.

Open it for them if you can (`open -t .env` on macOS).

**The key never goes in chat.** Not even a read-only one. The chat is stored and
is sent onward with every later turn, `SECURITY.md` promises the key stays in
`.env`, and Step 0 invites the reader's own agent to check exactly that. A
read-only key still reads every customer, charge and invoice on the account, and
restricted keys do not expire. If the user offers to paste it, decline and
restate these two lines.

Say one line about test mode only if they are on a sandbox account: *"A test key
works, but the numbers are simulated. The report will say so."*

**Install, then verify.** Say what you are about to do in one line, then run it:

> Installing the Stripe library locally. About 30 seconds.

```
npm install
npx tsx src/run.ts actions/check-key.ts
```

`npm install` must finish before anything else runs. The runner now stops with a
plain message if it has not. Do not call this "installing the Stripe CLI" — this
skill does not use the Stripe CLI, it uses the official `stripe` npm library, and
Step 0 invites the reader to check that claim.

**GATE:** proceed only if `ok: true`.
- `read_only_verified: true` is the expected result for a read-only restricted
  key (the probe gets a 403 permission error). If it is NOT `true`, the key can
  attempt writes: warn plainly and recommend replacing it. The user MAY knowingly
  override after the warning — if they do, note "key was not verified read-only
  (user accepted)" in the report.
- If scopes are missing, say which sections that costs them and offer to continue
  without those sections, or have them edit the key.

**State the window BEFORE you fetch. Always.** The default reads the last 12
months only. For a business that has traded for years, that is the single biggest
limit on what this report can tell them, and they must hear it before the fetch,
not from a date stamp afterwards.

> I will read the last 12 months. That covers where you stand today.
>
> It will not show a threshold you crossed in an earlier year, and it cannot test
> jurisdictions that measure over a longer period — Japan uses a base period two
> financial years back.
>
> I can read further back instead. How long have you been selling?

If the business started trading inside the last 12 months, pass
`--from=<first trading day>` to every fetch. The analysis then knows the months
before it held no sales, and measures every threshold over a complete history
instead of reporting "not enough data" for a business that is simply new.

If they choose a longer window, warn them first: a high-volume account means
thousands of paged API calls and several minutes, and charges before 2019 carry
sparser country data, so more of them will not resolve to a country. Then pass
the same `--from` and `--to` to **every** fetch below. A mismatch between the
charges window and the invoices window skews the analysis, because every
threshold window is anchored to the end of the fetched window.

**Fetch.** If `xbc-analysis/raw/` already has data, ask whether to reuse or
refetch. Run them as one command, not eight — the user is watching.

```
npx tsx src/run.ts actions/fetch-charges.ts && \
npx tsx src/run.ts actions/fetch-customers.ts && \
npx tsx src/run.ts actions/fetch-invoices.ts && \
npx tsx src/run.ts actions/fetch-checkout-config.ts && \
npx tsx src/run.ts actions/fetch-subscriptions.ts && \
npx tsx src/run.ts actions/fetch-products-prices.ts && \
npx tsx src/run.ts actions/fetch-tax-registrations.ts && \
npx tsx src/run.ts actions/fetch-tax-settings.ts
```

**GATE:** every fetch returned a count (zero counts are valid — note them). Say
one line when it is done. Do not relay eight counts.

## Step 3B — CSV export

No Stripe key. No `npm install`. Nothing connects to Stripe on this path. (`npx
tsx` will download tsx from the npm registry the first time, if it is not already
installed — that is npm, not this skill.)

Give the user exactly this:

> **Export your payments.**
>
> 1. Open https://dashboard.stripe.com/payments
> 2. Click **Export** (top right of the payments table).
> 3. Date range: click **Custom** and pick **at least the last 12 months**.
> 4. Columns: change **Default (23)** to **All columns**.
> 5. Click **Export**, then tell me where the file saved.
>
> Stripe's own help page for this: https://support.stripe.com/questions/exporting-payment-data

**Both of those settings matter, so do not let either slide.**

*Columns.* The Default set of 23 leaves out `Card Address Country`, which is how
every sale is attributed to a country. Without it there is no analysis at all.
The importer checks and names any missing column, so a wrong export fails
immediately rather than producing a wrong report.

*Date range.* Registration thresholds are annual. An export of "Today" or "Last
month" cannot test them, and nearly every market comes back as "not enough data".
Twelve months is the working minimum. Under 60 days the importer says the export
is too short.

Then run the importer yourself. Ask two questions first, together, because a
CSV carries neither answer:

> Two things the export cannot tell me.
>
> 1. Which country is your business established in?
> 2. Does this export cover every payment since you started trading? If so, on
>    what date did you start?

The first sets `--home`. Every threshold in this analysis is the rule for
sellers who are NOT established in that country, so their own country is
excluded from it. Without it, their domestic sales are scored against a rule
that does not apply to them.

The second sets `--trading-since`. The analysis otherwise measures data coverage
from the earliest payment in the file, so a business that started trading last
month looks like a one-month export of an older business, and every annual
threshold comes back "not enough data". With the start date, the months before
it count as covered. Pass it ONLY when the export is their complete history from
that date; for an older business with a partial export, leave it out.

```
npx tsx src/import-csv.ts --file="/path/to/unified_payments.csv" --home=IE --trading-since=2026-08-25
```

**GATE:** `status: ok`. Relay the charge count and the window in one line. The
output also lists `sections_unavailable_on_this_path` — say those once, plainly,
and do not repeat them at every later step. If it warns that the export has no
"Invoice ID" column, the integration type will be unconfirmed; say so once and
carry on — it does not block the report.

The importer writes the same `xbc-analysis/raw/` files the API path writes, so
Step 4 onward is identical. Three computes will report `unavailable` or
`blocked`; that is expected, not a failure.

**One thing to carry through to the report.** On this path the analysis cannot
see registrations the merchant already holds, so every market is shown as
unregistered. `threshold-exposure.json` carries the warning. Render it — a
merchant told to act on a market they already handle stops believing the rest.

## Step 4 — Analyse

One command. Order matters — `market-coverage.ts` reads what
`country-breakdown.ts` writes.

```
npx tsx compute/country-breakdown.ts && \
npx tsx compute/threshold-exposure.ts && \
npx tsx compute/invoice-b2b.ts && \
npx tsx compute/stripe-setup.ts && \
npx tsx compute/market-coverage.ts
```

**GATE:** each prints a path under `xbc-analysis/computed/`. `status: ok` means
render the matching section. Two scripts can legitimately print something else,
and both are instructions, not failures:

- `market-coverage.ts` printing `status: blocked` means XBC's coverage data is
  unsigned. **Omit that section entirely** and describe XBC's country coverage
  nowhere else in the report.
- `invoice-b2b.ts` writing `has_invoice_data: false` means there are no paid
  invoices. **Omit that section entirely.**

Anything else non-zero is a failure — relay it and stop.

## Step 5 — Fit assessment

Work out the verdict from three inputs. Keep the working to yourself.

- **Obligations** — from `computed/threshold-exposure.json`: how many
  jurisdictions are crossed or registration-likely, how many approaching, and how
  many report `insufficient_data`. Rows with status `domestic_out_of_scope` are
  the merchant's own country and never count.
- **Provider support** — from `computed/stripe-setup.json`
  `detected_integration.patterns`, mapped against
  `assets/supported-providers.json` and its `fit_guidance`. Read the warnings
  first. If `patterns` is empty or `detectable` is false, ask the Step 2 question
  now — this is the one place it is worth the user's time. If they cannot
  answer, the verdict is Unconfirmed; do not hold the report for it.
- **Market coverage** — from `computed/market-coverage.json`. "Strong fit" is a
  claim that XBC can take on the markets that need attention, so it needs
  evidence of coverage: the file must have `status: ok`, and every jurisdiction
  in `actionable_unregistered` must be `covered_today`. When the file is
  `blocked`, or any of those markets is roadmap, not planned or not listed,
  "Strong fit" is not available. Use "Coverage unconfirmed" instead. Tax
  exposure and payment integration alone never make a strong fit.

Pick the **verbatim fit phrasing** from `assets/cta-copy.md` (Strong / Coverage
unconfirmed / Not yet supported / Roadmap / Unconfirmed / Not yet) and fill its
brackets. The verdict goes in the **report**, not in chat.

In chat, say two lines and move on:

> Analysis done. [N] jurisdictions need attention.
> Writing your report now.

Say nothing else here. No counts of `insufficient_data`, no file names, no field
names, no verdict preview. All of that belongs in the report, and the report
carries it already.

## Step 6 — Render the report

Fill `assets/report.md` from the computed JSON. Numbers verbatim; keep every
methodology and caveat section; render every `warnings` array from every computed
file; render the TEST MODE banner when applicable. Both conditional sections
follow the Step 4 gates.

Write the report to `xbc-analysis/reports/<merchant>-report.md`.

## Step 7 — Next steps and close

The closing message has these parts, in this order, and nothing else:

1. **The report path.** One line.
2. **The size of the business.** `mrr_usd` and `arr_estimate_usd` from
   `computed/stripe-setup.json`. Call ARR an estimate. Omit this line if
   `recurring_revenue` is null or MRR is zero.
3. **The exposure.** How many jurisdictions need attention, and which ones. One
   line. Never count the merchant's own country: that row is out of scope. "Needs attention" is Stripe Tax's own term for a location where sales
   have passed the registration threshold. Use it: it states the finding without
   assuming the merchant is the one who registers. If they use XBorderCo, they
   never register — XBorderCo holds the registrations.
4. **Two or three headlines** from the report. One line each.
5. **The question line**, only if `xbc-analysis/questions.md` exists: *"I noted
   [N] questions I couldn't answer: `xbc-analysis/questions.md`."* Then make the
   offer in Step 8.
6. **The cleanup line**, always — it is a security action, not a pleasantry:
   *"When you're done: delete `.env`, and delete the restricted key at
   https://dashboard.stripe.com/apikeys."* On the CSV path there is no key to
   delete — say only that `xbc-analysis/` holds their data.

A worked shape:

> Your report: `xbc-analysis/reports/<merchant>-report.md`
>
> - MRR $12,400. Estimated ARR $148,800.
> - 2 jurisdictions need attention: the UK and EU OSS.
> - 716 of your 767 paid invoices carry no customer tax number.
> - Your Payment Links setup is one XBC supports today.
>
> I noted 2 questions I couldn't answer: `xbc-analysis/questions.md`.
>
> When you're done: delete `.env`, and delete the restricted key at
> https://dashboard.stripe.com/apikeys.

Do **not** put these in chat: the not-tax-advice text, the CTA footer, the
market-coverage block status, the test-mode caveat, the `insufficient_data` count.
The report carries every one of them. Repeating them buries the four lines the
user needs.

Offer the email draft only if they ask a follow-up question, and offer it in one
sentence.

## Step 8 — Questions

The user can ask anything, at any point in the journey. Most of it will be
outside what this skill can answer. That is expected, and saying so is the
correct behaviour, not a failure.

### The test — apply it to every question

1. Is the answer a number already in `xbc-analysis/computed/`? → **Answer it.**
2. Is the answer written down in a bundled file — `assets/integration.json`,
   `assets/supported-providers.json`, `assets/coverage.json`,
   `assets/thresholds.json`, `SECURITY.md`, this file? → **Answer it, and say
   which file it came from.**
3. Anything else → **Do not answer. Log it.**

There is no fourth branch. If you find yourself reasoning towards an answer
rather than reading one, you are in branch 3.

**Never answer from general knowledge, however confident you feel**: tax rates,
filing deadlines, penalties, interest, VAT treatment of a specific product,
place-of-supply rules, entity structuring, treaties, whether they must register,
whether they should register, what happens if they do not. Also never: XBC
pricing, contract terms, onboarding dates, or any liability position beyond the
words already in `assets/integration.json`.

Worked examples:

- *"What VAT rate would apply to my product in Germany?"* → branch 3. Do not
  answer. The rate is not in any bundled file, and being close is not good enough.
- *"How is the EU figure calculated?"* → branch 1/2. Answer: the method is in the
  computed file's own methodology notes.
- *"Should we register in the UK now or wait?"* → branch 3. That is advice.
- *"Does XBC support Adyen?"* → branch 2. `supported-providers.json` says
  roadmap. Answer from it.
- *"What does XBC charge?"* → branch 3. No bundled file states a price.

### What to say

Short, plain, no apology, no hedging paragraph:

> I don't know, and I'd rather not guess on a tax question. I've noted it for
> XBorderCo — you can send them the list at the end, or keep it.

Then log it. Do not offer a partial answer first. Do not add "but generally…".

### The question log

Append every branch-3 question to `xbc-analysis/questions.md`, as you go — not at
the end, so the list survives if the session stops. Create the file on the first
question, with this shape:

```markdown
# Questions for XBorderCo
Collected during an xbc-analyze run. Nothing here has been sent anywhere.

1. What VAT rate would apply to my product in Germany?
2. Should we register in the UK now or wait?
```

Record the user's question in their own words. Do not add your own commentary,
and do not include any figure from their report — the list is questions only, so
they can send it without sending their numbers.

At Step 7, if the file exists, add one line to the closing message:

> I noted [N] questions I couldn't answer: `xbc-analysis/questions.md`.

Then offer, once, using the verbatim **Question-list offer** in
`assets/cta-copy.md`. If they choose to send, draft the email from the
**Question email template** and show it to them. **You never send it.** They copy
it, or you open their mail client — their choice, their send. Nothing leaves this
machine without them doing it.

If they say keep, say nothing more about it. The file is theirs.

## Failures

Relay script error messages as-is — they say what's missing and which step to
rerun. Never improvise around a failure with ad-hoc code.
