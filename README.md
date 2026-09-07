# XBC Skills

Public collection of [agent skills](https://agentskills.io) published by
XBorderCo. Free to install and use; see [LICENSE](LICENSE).

Skills follow the open Agent Skills standard and install into any compatible
agent (Claude Code, Cursor, Codex, OpenCode, Cline, …) via the
[`skills` CLI](https://github.com/vercel-labs/skills) — `npx skills add`. There
is no Claude-specific plugin packaging; the same folder works everywhere.

## Skills

| Skill | What it does |
|-------|--------------|
| [`xbc-analyze`](skills/xbc-analyze/) | Read-only analysis of a merchant's Stripe account → one markdown report: revenue by country, registration thresholds crossed or approaching (tested in each jurisdiction's own currency and measurement window), what their invoices show about business customers and tax numbers, which of their markets XBC covers, and what integrating would involve. Closes with a fit assessment. Opens with an offered security audit. Everything runs locally; the merchant keeps the report. See its [`SKILL.md`](skills/xbc-analyze/SKILL.md) and [`SECURITY.md`](skills/xbc-analyze/SECURITY.md). |

## Install

```bash
npx skills add xborderco/xbc-skills
```

No account, token, or SSH key needed — the repo is public.

The CLI auto-detects which agents you have installed and adds the skill to each
one (`.claude/skills/` for Claude Code, `.agents/skills/` for Cursor/Codex/etc.).
Useful flags:

- `-g, --global` — install for all your projects (`~/.claude/skills/`, etc.)
  instead of just the current one.
- `--skill xbc-analyze` — install one named skill rather than everything in the
  repo.
- `--copy` — copy the files instead of the default **symlink** (the CLI symlinks
  back to a single local clone so updates are one source of truth; you never wire
  up symlinks by hand).

### Updating

```bash
npx skills check     # what's out of date
npx skills update    # pull the latest main
```

### Managing

```bash
npx skills list              # what's installed
npx skills remove xbc-analyze
```

## Using a skill

Once installed, your agent discovers each skill from its description — just
describe the task ("analyse my Stripe account for cross-border tax exposure")
and it runs the right one. `xbc-analyze` needs **Node.js 18+** and either a
**read-only restricted** Stripe key you create or a Stripe Dashboard CSV export;
it never touches a secret key and sends nothing to XBorderCo. Two things do leave
your machine, and neither is the skill's code: `npx` may fetch tooling from the
npm registry, and what your agent reads from the report goes to its model
provider like the rest of your chat. Read the skill's `SKILL.md` and
`SECURITY.md` first.

> **Note on `xbc-analyze`'s local files.** It runs real code that writes a
> `.env` (your Stripe key), installs `node_modules/`, and saves fetched data and
> reports into `xbc-analysis/` *inside the installed skill directory*. Treat
> these as ephemeral — the skill tells you to delete `.env` and revoke the key
> when you're done. Re-running `npx skills add` to update may reset the skill
> directory, so copy out any report you want to keep.

## Repo layout

```text
xbc-skills/
├── skills/
│   └── xbc-analyze/       # a skill (SKILL.md + its bundled code/assets)
├── CLAUDE.md
└── README.md
```

Every folder under `skills/` with a `SKILL.md` is auto-discovered by
`npx skills add` — there is no manifest to register skills in.

## Adding a new skill

1. Create `skills/<your-skill>/SKILL.md`. The frontmatter `name` **must match the
   folder name** (lowercase, hyphens), with a `description`; then the
   instructions — push heavy detail into bundled files read on demand
   (progressive disclosure).
2. Anything generated at runtime (data, `.env`, `node_modules/`) must be gitignored
   inside the skill — see `skills/xbc-analyze/.gitignore` for the model. Never
   commit secrets or merchant data. If the skill ships runnable code, pin
   dependencies (commit the lockfile) for a reproducible install.
3. Add a row to the **Skills** table above, commit, and push. Collaborators pick
   it up by re-running `npx skills add`.

---

© XBorderCo — internal. Do not redistribute.
</content>
</invoke>
