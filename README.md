# XBC Skills

Internal collection of [agent skills](https://docs.claude.com/en/docs/claude-code/skills) for
XBorderCo. Private — for XBC team use only, not for distribution.

Right now these target **Claude Code** (each skill is a `SKILL.md`). The repo is
structured so individual skills can grow agent-agnostic over time without moving
anything.

## Skills

| Skill | What it does |
|-------|--------------|
| [`xbc-analyze`](skills/xbc-analyze/) | Read-only analysis of a merchant's Stripe account → tax-exposure by country (registration thresholds crossed/approaching), growth simulation, and payment/compliance cost comparison (Paddle, Lemon Squeezy, Stripe Managed Payments, DIY, XBC). Everything runs locally; the merchant keeps the markdown reports. See its [`SKILL.md`](skills/xbc-analyze/SKILL.md) and [`SECURITY.md`](skills/xbc-analyze/SECURITY.md). |

## Install

Clone once, then symlink the skills you want into your Claude skills directory so
`git pull` keeps them current.

```bash
# 1. Clone (uses your own GitHub access — you must be a collaborator)
gh repo clone shanegrayxbc/xbc-skills
# or: git clone git@github.com:shanegrayxbc/xbc-skills.git
cd xbc-skills

# 2. Symlink a skill into your global Claude skills dir
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/xbc-analyze" ~/.claude/skills/xbc-analyze
```

Prefer it scoped to one project instead of globally? Symlink into that repo's
`.claude/skills/` instead of `~/.claude/skills/`.

Prefer a copy over a symlink (no auto-updates, but self-contained)?

```bash
cp -R skills/xbc-analyze ~/.claude/skills/xbc-analyze
```

### Updating

```bash
git -C path/to/xbc-skills pull   # symlinked skills update automatically
```

If you copied instead of symlinked, re-copy after pulling.

## Using a skill

In Claude Code, invoke it by name (`/xbc-analyze`) or just describe the task —
Claude matches it from the skill's description. `xbc-analyze` needs Node.js 18+
and a **read-only restricted** Stripe key you create; it never touches a secret
key and nothing leaves your machine. Read the skill's `SKILL.md` first.

## Adding a new skill

1. Create `skills/<your-skill>/` with a `SKILL.md` (name + description frontmatter,
   then the instructions). Keep heavy detail in bundled files the skill reads on
   demand — see the [`write-a-skill`](https://github.com/mattpocock/skills) pattern
   for progressive disclosure.
2. Anything generated at runtime (data dumps, `.env`, `node_modules/`) must be
   gitignored inside the skill — see `skills/xbc-analyze/.gitignore` for the model.
   Never commit secrets or merchant data.
3. Add a row to the **Skills** table above, commit, and push.

---

© XBorderCo — internal. Do not redistribute.
