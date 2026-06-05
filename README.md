# @tierone/llm-harness-nest

An **LLM agent harness** for NestJS projects, distributed as an installable `.ruler/` payload.

> In the sense of [Martin Fowler's *Harness Engineering*](https://martinfowler.com/articles/harness-engineering.html):
> `Agent = Model + Harness`. The harness is everything around the model — the
> **guides** (skills, instructions, conventions) that steer it *before* it acts,
> and the **sensors** (review agents) that catch problems *after*. This package
> ships that harness so you can drop it into any NestJS repo.

It installs into your project's `.ruler/` directory, which [ruler](https://github.com/intellectronica/ruler)
fans out to `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, Cursor, etc.

## Install

This is **not** a runtime dependency. It copies files into your repo and gets out
of the way — nothing is left in `node_modules`.

```bash
# First time — creates ./.ruler and copies the harness in
npx @tierone/llm-harness-nest init

# Later — pull a newer harness version, merging your local edits (3-way)
npx @tierone/llm-harness-nest update
```

Then regenerate your agent config:

```bash
npx ruler apply
```

## What you get

```
.ruler/
├── instructions.md        # the senior-engineer operating profile (P0–P9)
├── ruler.toml             # ruler fan-out config (claude / copilot / codex / cursor)
├── agents/                # review subagents (sensors)
│   ├── architect-reviewer.md
│   ├── code-reviewer.md
│   ├── qa-validator.md
│   ├── security-reviewer.md
│   └── lessons-curator.md
└── skills/                # guides — tdd-workflow, design-review, plan-mode,
                           # nestjs-best-practices, repo-conventions, … (24 skills)
```

## Commands

| Command | What it does |
|---|---|
| `init` | Copy the harness into `./.ruler` (creates it if missing). Refuses if already installed — use `update`. |
| `update` | 3-way-merge a newer version into `./.ruler`, preserving your local edits. |
| `version` | Print the installed package version. |
| `help` | Usage. |

### Flags

| Flag | Applies to | Effect |
|---|---|---|
| `--force` | `init` | Overwrite an existing `.ruler` (unrelated files are preserved). |
| `--dry-run` | `update` | Report what would change without writing anything. |
| `--cwd DIR` | both | Operate on `DIR` instead of the current directory. |

## How `update` works (3-way merge)

On `init`, a sentinel `.ruler/.harness-version.json` records the installed version.
On `update`:

1. The **BASE** (the version you last installed) is downloaded via `npm pack`.
2. Each file is reconciled across **BASE → your local copy → the new version**
   using `git merge-file` — the same engine git uses for merges.
3. **Your edits and upstream edits both survive** when they don't overlap.
4. **Overlapping edits** leave standard `<<<<<<<` conflict markers, the conflicted
   files are listed, and the version is **not** advanced until you resolve them and
   re-run `update`.
5. Files you created yourself (never shipped by the harness) are left untouched.

`update` requires `git`, `npm`, and `tar` on `PATH` (it downloads the base
version via `npm pack`, extracts it with `tar`, and merges with `git merge-file`).
`init` has no such requirements. The shipped template is text-only.

## License

[MIT](./LICENSE) © TierOne Studio
