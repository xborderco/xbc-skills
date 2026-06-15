# XBC Skills

Internal collection of [agent skills](https://docs.claude.com/en/docs/claude-code/skills) for
XBorderCo, packaged as a **Claude Code plugin marketplace**. Private — for XBC team
use only, not for distribution.

Skills target **Claude Code** today. The repo is structured so it can grow more
skills (and go agent-agnostic) without changing how anyone installs it.

## Skills

| Skill | What it does |
|-------|--------------|
| [`xbc-analyze`](skills/xbc-analyze/) | Read-only analysis of a merchant's Stripe account → tax-exposure by country (registration thresholds crossed/approaching), growth simulation, and payment/compliance cost comparison (Paddle, Lemon Squeezy, Stripe Managed Payments, DIY, XBC). Everything runs locally; the merchant keeps the markdown reports. See its [`SKILL.md`](skills/xbc-analyze/SKILL.md) and [`SECURITY.md`](skills/xbc-analyze/SECURITY.md). |

## Install

This repo is a marketplace. Install from inside Claude Code — no clone, no
symlinks. You need read access to this private repo (you'll be invited as a
collaborator). **The repo can stay private** — Claude Code clones it with your own
GitHub credentials.

Use the **SSH URL** (most reliable — works for anyone with an SSH key that has
repo access):

```text
/plugin marketplace add git@github.com:shanegrayxbc/xbc-skills.git
/plugin install xbc@xbc-skills
```

That's it — the `xbc` plugin bundles every skill in this repo, so you get
`xbc-analyze` (and anything added later).

> The shorthand `/plugin marketplace add shanegrayxbc/xbc-skills` also works, but
> it clones over **HTTPS**, which only succeeds if your git HTTPS auth (e.g.
> `gh auth login` or a `GITHUB_TOKEN`) is set for a GitHub account that can see
> this private repo. The SSH URL above sidesteps that, so prefer it.

### Updating

When new commits land on `main`:

```text
/plugin update xbc@xbc-skills
```

Or refresh the catalog first with `/plugin marketplace update`, then update.

### Managing

```text
/plugin marketplace list          # marketplaces you've added
/plugin                           # browse / enable / disable installed plugins
/plugin uninstall xbc@xbc-skills  # remove the plugin
```

## Using a skill

Once installed, Claude discovers each skill from its description — just describe
the task ("analyse my Stripe account for cross-border tax exposure") and it runs
the right one. `xbc-analyze` needs **Node.js 18+** and a **read-only restricted**
Stripe key you create; it never touches a secret key and nothing leaves your
machine. Read the skill's `SKILL.md` first.

> **Note on `xbc-analyze`'s local files.** It runs real code that writes a
> `.env` (your Stripe key), installs `node_modules/`, and saves fetched data and
> reports into `xbc-analysis/` *inside the installed skill directory*. Treat
> these as ephemeral — the skill tells you to delete `.env` and revoke the key
> when you're done. A `/plugin update` may reset the skill directory, so copy out
> any reports you want to keep.

## Repo layout

```text
xbc-skills/
├── .claude-plugin/
│   ├── marketplace.json   # catalog — what /plugin marketplace add reads
│   └── plugin.json        # the "xbc" plugin manifest; lists which skills ship
├── skills/
│   └── xbc-analyze/       # a skill (SKILL.md + its bundled code/assets)
├── CLAUDE.md
└── README.md
```

## Adding a new skill

1. Create `skills/<your-skill>/` with a `SKILL.md` (name + description frontmatter,
   then the instructions; push heavy detail into bundled files read on demand).
2. Add its path to the `skills` array in
   [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), e.g.
   `"./skills/<your-skill>"`.
3. Bump `version` in `plugin.json` and `marketplace.json` so collaborators'
   `/plugin update` picks it up.
4. Anything generated at runtime (data, `.env`, `node_modules/`) must be gitignored
   inside the skill — see `skills/xbc-analyze/.gitignore` for the model. Never
   commit secrets or merchant data.
5. Add a row to the **Skills** table above, commit, and push.

---

© XBorderCo — internal. Do not redistribute.
