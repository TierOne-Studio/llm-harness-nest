# NestJS Best Practices — provenance

Vendored from [Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills)
(MIT, author Kadajett; version per `SKILL.md` frontmatter), adapted for this harness:
the asks-first dependency policy and the `repo-conventions` precedence note in
`SKILL.md` are harness additions.

What ships here:

- `SKILL.md` — index: categories, rule list, and the asks-first dependency policy.
- `rules/` — one file per rule (40 rules across 10 categories). These are the
  canonical, consumable form; read individual files on demand.

Intentionally **not** shipped: upstream's compiled single-file build (`AGENTS.md`)
and its build `scripts/` — the compiled file duplicates `rules/` byte-for-byte in
content and the two copies drift, and the build tooling is upstream-repo concern,
not template payload.

To pull upstream rule updates, re-vendor `rules/` from the upstream repo and
re-apply the harness adaptations in `SKILL.md`.
