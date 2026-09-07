# Maintainer tools

Not part of the skill. Nothing in here runs on a merchant's machine — the skill's
compute scripts never touch the network, and `assets/thresholds.json` ships as a
reviewed, committed file so two merchants analysed a week apart get the same
answer.

## `refresh-thresholds.ts`

Regenerates `assets/thresholds.json` from Stripe Tax's per-jurisdiction docs.

```bash
npm run refresh-thresholds              # uses the cached pages in tools/.cache/
npm run refresh-thresholds -- --refresh # re-fetch every page from docs.stripe.com
```

The workflow is **generate → read the diff → commit**. Re-run quarterly, or when
Stripe updates. The run prints two lists you must not skip:

- **MISSING FX RATES** — currencies with no entry in `assets/fx-rates.json`.
  Those rows cannot be scored; compute reports them as `insufficient_data`
  rather than undercounting revenue into a false "clear".
- **NEEDS REVIEW** — rows the parser refused to trust. It gives up rather than
  guessing, so this list is the point of the tool, not a nuisance. Compute never
  scores a `needs_review` row in either direction: it reports `insufficient_data`
  with the `review_reasons` attached, however much revenue it carries. A page
  with no threshold field at all is also marked `unscorable`, so an unread
  threshold can never score as first-sale liability.

### Source note

Amounts come from Stripe's published thresholds, which is what the merchant sees
in their own Stripe Tax **Needs attention** tab — so the report agrees with the
dashboard they already have. Each row also carries `source_url` pointing at the
underlying tax authority, which is what settles any dispute.

Stripe's docs index links most jurisdictions **without** the `/collect-tax`
path segment, and those URLs render a generic regional page with no threshold on
it. The generator rebuilds the URL rather than following the href.

### `threshold-overrides.json`

Hand-authored corrections, merged last. `patch` merges into a generated row by
code, `add` appends rows Stripe has no concept of (the scheme-aware EU group row,
Canada federal), `drop` removes generated rows.

A patch clears `needs_review` **only** when it explicitly sets
`"needs_review": false`. Patching a row's note no longer silences a flag raised
about its amount.

The 27 EU member rows are dropped on purpose: Stripe publishes one per member,
each reading "1 transaction", which is the non-Union OSS view. Rendering them
would show a merchant 27 obligations for what is a single OSS registration, and
would lose the Union OSS EUR 10,000 micro-threshold entirely.
