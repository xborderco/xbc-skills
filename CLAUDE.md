# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

A private collection of agent skills for XBorderCo, following the open
[Agent Skills standard](https://agentskills.io) and installed with the
[`skills` CLI](https://github.com/vercel-labs/skills) (`npx skills add`). Each
skill is a self-contained directory under `skills/<name>/` with a `SKILL.md`
whose frontmatter `name` matches the folder. There is no plugin manifest —
`npx skills add` auto-discovers every folder under `skills/`. The skills are
agent-agnostic: the same folder installs into Claude Code, Cursor, Codex, and
others.

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

1. Work inside `skills/<name>/`. The `SKILL.md` frontmatter `name` must match the
   folder name (lowercase, hyphens). No manifest to register — `npx skills add`
   discovers any `skills/<name>/SKILL.md` automatically.
2. Update the **Skills** table in `README.md`.
3. If the skill ships runnable code, pin dependencies (commit the lockfile) so a
   collaborator gets a reproducible install.
4. Collaborators pick up new/changed skills by re-running `npx skills add`
   (`npx skills update` is unreliable on private repos — see README).
