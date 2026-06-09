#!/usr/bin/env bash
# run-acceptance.sh — acceptance tests for the project-agnostic NestJS harness.
#
# Validates the SHIPPED template tree (skills + agents + instructions.md + ruler.toml)
# directly — it does NOT require `ruler apply` to have run. This is the package's own
# regression gate: it proves the harness stays structurally sound AND free of coupling
# to any specific project (no "velocity" project names, no hardcoded ADR citations,
# no project-specific RBAC symbols leaking into the generic skills/agents).
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

# The canonical skills shipped by this harness.
SKILL_LIST="async-error-handling bug-investigation code-simplifier cross-repo-workspace \
cyclomatic-complexity database-transactions db-write-protocol decision-rules design-review \
documentation-and-adrs failure-mode-analysis git-workflow js-performance-patterns \
meta-skill-hygiene nestjs-best-practices nestjs-clean-architecture nestjs-patterns \
nodejs-best-practices plan-mode pushback-templates repo-conventions rlm-explore \
spec-workflow tdd-workflow typescript-advanced-types"

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
assert_true "T1: nestjs-best-practices has a rules/ dir with content" \
  "test -d '$SKILLS/nestjs-best-practices/rules' && [ \$(find '$SKILLS/nestjs-best-practices/rules' -name '*.md' | wc -l) -gt 0 ]"
assert_true "T1: nestjs-patterns has a patterns/ dir with content" \
  "test -d '$SKILLS/nestjs-patterns/patterns' && [ \$(find '$SKILLS/nestjs-patterns/patterns' -name '*.md' | wc -l) -gt 0 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T2: Project-agnostic — NO coupling to any specific project (the headline) ==="
# Search skills + agents + instructions (NOT this tests/ dir, whose patterns name the tokens).
SEARCH_PATHS="$SKILLS $AGENTS $INSTRUCTIONS"
assert_true "T2: no 'api-velocity' / 'spa-velocity' references" \
  "! grep -rniE 'api-velocity|spa-velocity' $SEARCH_PATHS"
assert_true "T2: no project-specific RBAC symbols (resolveOrgScope/PermissionsGuard/RoleService)" \
  "! grep -rnE 'resolveOrgScope|PermissionsGuard|\\bRoleService\\b' $SEARCH_PATHS"
assert_true "T2: no hardcoded project module paths (admin/rbac, RbacModule)" \
  "! grep -rnE 'admin/rbac|RbacModule' $SEARCH_PATHS"
# Numbered ADR citations (ADR-001..ADR-099) must not appear as real citations.
# Allowed: intentional generic placeholders (<repo-a>/<repo-b>), illustrative markers,
# the cross-repo "Per ADR-002" counter-example, and ADR-NNN/ADR-XXX templates.
assert_true "T2: no hardcoded numbered ADR citations (only generic/illustrative allowed)" \
  "! grep -rnE 'ADR-0[0-9][0-9]' $SEARCH_PATHS | grep -vE 'repo-a|repo-b|illustrative|substitute|ambiguous in workspace'"
assert_true "T2: no 'this repo already has / established pattern in this repo' assertions" \
  "! grep -rniE 'already in this repo|established pattern (in this repo|here)' $SEARCH_PATHS"

# ---------------------------------------------------------------------------
echo
echo "=== T3: instructions.md structure (priority profile P0..P9, generic title) ==="
assert_true "T3: title is generic (not '(api-velocity)')" \
  "! grep -qE '^# .*\\(api-velocity\\)' '$INSTRUCTIONS'"
assert_true "T3: title names the framework (NestJS)" "grep -qiE '^# .*NestJS' '$INSTRUCTIONS'"
for p in "P0" "P3" "P5" "P8" "P9"; do
  assert_true "T3: has section $p" "grep -qE '## $p ' '$INSTRUCTIONS'"
done
assert_true "T3: uses MUST/SHOULD/MAY normative language" \
  "grep -q 'MUST' '$INSTRUCTIONS' && grep -q 'SHOULD' '$INSTRUCTIONS' && grep -q 'MAY' '$INSTRUCTIONS'"
assert_true "T3: has Skill Pointers table" "grep -qE '## Skill Pointers' '$INSTRUCTIONS'"
assert_true "T3: has Workflow chains table" "grep -qE '## Workflow chains' '$INSTRUCTIONS'"
assert_true "T3: P0 keeps the no-AI-attribution rule" \
  "grep -qiE 'Co-Authored-By: Claude|AI-attribution' '$INSTRUCTIONS'"

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
echo "=== T5: Consumer-fill-in skeletons (repo-conventions, cross-repo-workspace) ==="
assert_true "T5: repo-conventions is a fill-in skeleton (has FILL IN placeholders)" \
  "grep -qi 'FILL IN' '$SKILLS/repo-conventions/SKILL.md'"
assert_true "T5: repo-conventions keeps the section scaffold (RBAC/authz + persistence + errors)" \
  "grep -qiE 'RBAC|authz' '$SKILLS/repo-conventions/SKILL.md' && grep -qiE 'persistence|repository' '$SKILLS/repo-conventions/SKILL.md' && grep -qiE 'error' '$SKILLS/repo-conventions/SKILL.md'"
assert_true "T5: cross-repo-workspace is generic (repo-a/repo-b placeholders or FILL IN)" \
  "grep -qiE '<repo-a>|<repo-b>|FILL IN' '$SKILLS/cross-repo-workspace/SKILL.md'"

# ---------------------------------------------------------------------------
echo
echo "=== T6: Generic NestJS knowledge retained ==="
NCA="$SKILLS/nestjs-clean-architecture/SKILL.md"
assert_true "T6: clean-architecture keeps the 4-layer split" \
  "grep -qiE 'domain' '$NCA' && grep -qiE 'application' '$NCA' && grep -qiE 'infrastructure' '$NCA'"
assert_true "T6: clean-architecture keeps the dependency rule" \
  "grep -qiE 'dependency rule|domain .* infrastructure' '$NCA'"
assert_true "T6: nestjs-patterns covers cross-cutting + mixins" \
  "test -f '$SKILLS/nestjs-patterns/patterns/cross-cutting.md' && test -f '$SKILLS/nestjs-patterns/patterns/mixins.md'"
assert_true "T6: nestjs-best-practices retains rule files" \
  "[ \$(find '$SKILLS/nestjs-best-practices/rules' -name '*.md' | wc -l) -ge 10 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T7: Skill-pointer cross-reference integrity (named skills exist) ==="
for s in tdd-workflow design-review plan-mode repo-conventions nestjs-best-practices \
         nestjs-patterns nestjs-clean-architecture decision-rules spec-workflow; do
  assert_true "T7: instructions.md references '$s' AND its skill dir exists" \
    "grep -q '$s' '$INSTRUCTIONS' && test -d '$SKILLS/$s'"
done

# ---------------------------------------------------------------------------
echo
echo "=== T8: No stray dev artifacts in the shipped template ==="
assert_true "T8: no *.bak files under .ruler/" "[ \$(find '$RULER_DIR' -name '*.bak' | wc -l) -eq 0 ]"

# ---------------------------------------------------------------------------
echo
echo "=== T9: Write-scope — spec-steward is the ONLY Edit/Write agent (no-leak guard) ==="
assert_true "T9: spec-steward has Edit" "agent_has_tool '$AGENTS/spec-steward.md' Edit"
assert_true "T9: spec-steward has Write" "agent_has_tool '$AGENTS/spec-steward.md' Write"
for a in $AGENT_LIST; do
  [ "$a" = "spec-steward" ] && continue
  assert_true "T9: '$a' has NO Edit (read-only sensor)" "! agent_has_tool '$AGENTS/$a.md' Edit"
  assert_true "T9: '$a' has NO Write (read-only sensor)" "! agent_has_tool '$AGENTS/$a.md' Write"
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
