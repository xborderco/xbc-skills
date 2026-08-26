# Security — verifiable claims

This skill is designed to be read before it is run. Invite your agent to review
every file. Each claim below states how to verify it yourself.

1. **Read-only by construction.** No action calls any create/update/cancel/delete
   method. The single intentional non-GET request is in `actions/check-key.ts`:
   a DELETE on a customer id that cannot exist, used to PROVE your key is
   read-only (read-only key → 403, the pass condition; writable key → the skill
   tells you to replace it). Verify: `grep -rn "\.create\|\.update\|\.cancel\|\.del(" actions/ compute/ src/`
2. **One network host.** All network access goes through the official `stripe`
   npm SDK to `api.stripe.com`. Compute scripts have no network code at all.
   Verify: `grep -rn "http\|fetch(\|require('net'\|axios" actions/ compute/ src/` —
   and check `package.json`: three dependencies (`stripe`, `dotenv`, `tsx`), all
   pinned via `package-lock.json`.
3. **Your key stays in `.env`.** Loaded only by `src/run.ts` via dotenv; never a
   CLI argument, never printed, never written to any output file. `.env` is
   gitignored. Verify: read `src/run.ts` (~100 lines); `grep -rn "STRIPE_API_KEY" .`
4. **Secret keys are refused.** The runner exits if the key doesn't start with
   `rk_` — it will not run with your `sk_` secret key at all.
5. **The CSV path touches no network at all.** If you import a Stripe Dashboard
   export instead of connecting a key (`src/import-csv.ts`), nothing in this
   skill opens a connection: the importer reads your file, writes JSON into
   `xbc-analysis/raw/`, and exits. It never loads the Stripe SDK. Verify: read
   `src/import-csv.ts` (~250 lines) — its only imports are `node:fs`,
   `node:path` and `node:url`.
6. **Your data stays local.** Fetched data goes to `xbc-analysis/` (gitignored)
   inside this directory; reports are local markdown. Nothing is uploaded,
   nothing phones home, there is no telemetry of any kind. This includes the
   question list: if the skill can't answer something and records it in
   `xbc-analysis/questions.md`, that file stays on your machine. The skill can
   DRAFT an email to XBorderCo containing those questions, but you send it — it
   has no ability to send mail itself. Verify: `grep -rn "smtp\|sendmail\|mailto\|nodemailer" .`
7. **No install-time code execution from us.** This package has no postinstall
   scripts. Verify: `grep -n "postinstall\|preinstall" package.json`. (For full
   honesty: `npm install` does run the standard native build scripts of the dev
   tooling — `esbuild` via `tsx`, and the optional macOS-only `fsevents` — pulled
   from the public npm registry with pinned integrity hashes. These are not XBC
   code and run before any Stripe key is ever read.)
8. **When you're done**: delete `.env` and delete the restricted key in your
   Stripe dashboard. Keys cost nothing to create and recreate.

Found something that contradicts any of this? Please tell us — that's a bug of
the worst kind: hello@xborderco.com.
