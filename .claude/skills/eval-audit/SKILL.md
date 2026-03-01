---
name: eval-audit
description: Audit code-review agents and skills for eval system compliance
user-invocable: true
---

# Eval Audit

You have been invoked with the `/eval-audit` skill. Audit agents and skills for compliance with the eval system patterns documented in `docs/eval-system.md`.

## Parse Arguments

- No argument or `--all`: audit everything
- A specific file path (e.g., `.claude/agents/fp-review.md`): audit that file only

## What to Audit

### Agent Checks

Read each file in `.claude/agents/*.md` and check:

1. **Structured output format**: Does the agent specify a JSON output schema?
   - Review agents MUST include `status`, `issues`, and `summary` fields
   - FAIL if a review agent has no output format

2. **Severity definitions**: Does the agent define severity levels?
   - MUST define `error`, `warning`, and `suggestion` with clear criteria
   - FAIL if severity levels are missing

3. **Detection rules**: Does the agent list what it detects?
   - MUST have a section listing specific patterns/issues to flag
   - WARN if detection rules are vague or missing

4. **Scope boundaries**: Does the agent declare what it ignores?
   - Review agents SHOULD state what other agents handle
   - WARN if missing (helps avoid duplicate findings)

### Skill Checks

Read each file in `.claude/skills/*/SKILL.md` and check:

1. **Structured steps**: Does the skill have numbered steps?
   - All skills MUST have a clear sequence of steps
   - FAIL if steps are missing or unstructured

2. **Argument parsing**: Does the skill document its arguments?
   - Skills MUST document required and optional arguments
   - WARN if argument section is missing

3. **Output format**: Does the skill describe its output?
   - Skills that produce reports MUST define their output format
   - WARN if output format is missing

4. **Validation gates**: Does the skill run validation where appropriate?
   - Skills that modify code (apply-fixes) SHOULD run lint/build/tests
   - WARN if a code-modifying skill has no validation step

### Hook Checks

Read each file in `.claude/hooks/*.sh` and check:

1. **Advisory behavior**: Does the hook exit 0?
   - Hooks MUST be advisory only (exit 0), never blocking
   - FAIL if a hook exits non-zero on warnings

2. **Input handling**: Does the hook read stdin and extract file path?
   - Hooks MUST handle the PostToolUse input format
   - WARN if input parsing looks incorrect

3. **Scope filtering**: Does the hook filter by file type?
   - Hooks SHOULD only run on relevant file types
   - WARN if no file type filter is present

### Configuration Check

Read `config/review-config.json` and check:

1. All agents in `.claude/agents/` have a config entry (WARN if missing)
2. No config entries reference nonexistent agents (WARN if orphaned)

## Output Format

```
# Eval Audit Report

## Agents
| Agent                     | Output Format | Severity | Detection | Scope | Status |
|---------------------------|---------------|----------|-----------|-------|--------|
| test-review               | PASS          | PASS     | PASS      | PASS  | OK     |
| fp-review                 | PASS          | PASS     | PASS      | PASS  | OK     |
| ...                       |               |          |           |       |        |

## Skills
| Skill          | Steps | Arguments | Output | Validation | Status |
|----------------|-------|-----------|--------|------------|--------|
| code-review    | PASS  | PASS      | PASS   | N/A        | OK     |
| apply-fixes    | PASS  | PASS      | PASS   | PASS       | OK     |
| ...            |       |           |        |            |        |

## Hooks
| Hook                        | Advisory | Input | Scope Filter | Status |
|-----------------------------|----------|-------|--------------|--------|
| fp-review.sh                | PASS     | PASS  | PASS         | OK     |
| token-efficiency-review.sh  | PASS     | PASS  | PASS         | OK     |
| ...                         |          |       |              |        |

## Configuration
- Agents with config: [list]
- Agents missing config: [list]
- Orphaned config entries: [list]

## Summary
- Agents: N OK, N WARN, N FAIL
- Skills: N OK, N WARN, N FAIL
- Hooks: N OK, N WARN, N FAIL
- Action items: [list of things to fix]
```

## After the Audit

If any FAILs are found, offer to fix them:
- Missing output format: Add the standard JSON schema to the agent definition
- Missing severity levels: Add error/warning/suggestion definitions
- Missing steps: Add numbered steps to the skill
- Missing validation: Add lint/build/test steps where appropriate
