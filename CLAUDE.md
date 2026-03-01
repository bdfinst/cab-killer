# cab-killer — Code Review Agent Toolkit

A reusable `.claude/` toolkit that adds multi-agent code review to any project. No Node.js app — just agents, skills, and hooks that run inside Claude Code.

## Agents (`.claude/agents/`)

| Agent | Focus |
|-------|-------|
| test-review | Test quality, coverage, assertions |
| structure-review | SRP, DRY, coupling, organization |
| naming-review | Naming clarity, conventions, magic values |
| domain-review | Domain boundaries, abstraction leaks |
| complexity-review | Cyclomatic complexity, nesting, function size |
| claude-setup-review | CLAUDE.md completeness and accuracy |
| token-efficiency-review | Token usage optimization |
| security-review | Injection, auth, data exposure, crypto |
| js-fp-review | Mutations, impure patterns |

## Skills

- `/code-review` — Run all enabled agents, produce summary and correction prompts
- `/review-agent <name>` — Run a single agent
- `/apply-fixes <dir>` — Apply correction prompts with validation
- `/eval-audit` — Audit agents/skills/hooks for eval system compliance

## Hooks (PostToolUse, advisory)

- `js-fp-review.sh` — Warns on array mutations, global state mutations, Object.assign
- `token-efficiency-review.sh` — Warns on long files (>500 lines), long functions (>50 lines), large CLAUDE.md
- `eval-compliance-check.sh` — Warns when agent/skill files miss required patterns

## Install

Run `./install.sh /path/to/project` to symlink agents, skills, and hooks into a target project and merge hooks into its settings.json. See README.md for details.
