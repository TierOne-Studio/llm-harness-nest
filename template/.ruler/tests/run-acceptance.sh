#!/usr/bin/env bash
# run-acceptance.sh — acceptance tests for the project-agnostic NestJS harness.
#
# Validates the SHIPPED template tree (skills + agents + instructions.md + ruler.toml)
# directly — it does NOT require `ruler apply` to have run. This is the package's own
# regression gate: it proves the harness stays structurally sound, ships the NestJS
# backend guidance, AND stays free of coupling to any specific project (no "velocity"
# project names, no hardcoded ADR citations, no project-specific symbols leaking
# into the generic skills/agents) — and free of the frontend tier (that lives in
# the sibling llm-harness-react package).
#
# Run from anywhere:  bash <path>/template/.ruler/tests/run-acceptance.sh
# In the package repo: bash template/.ruler/tests/run-acceptance.sh

set -uo pipefail

# RULER_DIR = the .ruler/ tree this script ships inside (tests/ is one level down).
RULER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS="$RULER_DIR/skills"
AGENTS="$RULER_DIR/agents"
INSTRUCTIONS="$RULER_DIR/instructions.md"

for tool in bash grep awk sed find wc; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "PRE-FAIL: required tool '$tool' not found on PATH" >&2
    exit 2
  fi
done

PASS=0
FAIL=0
FAILED_TESTS=""

assert_true() {
  local name="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "PASS: $name"; PASS=$((PASS+1))
  else
    echo "FAIL: $name (command failed: $cmd)"
    FAIL=$((FAIL+1)); FAILED_TESTS="$FAILED_TESTS $name"
  fi
}

# agent_has_tool <agent-file> <Tool> — true if the YAML frontmatter grants <Tool>.
agent_has_tool() {
  awk '/^---$/{c++; next} c==1' "$1" | grep -qE "^[[:space:]]*-[[:space:]]+$2[[:space:]]*$"
}

# The canonical skills shipped by this NestJS harness (backend + shared tiers).
SKILL_LIST="async-error-handling bug-investigation code-simplifier cross-repo-workspace \
cyclomatic-complexity decision-rules design-review documentation-and-adrs \
failure-mode-analysis git-workflow js-performance-patterns meta-skill-hygiene plan-mode \
pushback-templates quality-gates repo-conventions rlm-explore spec-workflow tdd-workflow typescript-advanced-types \
\
database-transactions db-write-protocol nestjs-best-practices nestjs-clean-architecture \
nestjs-patterns nodejs-best-practices"

# Frontend skills live in the sibling React harness, never here.
FRONTEND_SKILLS="accessibility ai-ui-patterns bundle-size frontend-security playwright-best-practices react-2026 react-data-fetching react-design-patterns react-forms react-patterns react-performance react-routing react-state-management react-testing shadcn tailwind-v4-shadcn vite vitest"

AGENT_LIST="architect-reviewer code-reviewer qa-validator security-reviewer lessons-curator acceptance-verifier spec-steward"

# ---------------------------------------------------------------------------
echo "=== T1: Structure — instructions, ruler config, every skill + agent present ==="
assert_true "T1: instructions.md exists" "test -f '$INSTRUCTIONS'"
assert_true "T1: ruler.toml exists" "test -f '$RULER_DIR/ruler.toml'"
for s in $SKILL_LIST; do
  assert_true "T1: skill '$s' has SKILL.md" "test -f '$SKILLS/$s/SKILL.md'"
done
for a in $AGENT_LIST; do
  assert_true "T1: agent '$a' exists" "test -f '$AGENTS/$a.md'"
done

# ---------------------------------------------------------------------------
echo
echo "=== T2: Project-agnostic — NO coupling to any specific project (the headline) ==="
SEARCH_PATHS="$SKILLS $AGENTS $INSTRUCTIONS"
assert_true "T2: no 'spa-velocity' / 'api-velocity' references" \
  "! grep -rniE 'spa-velocity|api-velocity' $SEARCH_PATHS"
assert_true "T2: no project-specific token-contract symbol (localStorage.bearer_token)" \
  "! grep -rnE 'bearer_token' $SEARCH_PATHS"
assert_true "T2: no project-specific RBAC symbols (resolveOrgScope/PermissionsGuard/RoleService)" \
  "! grep -rnE 'resolveOrgScope|PermissionsGuard|\\bRoleService\\b' $SEARCH_PATHS"
# Numbered ADR citations must not appear as real citations. Allowed: generic placeholders
# (<repo-a>/<repo-b>), illustrative markers (ADR-00X / ADR-NNN), and the cross-repo example.
assert_true "T2: no hardcoded numbered ADR citations (only generic/illustrative allowed)" \
  "! grep -rnE 'ADR-0[0-9][0-9]' $SEARCH_PATHS | grep -vE 'repo-a|repo-b|illustrative|substitute|ambiguous in workspace|ADR-00[XY]'"
assert_true "T2: no 'in this repo, X already exists / established pattern here' assertions" \
  "! grep -rniE 'already in this repo|established pattern (in this repo|here)|tokens in this repo' $SEARCH_PATHS"

# ---------------------------------------------------------------------------
echo
echo "=== T3: instructions.md structure (priority profile P0..P9, NestJS title) ==="
assert_true "T3: title is generic (not '(api-velocity)')" \
  "! grep -qE '^# .*\\((spa|api)-velocity\\)' '$INSTRUCTIONS'"
assert_true "T3: title declares NestJS" "grep -qiE '^# .*NestJS' '$INSTRUCTIONS'"
assert_true "T3: title does NOT declare React/Fullstack (single-tier harness)" \
  "! grep -qiE '^# .*(React|Fullstack)' '$INSTRUCTIONS'"
for p in "P0" "P3" "P5" "P8" "P9"; do
  assert_true "T3: has section $p" "grep -qE '## $p ' '$INSTRUCTIONS'"
done
assert_true "T3: uses MUST/SHOULD/MAY normative language" \
  "grep -q 'MUST' '$INSTRUCTIONS' && grep -q 'SHOULD' '$INSTRUCTIONS' && grep -q 'MAY' '$INSTRUCTIONS'"
assert_true "T3: has Skill Pointers table" "grep -qiE '## skill[ -]pointers' '$INSTRUCTIONS'"
assert_true "T3: has Workflow chains table" "grep -qiE '## workflow chains' '$INSTRUCTIONS'"
assert_true "T3: P0 keeps the no-AI-attribution rule" \
  "grep -qiE 'Co-Authored-By: Claude|AI-attribution' '$INSTRUCTIONS'"
assert_true "T3: P0 keeps BOTH deploy gate AND DB-write gate" \
  "grep -qiE 'npm publish|production rollout' '$INSTRUCTIONS' && grep -qiE 'db-write-protocol|DB writes' '$INSTRUCTIONS'"

# ---------------------------------------------------------------------------
echo
echo "=== T4: Frontmatter well-formed (every skill + agent has name + description) ==="
for s in $SKILL_LIST; do
  f="$SKILLS/$s/SKILL.md"
  assert_true "T4: skill '$s' has name:" "grep -qE '^name:' '$f'"
  assert_true "T4: skill '$s' has description:" "grep -qE '^description:' '$f'"
done
for a in $AGENT_LIST; do
  f="$AGENTS/$a.md"
  assert_true "T4: agent '$a' has name:" "grep -qE '^name:' '$f'"
  assert_true "T4: agent '$a' has description:" "grep -qE '^description:' '$f'"
done

# ---------------------------------------------------------------------------
echo
echo "=== T5: Consumer-fill-in skeleton (repo-conventions) covers the API + contract ==="
RC="$SKILLS/repo-conventions/SKILL.md"
assert_true "T5: repo-conventions is a fill-in skeleton (has FILL IN placeholders)" \
  "grep -qi 'FILL IN' '$RC'"
assert_true "T5: repo-conventions keeps the BACKEND scaffold (RBAC/authz + persistence + errors)" \
  "grep -qiE 'RBAC|authz' '$RC' && grep -qiE 'persistence|repository' '$RC' && grep -qiE 'error' '$RC'"
assert_true "T5: repo-conventions documents the API contract" \
  "grep -qiE 'API contract' '$RC'"
assert_true "T5: cross-repo-workspace is generic (repo-a/repo-b placeholders or FILL IN)" \
  "grep -qiE '<repo-a>|<repo-b>|FILL IN' '$SKILLS/cross-repo-workspace/SKILL.md'"

# ---------------------------------------------------------------------------
echo
echo "=== T6: NestJS generic knowledge retained; frontend tier NOT shipped ==="
NCA="$SKILLS/nestjs-clean-architecture/SKILL.md"
assert_true "T6: clean-architecture keeps the 4-layer split" \
  "grep -qiE 'domain' '$NCA' && grep -qiE 'application' '$NCA' && grep -qiE 'infrastructure' '$NCA'"
assert_true "T6: clean-architecture keeps the dependency rule" \
  "grep -qiE 'dependency rule|domain .* infrastructure' '$NCA'"
assert_true "T6: nestjs-patterns covers cross-cutting + mixins" \
  "test -f '$SKILLS/nestjs-patterns/patterns/cross-cutting.md' && test -f '$SKILLS/nestjs-patterns/patterns/mixins.md'"
assert_true "T6: nestjs-best-practices retains rule files" \
  "[ \$(find '$SKILLS/nestjs-best-practices/rules' -name '*.md' | wc -l) -ge 10 ]"
assert_true "T6: db skills present (database-transactions + db-write-protocol)" \
  "test -f '$SKILLS/database-transactions/SKILL.md' && test -f '$SKILLS/db-write-protocol/SKILL.md'"
# Anti-regrowth: the frontend tier must never creep back into this package.
for s in $FRONTEND_SKILLS; do
  assert_true "T6: frontend skill '$s' NOT shipped" "! test -d '$SKILLS/$s'"
done
assert_true "T6: no react-* skill references anywhere in the shipped template" \
  "! grep -rnE 'react-(patterns|state-management|routing|data-fetching|forms|testing|performance|2026|design-patterns)' $SEARCH_PATHS"

# ---------------------------------------------------------------------------
echo
echo "=== T7: Review agents cover the NestJS surfaces (single-tier) ==="
SR="$AGENTS/security-reviewer.md"
assert_true "T7: security-reviewer keeps BACKEND surfaces (SQL injection / OWASP / guards)" \
  "grep -qiE 'SQL|injection' '$SR' && grep -qiE 'OWASP' '$SR'"
assert_true "T7: security-reviewer keeps the server-is-the-boundary principle" \
  "grep -qiE 'security boundary|authorizes? .*server-side' '$SR'"
CR="$AGENTS/code-reviewer.md"
assert_true "T7: code-reviewer references nestjs-* skills and NO react-* skills" \
  "grep -qE 'nestjs-' '$CR' && ! grep -qE 'react-' '$CR'"
assert_true "T7: lessons-curator domain map lists the nest stack" \
  "grep -qiE 'nestjs-' '$AGENTS/lessons-curator.md' && ! grep -qiE 'react-' '$AGENTS/lessons-curator.md'"

# ---------------------------------------------------------------------------
echo
echo "=== T8: Skill-pointer cross-reference integrity (named skills exist) ==="
for s in tdd-workflow design-review plan-mode repo-conventions nestjs-best-practices \
         nestjs-clean-architecture nestjs-patterns database-transactions db-write-protocol \
         decision-rules spec-workflow quality-gates; do
  assert_true "T8: instructions.md references '$s' AND its skill dir exists" \
    "grep -q '$s' '$INSTRUCTIONS' && test -d '$SKILLS/$s'"
done

# ---------------------------------------------------------------------------
echo
echo "=== T9: No stray dev artifacts in the shipped template ==="
assert_true "T9: no *.bak files under .ruler/" "[ \$(find '$RULER_DIR' -name '*.bak' | wc -l) -eq 0 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T10: Write-scope — spec-steward is the ONLY Edit/Write agent (no-leak guard) ==="
assert_true "T10: spec-steward has Edit" "agent_has_tool '$AGENTS/spec-steward.md' Edit"
assert_true "T10: spec-steward has Write" "agent_has_tool '$AGENTS/spec-steward.md' Write"
for a in $AGENT_LIST; do
  [ "$a" = "spec-steward" ] && continue
  assert_true "T10: '$a' has NO Edit (read-only sensor)" "! agent_has_tool '$AGENTS/$a.md' Edit"
  assert_true "T10: '$a' has NO Write (read-only sensor)" "! agent_has_tool '$AGENTS/$a.md' Write"
done

# ---------------------------------------------------------------------------
echo
echo "=== T11: Instruction budget + fast path + no duplicated conflict table ==="
# Hard token budget on the always-loaded profile. The single-tier profile must
# come in UNDER the fullstack edition (350/3800). Raise ONLY with eval evidence.
assert_true "T11: instructions.md within line budget (<= 320 lines)" \
  "[ \$(wc -l < '$INSTRUCTIONS') -le 320 ]"
assert_true "T11: instructions.md within word budget (<= 3200 words)" \
  "[ \$(wc -w < '$INSTRUCTIONS') -le 3200 ]"
assert_true "T11: fast/full path declaration section exists (P3.6)" \
  "grep -q 'Path: fast' '$INSTRUCTIONS' && grep -q 'Path: full' '$INSTRUCTIONS'"
assert_true "T11: P8.1 is the verification line, not a self-scored rubric" \
  "grep -q 'Verified:' '$INSTRUCTIONS' && ! grep -q '5 × 0.20' '$INSTRUCTIONS'"
assert_true "T11: P3.5 stays a pointer — no conflict table duplicated from decision-rules §6" \
  "! awk '/^### P3.5/,/^### P3.6/' '$INSTRUCTIONS' | grep -q '^|'"
assert_true "T11: decision-rules §6 declares itself canonical" \
  "grep -qi 'CANONICAL' '$SKILLS/decision-rules/SKILL.md'"

# ---------------------------------------------------------------------------
echo
echo "=== T12: De-duplication — no compiled AGENTS.md / build tooling in the payload ==="
assert_true "T12: nestjs-best-practices ships no compiled AGENTS.md" \
  "! test -f '$SKILLS/nestjs-best-practices/AGENTS.md'"
assert_true "T12: nestjs-best-practices ships no build scripts/" \
  "! test -d '$SKILLS/nestjs-best-practices/scripts'"
assert_true "T12: no skill ships a compiled AGENTS.md (anti-regrowth, library-wide)" \
  "[ \$(find '$SKILLS' -name 'AGENTS.md' | wc -l) -eq 0 ]"
assert_true "T12: no skill ships a build scripts/ directory" \
  "[ \$(find '$SKILLS' -type d -name 'scripts' | wc -l) -eq 0 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T13: Deterministic gates shipped (permission template) + skill-size hygiene ==="
CS="$SKILLS/quality-gates/templates/claude-settings.json"
assert_true "T13: claude-settings.json template exists" "test -f '$CS'"
assert_true "T13: it denies pushes to main" "grep -q 'git push origin main' '$CS'"
assert_true "T13: it prompts on publish + DB CLIs + rm -rf" \
  "grep -q 'npm publish' '$CS' && grep -q 'psql' '$CS' && grep -q 'rm -rf' '$CS'"
# Skill-size ceiling: SKILL.md is the index; depth belongs in topic files read on
# demand (the nestjs-patterns layout). Warn > 400 lines, fail > 800.
for f in "$SKILLS"/*/SKILL.md; do
  lines=$(wc -l < "$f")
  s=$(basename "$(dirname "$f")")
  if [ "$lines" -gt 400 ] && [ "$lines" -le 800 ]; then
    echo "WARN: skill '$s' SKILL.md is $lines lines (> 400) — consider index+topics split"
  fi
  assert_true "T13: skill '$s' SKILL.md <= 800 lines (index+topics beyond that)" \
    "[ $lines -le 800 ]"
done

# ---------------------------------------------------------------------------
echo
echo "=== T14: Relative-link integrity — skill-internal file pointers resolve ==="
# Index-style skills point at topic/rule/pattern files; a broken pointer ships a
# dead end to every consumer. A pointer resolves from the referencing file's dir
# OR from the skill root (the common convention). The leading-boundary group
# keeps substrings inside URLs and other skills' names from false-matching.
BROKEN_LINKS=0
while IFS= read -r f; do
  d=$(dirname "$f")
  rel=${f#$SKILLS/}
  skillroot="$SKILLS/${rel%%/*}"
  for ref in $(grep -oE '(^|[^A-Za-z0-9_/.-])(\.\./)?(topics|references|reference|templates|patterns|rules)/[A-Za-z0-9._/-]+' "$f" \
                 | sed -E 's/^[^A-Za-z0-9.]*//' | sort -u); do
    if [ ! -e "$d/$ref" ] && [ ! -e "$skillroot/$ref" ]; then
      echo "  BROKEN: $rel → $ref"
      BROKEN_LINKS=$((BROKEN_LINKS+1))
    fi
  done
done < <(find "$SKILLS" -name '*.md')
assert_true "T14: every skill-internal relative pointer resolves to a real file" \
  "[ $BROKEN_LINKS -eq 0 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T16: Harness metadata — every skill declares tier/family/gist ==="
for s in $SKILL_LIST; do
  f="$SKILLS/$s/SKILL.md"
  assert_true "T16: skill '$s' has harness tier (backend|shared) /family/gist" \
    "grep -q '^harness:' '$f' && grep -qE '^  tier: (backend|shared)$' '$f' && grep -qE '^  family: [a-z-]+$' '$f' && grep -qE '^  gist: \"' '$f'"
done

# ---------------------------------------------------------------------------
echo
echo "=== T15: Skill catalog — README lists every skill, and only real skills ==="
CATALOG="$SKILLS/README.md"
assert_true "T15: skills/README.md (the visual catalog) exists" "test -f '$CATALOG'"
for d in "$SKILLS"/*/; do
  s=$(basename "$d")
  assert_true "T15: catalog lists '$s'" "grep -q '](./$s/SKILL.md)' '$CATALOG'"
done
for s in $(grep -oE '\]\(\./[A-Za-z0-9-]+/SKILL\.md\)' "$CATALOG" | sed -E 's|\]\(\./([^/]+)/SKILL\.md\)|\1|' | sort -u); do
  assert_true "T15: catalog entry '$s' is a real skill dir" "test -d '$SKILLS/$s'"
done

# ---------------------------------------------------------------------------
echo
echo "==========================="
echo "Acceptance results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi
exit 0
