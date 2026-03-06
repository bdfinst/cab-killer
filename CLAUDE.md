# cab-killer — Code Review Agent Toolkit

A Claude Code plugin that adds multi-agent code review to any project.
Agents, skills, and hooks that run inside Claude Code.

## Agents (`agents/`)

| Agent | Focus | Model Tier |
| ----- | ----- | ---------- |
| a11y-review | WCAG 2.1 AA, semantic HTML, ARIA, keyboard nav, focus management | mid |
| ai-antipattern-review | Unnecessary abstractions, single-use factories, premature generalization, redundant indirection in AI-generated code | mid |
| claude-setup-review | CLAUDE.md completeness and accuracy | small |
| complexity-review | Cyclomatic complexity, nesting, function size | small |
| concurrency-review | Race conditions, async pitfalls, shared state | mid |
| doc-drift-review | Comments and docs that contradict or lag behind current code | mid |
| domain-review | Domain boundaries, abstraction leaks | frontier |
| js-fp-review | Mutations, impure patterns | mid |
| logical-fallacy-review | False dichotomies, strawman, post hoc, hasty generalization in prose | mid |
| naming-review | Naming clarity, conventions, magic values | small |
| performance-review | Resource leaks, N+1, unbounded growth | small |
| security-review | Injection, auth, data exposure, crypto | frontier |
| structure-review | SRP, DRY, coupling, organization | mid |
| svelte-review | Svelte reactivity pitfalls, closure state leaks, $state proxy issues | mid |
| test-review | Test quality, coverage, assertions | mid |
| token-efficiency-review | Token usage optimization | small |

## Skills

- `/add-agent <description-or-url>` — Scaffold a new review agent with eval compliance
- `/add-plugin <name@marketplace> [--repo <owner/repo>]` — Install a plugin and register it in plugins.json
- `/apply-fixes <dir>` — Apply correction prompts with validation
  (or use [refactoring](https://github.com/elifiner/refactoring) plugin)
- `/code-review` — Run all enabled agents with pre-flight gates,
  produce summary and correction prompts. Supports `--json`, `--force`.
- `/eval-audit` — Audit agents/skills/hooks for eval system compliance
- `/eval-runner` — Run eval fixtures against agents and grade results
- `/review-agent <name>` — Run a single agent
- `/semgrep-analyze [path] [--rules <ruleset>]` — Run Semgrep static analysis with structured output
- `/review-summary` — Generate compact (<150 word) session summary for cross-session context
- `/skill-creator` — Create new skills, improve existing skills, and measure skill performance

## Plugin Management

When enabling a new plugin (adding to `.claude/settings.json`), also add it to `plugins.json`
so others who clone the repo can install the same set of plugins via `./install.sh`.

## Hooks (PostToolUse, advisory)

- `js-fp-review.sh` — Warns on array mutations, global state mutations, Object.assign
- `token-efficiency-review.sh` — Warns on long files (>500 lines), long functions (>50 lines), large CLAUDE.md
- `eval-compliance-check.sh` — Warns when agent/skill files miss required patterns
- `pre-commit-review.sh` — Opt-in commit blocking when agents return fail (requires `blockOnFail` in review-config.json)

## Install

```bash
claude plugin marketplace add bdfinst/cab-killer
claude plugin install cab-killer@cab-killer
```
