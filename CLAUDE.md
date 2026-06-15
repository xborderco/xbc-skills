# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

A private collection of agent skills for XBorderCo, packaged as a **Claude Code
plugin marketplace**. `.claude-plugin/marketplace.json` is the catalog;
`.claude-plugin/plugin.json` defines the single `xbc` plugin and lists which skills
it ships. Each skill is a self-contained directory under `skills/<name>/` with a
`SKILL.md`. Target is Claude Code today; keep skills portable so they can go
agent-agnostic later.

## Conventions

- kebab-case for skill folder names and files.
- No `any` in TypeScript.
- Each skill's `SKILL.md` frontmatter needs `name` and `description`; lead the body
  with the rules/steps and push heavy detail into bundled files the skill reads on
  demand (progressive disclosure).
- Never commit secrets, real merchant data, `node_modules/`, or runtime output.
  Each skill carries its own `.gitignore` for these — extend it, don't rely solely
  on the root one.
- No "Co-Authored-By" / "Generated with Claude Code" lines in commits or PRs.

## Adding or editing a skill

1. Work inside `skills/<name>/`.
2. When adding a skill, register it in `.claude-plugin/plugin.json`'s `skills`
   array (`"./skills/<name>"`) and bump `version` in both `plugin.json` and
   `marketplace.json` so collaborators' `/plugin update` picks it up.
3. Update the **Skills** table in `README.md`.
4. If the skill ships runnable code, pin dependencies (commit the lockfile) so a
   collaborator gets a reproducible install.
