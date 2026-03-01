# cab-killer — Code Review Agent Toolkit

A Claude Code plugin that adds multi-agent code review to any project.
Agents, skills, and hooks that run inside Claude Code.

## Agents (`agents/`)

| Agent | Focus | Model Tier |
| ----- | ----- | ---------- |
| test-review | Test quality, coverage, assertions | mid |
| structure-review | SRP, DRY, coupling, organization | mid |
| naming-review | Naming clarity, conventions, magic values | small |
| domain-review | Domain boundaries, abstraction leaks | frontier |
| complexity-review | Cyclomatic complexity, nesting, function size | small |
| claude-setup-review | CLAUDE.md completeness and accuracy | small |
| token-efficiency-review | Token usage optimization | small |
| security-review | Injection, auth, data exposure, crypto | frontier |
| js-fp-review | Mutations, impure patterns | mid |
| concurrency-review | Race conditions, async pitfalls, shared state | mid |
| performance-review | Resource leaks, N+1, unbounded growth | small |

## Skills

- `/add-agent <description-or-url>` — Scaffold a new review agent with eval compliance
- `/add-skill <description-or-url>` — Scaffold a new SKILL.md with eval compliance
- `/apply-fixes <dir>` — Apply correction prompts with validation
  (or use [refactoring](https://github.com/elifiner/refactoring) plugin)
- `/code-review` — Run all enabled agents with pre-flight gates,
  produce summary and correction prompts. Supports `--json`, `--force`.
- `/eval-audit` — Audit agents/skills/hooks for eval system compliance
- `/eval-runner` — Run eval fixtures against agents and grade results
- `/review-agent <name>` — Run a single agent
- `/review-summary` — Generate compact (<150 word) session summary for cross-session context

## Hooks (PostToolUse, advisory)

- `js-fp-review.sh` — Warns on array mutations, global state mutations, Object.assign
- `token-efficiency-review.sh` — Warns on long files (>500 lines), long functions (>50 lines), large CLAUDE.md
- `eval-compliance-check.sh` — Warns when agent/skill files miss required patterns
- `pre-commit-review.sh` — Opt-in commit blocking when agents return fail (requires `blockOnFail` in review-config.json)

## Install

```bash
claude plugin install https://github.com/bdfinst/cab-killer
```
