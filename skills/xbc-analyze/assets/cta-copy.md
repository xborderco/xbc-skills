# Verbatim copy (do not reword)

This file holds XBorderCo's own words. It is kept separate from the report
templates on purpose: everything in the report is a fact computed from the
merchant's data, and everything here is XBC speaking. A reader auditing this
skill should be able to see exactly where one ends and the other begins.

## Not-tax-advice block — top of the report, blockquote, exactly this text

Two versions. Pick the one that matches how the data arrived — the provenance
sentence has to be true, and it is the first thing a sceptical reader checks.

**A — when a read-only API key was used:**

> **Not tax advice.** This is an automated reading of your own Stripe data
> against published registration thresholds. It doesn't know your entity
> structure, your exemptions, or any registrations you already hold. Before you
> act on anything here, take advice from a qualified professional. Generated
> locally from your own Stripe account with a read-only key — nothing was sent
> to XBorderCo, and this report is yours to keep, share, or delete.

**B — when a Stripe Dashboard CSV export was used** (`_meta.source` is
`csv_import` in the computed files):

> **Not tax advice.** This is an automated reading of your own Stripe data
> against published registration thresholds. It doesn't know your entity
> structure, your exemptions, or the registrations you already hold — on this
> export it cannot see them at all. Before you act on anything here, take advice
> from a qualified professional. Generated on your own machine from a CSV you
> exported yourself; nothing connected to Stripe and nothing was sent to
> XBorderCo. This report is yours to keep, share, or delete.

<!-- NEEDS SIGN-OFF (John): 7 Sep 2026, "or anywhere else" removed from both
     versions. It was not true as written — the agent running the skill sends
     what it reads to its model provider, and npx may fetch tooling. A merchant's
     agent caught it. "Nothing was sent to XBorderCo" is the claim we can stand
     behind. -->

## CTA footer — bottom of the report, exactly this text

---

**Want to talk any of this through?** Book a call: https://xborderco.com/book-a-call
— or just keep the report; it's yours either way. If you'd like XBC to review your
numbers, share whichever report(s) you choose by attaching them to an email —
nothing is sent automatically.

## Fit-verdict phrasing — used verbatim in the fit step; pick the one that applies, fill brackets

**Strong fit** — "[N] of your markets need attention, and your Stripe setup
([integration type]) is one XBC supports today."

<!-- "Strong fit" is only available when assets/coverage.json is signed and every
     market that needs attention is in covered_today. Exposure plus a supported
     integration is not, on its own, a strong fit — XBC also has to cover the
     markets. See SKILL.md Step 5. -->

**Coverage unconfirmed** — "[N] of your markets need attention, and your Stripe
setup ([integration type]) is one XBC supports today. Whether XBC covers
[markets] is not confirmed in this report — that's the first thing to settle on
a call."

<!-- NEEDS SIGN-OFF (John): added 7 Sep 2026 so the fit step has honest wording
     for the common case where coverage.json is unsigned. Replaces "Strong fit"
     in that case; never used alongside it. -->

**Not yet supported** — "[N] of your markets need attention. The setup you're on
([integration type]) isn't one XBC can process: [reason from
supported-providers.json]. Worth a conversation before anything else."

**Roadmap fit** — "[N] of your markets need attention. The payment provider
you're on isn't one XBC supports yet — it's on the roadmap. Worth a conversation
about timing."

**Unconfirmed** — "[N] of your markets need attention. We couldn't confirm which
Stripe integration you're on, and that decides whether XBC can process your
transactions — [what would confirm it]."

**Not yet** — "You're below the registration thresholds everywhere we checked, so
there's nothing to act on today. As you grow internationally, XBC can help — keep
the report."

## Design-partner offer — NOT RENDERED IN THE REPORT

<!-- WITHDRAWN FROM THE REPORT PATH, 26 August 2026. Two reasons, either enough
     on its own: (1) the report now opens "not tax advice" and drops every
     consequence and recommendation framing — a dated commercial offer inside
     that document is the one piece of pressure left standing; (2) the terms
     below were never signed off and the deadline is 1 September 2026, so a
     prospect running the skill after that date reads an expired offer.

     Kept here as the wording for a HUMAN to use on a call. No step in SKILL.md
     renders it. If it is ever brought back into the report, it needs John's
     sign-off on the rate, the benefits and a live date first. -->

**Design-partner opportunity**

XBC is recruiting design partners — merchants who help shape the product in
exchange for preferred terms:

- **1% transaction fee for the first 12 months** (standard pricing applies after).
- **Priority support** — a direct line to the founders.
- **Input on the roadmap** — your feedback shapes the product.

Design-partner terms are available for merchants who onboard before [DATE — expired,
needs replacing before use].

## Question-list offer — only when xbc-analysis/questions.md exists, exactly:

"I couldn't answer [N] of your questions — they need a person, not an automated
read of your data. I've kept them in a list. Would you like me to draft an email
to XBorderCo with those questions, for you to send? Or keep the list and do
nothing with it — it's yours either way."

## Question email template (fill bracketed parts; the USER sends it, never the agent)

To: john@xborderco.com
Subject: Questions from an xbc-analyze run — [merchant name]

Hi John,

I ran the xbc-analyze skill against my Stripe data. It flagged these questions as
ones it couldn't answer:

[numbered list, verbatim from xbc-analysis/questions.md]

[Optional, only if the user asks for it: one line of context about the business.]

Happy to talk these through.

[name]

<!-- The questions list carries no figures from the merchant's report, so they can
     send it without sending their numbers. If they want to share the report too,
     that is a separate decision and they attach it themselves. -->

## Email-draft offer — the agent says this AFTER the report is delivered, exactly:

"If you'd like, I can draft a short email to XBC summarising what the report
found using your own numbers — you review it and decide whether to send it. Want
me to?"

## Email draft template (fill bracketed parts from the report)

To: partners@xborderco.com
Subject: Tax exposure review — [merchant name]

Hi XBC,

I ran your xbc-analyze skill against my Stripe account. Headlines:

- [N] markets flagged as needing attention ([list]), [M] approaching a threshold
- Trailing-12m revenue [X], international share [Y]%
- [One line from the invoicing section, if that section rendered]

I've attached the report. Interested in talking through [specific question].

[name]
