# XBC Skills

Internal collection of [agent skills](https://agentskills.io) for XBorderCo.
**Private — for XBC team and hand-picked prospects only, not for public
distribution.**

Skills follow the open Agent Skills standard and install into any compatible
agent (Claude Code, Cursor, Codex, OpenCode, Cline, …) via the
[`skills` CLI](https://github.com/vercel-labs/skills) — `npx skills add`. There
is no Claude-specific plugin packaging; the same folder works everywhere.

## Skills

| Skill | What it does |
|-------|--------------|
| [`xbc-analyze`](skills/xbc-analyze/) | Read-only analysis of a merchant's Stripe account → tax-exposure by country (registration thresholds crossed/approaching), growth simulation, and payment/compliance cost comparison (Paddle, Lemon Squeezy, Stripe Managed Payments, DIY, XBC). Closes with a fit assessment and an optional design-partner CTA. Opens with an offered security audit. Everything runs locally; the merchant keeps the markdown reports. See its [`SKILL.md`](skills/xbc-analyze/SKILL.md) and [`SECURITY.md`](skills/xbc-analyze/SECURITY.md). |

## Install

The repo is **private** — you'll be invited as a GitHub collaborator. The CLI
clones it with **your own git credentials**, so install whichever way your git
auth is already set up — both work:

```bash
# HTTPS — needs gh auth / a GITHUB_TOKEN / an HTTPS credential helper
npx skills add shanegrayxbc/xbc-skills

# SSH — needs an SSH key with access to the repo (check with: ssh-add -l)
npx skills add git@github.com:shanegrayxbc/xbc-skills.git
```

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
npx skills add shanegrayxbc/xbc-skills    # re-run to pull the latest main
```

> **Why re-add instead of `npx skills update`?** For *private* repos the CLI
> can't compute a folder hash, so `npx skills update` / `npx skills check`
> report "skipped (reinstall needed)" and don't actually pull
> ([vercel-labs/skills#162](https://github.com/vercel-labs/skills/issues/162)).
> Re-running `npx skills add` is the reliable refresh until that's fixed. Once
> the repo is public, `npx skills update` works normally.

### Managing

```bash
npx skills list              # what's installed
npx skills remove xbc-analyze
```

## Using a skill

Once installed, your agent discovers each skill from its description — just
describe the task ("analyse my Stripe account for cross-border tax exposure")
and it runs the right one. `xbc-analyze` needs **Node.js 18+** and a
**read-only restricted** Stripe key you create; it never touches a secret key
and nothing leaves your machine. Read the skill's `SKILL.md` first.

> **Note on `xbc-analyze`'s local files.** It runs real code that writes a
> `.env` (your Stripe key), installs `node_modules/`, and saves fetched data and
> reports into `xbc-analysis/` *inside the installed skill directory*. Treat
> these as ephemeral — the skill tells you to delete `.env` and revoke the key
> when you're done. Re-running `npx skills add` to update may reset the skill
> directory, so copy out any reports you want to keep.

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
