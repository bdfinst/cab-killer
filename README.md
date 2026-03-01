# cab-killer

A multi-agent code review plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Specialized review agents, automation skills, and deterministic hooks — installable as a Claude Code plugin.

Architecture informed by the [Minimum CD Agentic CD](https://migration.minimumcd.org/docs/agentic-cd/agent-configuration/) and [Pipeline Reference Architecture](https://migration.minimumcd.org/docs/pipeline-reference-architecture/) patterns: fail fast/fail cheap gate sequencing, separation of concerns per agent, model tiering for cost control, and context minimization for token efficiency.

## Why

Coding agents write code fast but skip quality checks. cab-killer adds automated review for test quality, structure, naming, domain boundaries, complexity, security, functional purity, concurrency, performance, token efficiency, and Claude setup — without leaving your Claude Code workflow.

## How It Works

1. **Pre-flight gates** — Deterministic checks (lint, type-check, secret scan) run first. Fail fast before spending tokens on AI agents.
2. **Agents** (`agents/*.md`) — LLM-native prompt definitions that each focus on one aspect of code quality. Each declares its own model tier and context needs.
3. **Skills** (`skills/`) — Orchestration workflows invoked via slash commands
4. **Hooks** (`hooks/`) — Deterministic shell scripts that fire on every Write/Edit for instant feedback

## Install

```bash
# Install from GitHub
claude plugins install https://github.com/bdfinst/cab-killer

# Or install from a local clone for development
claude --plugin-dir /path/to/cab-killer
```

Updates propagate automatically — just `git pull` the plugin repo.

## Usage

### Run all review agents

```
/code-review
```

Options:
- `/code-review --changed` — review only uncommitted changes
- `/code-review --since main` — review files changed since a branch
- `/code-review --agent test-review` — run a single agent
- `/code-review --json` — output aggregated JSON (for CI integration)
- `/code-review --force` — skip pre-flight gates

### Pre-flight gates

Before agents run, `/code-review` executes deterministic checks in sequence:

1. **Lint** — eslint (or project lint command)
2. **Type check** — tsc --noEmit (if tsconfig.json exists)
3. **Secret scan** — grep for common secret patterns
4. **Pipeline-red check** — warn if CI is failing on the current branch

If any gate fails, agents do not run. Use `--force` to override.

### Run a single agent

```
/review-agent test-review
/review-agent security-review --changed
/review-agent js-fp-review --since main
```

### Generate review summary

```
/review-summary
/review-summary --from review-output.json
```

Writes a compact (<150 word) session summary to `.claude/review-summaries/` for cross-session context continuity.

### Apply fixes

After `/code-review` generates correction prompts, apply them:

```
/apply-fixes ./corrections
/apply-fixes ./corrections --skip-tests --skip-lint
/apply-fixes ./corrections --dry
```

The fix workflow:
1. Loads each correction prompt JSON file
2. Reads repository rules (CLAUDE.md, .clinerules, CONTRIBUTING.md)
3. Applies the minimal fix
4. Runs validation (lint, build, tests) after each fix
5. Reports results

#### Alternative: refactoring plugin

For structural fixes (long functions, duplication, deep nesting, unclear names), the [refactoring](https://github.com/elifiner/refactoring) Claude Code plugin provides an analysis-first, one-change-at-a-time workflow — better suited for complex structural changes than batch correction prompts.

Install:

```bash
# From GitHub
claude plugins install https://github.com/elifiner/refactoring

# Or clone locally and install
git clone https://github.com/elifiner/refactoring.git
claude plugins install ./refactoring
```

Usage after `/code-review` identifies issues:

```
# Analyze code smells (phase 1)
/refactoring analyze src/

# Apply one refactoring at a time (phase 2)
/refactoring apply
```

The plugin detects the same issues as `complexity-review`, `structure-review`, and `naming-review` but takes action directly rather than generating correction prompts.

### Audit eval compliance

```
/eval-audit
/eval-audit agents/js-fp-review.md
```

Checks all agents, skills, and hooks for structural compliance (output format, severity levels, numbered steps, etc.).

Auto-fix mode applies structural fixes automatically:

```
/eval-audit --fix
```

### Run eval fixtures

```
/eval-runner
/eval-runner --agent js-fp-review
/eval-runner --fixture fp-array-mutations.ts
/eval-runner --trials 3
```

Runs review agents against a corpus of known-good/known-bad code samples and grades the results against reference solutions. Supports multi-trial pass@k scoring and saturation detection.

## Review Agents

Each agent declares a **model tier** (small/mid/frontier) that controls which model runs it, and **context needs** (diff-only/full-file/project-structure) that controls what input it receives. This follows the [Minimum CD agent configuration](https://migration.minimumcd.org/docs/agentic-cd/agent-configuration/) principle: match model tier to task complexity.

| Agent | What it checks | Model Tier | Context Needs |
|-------|---------------|------------|---------------|
| `test-review` | Coverage gaps, assertion quality, test hygiene, missing edge cases | mid | full-file |
| `structure-review` | SRP violations, DRY, coupling, nesting depth, file organization | mid | full-file |
| `naming-review` | Intent-revealing names, boolean prefixes, magic values, consistency | small | diff-only |
| `domain-review` | Business logic placement, abstraction leaks, entity/DTO confusion, boundaries | frontier | project-structure |
| `complexity-review` | Function size (<20 lines), cyclomatic complexity (<10), nesting (<4), parameters (<5) | small | full-file |
| `claude-setup-review` | CLAUDE.md completeness, rules, skills, path accuracy | small | project-structure |
| `token-efficiency-review` | CLAUDE.md length, file/function size, nesting, duplicate code, LLM anti-patterns | small | full-file |
| `security-review` | Injection, auth/authz, data exposure, security headers, crypto, input validation | frontier | full-file |
| `js-fp-review` | let->const, array mutations, parameter mutations, global state, Object.assign | mid | diff-only |
| `concurrency-review` | Race conditions, async pitfalls, idempotency, shared state safety | mid | full-file |
| `performance-review` | Resource leaks, N+1 queries, unbounded growth, timeouts, algorithmic issues | small | full-file |

## Hooks

Hooks fire automatically on every `Write` or `Edit` via PostToolUse. They are advisory only (never block).

| Hook | Triggers on | What it checks |
|------|------------|----------------|
| `js-fp-review.sh` | JS/TS files | `.push()`, `.sort()`, `Object.assign(obj, ...)`, global mutations |
| `token-efficiency-review.sh` | All source files | File >500 lines, CLAUDE.md >5000 chars, functions >50 lines |
| `eval-compliance-check.sh` | Agent/skill files | Output format, severity levels, numbered steps |
| `pre-commit-review.sh` | Pre-commit (opt-in) | Warns when `blockOnFail` is enabled and source files are staged |

## Configuration

All agents are enabled by default — no config file required. Each agent declares its own thresholds, file scope, model tier, and context needs in its definition.

To disable specific agents or enable commit blocking in your project, create a `review-config.json` in your project root:

```json
{
  "agents": {
    "js-fp-review": { "enabled": false },
    "domain-review": { "enabled": false }
  },
  "blockOnFail": false
}
```

Setting `"blockOnFail": true` activates the pre-commit hook that warns when review agents report fail status on staged files.

This file is project-local and is not part of the toolkit.

## Output Format

Each agent produces:

```json
{
  "agentName": "test-review",
  "status": "pass|warn|fail|skip",
  "modelTier": "mid",
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "file": "src/utils/parser.js",
      "line": 42,
      "message": "Function lacks test coverage",
      "suggestedFix": "Add unit test for parseInput()"
    }
  ],
  "summary": "Found 1 issue with test coverage"
}
```

Aggregated JSON output (`/code-review --json`):

```json
{
  "overall": "warn",
  "timestamp": "2026-03-01T12:00:00Z",
  "targetFiles": 42,
  "preFlightPassed": true,
  "agents": [...],
  "totals": {"errors": 0, "warnings": 2, "suggestions": 1},
  "tokenEstimate": {
    "totalInputFiles": 15000,
    "agentCount": 11,
    "contextStrategy": "mixed"
  },
  "summary": "WARN (9 agents passed, 2 warned, 0 failed). 3 total issues."
}
```

Correction prompts for `/apply-fixes`:

```json
{
  "priority": "high|medium|low",
  "category": "test-review",
  "instruction": "Fix: Function lacks test coverage (Suggested: Add unit test for parseInput())",
  "context": "Line 42 in src/utils/parser.js",
  "affectedFiles": ["src/utils/parser.js"]
}
```

## Customization

### Agents vs. skills

**Agents** are review definitions — they describe *what* to look for in code. Each agent focuses on a single concern (security, naming, test quality, etc.), declares its model tier and context needs, and returns structured JSON with issues found. Agents don't take actions; they produce findings.

**Skills** are workflows — they describe *what to do*. A skill orchestrates agents, applies fixes, generates reports, or scaffolds files. Skills have a role (orchestrator, worker, or implementation) that constrains their behavior.

| Add an agent when... | Add a skill when... |
|---|---|
| You want to detect a new category of code issue | You want to automate a multi-step workflow |
| The concern is reviewable from reading code | The task involves running tools, writing files, or coordinating agents |
| Output is a list of findings with locations and fixes | Output is an action (files changed, report generated, commands run) |

Examples: "Flag React hook violations" → agent. "Run all React-related agents and summarize" → skill.

### Add a new agent

```
/add-agent "React hook violations" --tier mid --lang js,ts,jsx,tsx
/add-agent "React hook violations" --name react-hook-review --dry
```

The `/add-agent` skill scaffolds a compliant agent file, checks for scope overlap with existing agents, runs `/eval-audit` to verify compliance, and adds the agent to CLAUDE.md.

To add manually instead:
1. Create `agents/my-agent.md` with YAML frontmatter (name, description, tools, model), output format, severity levels, model tier, context needs, detection rules, and skip conditions
2. Run `/eval-audit agents/my-agent.md --fix` to verify and fix compliance

After adding an agent (either way):
1. Add eval fixtures in `evals/fixtures/` (2-3 pass, 2-3 fail) and reference solutions in `evals/expected/`
2. Run `/eval-runner --agent my-agent` to validate accuracy

### Add a new skill

```
/add-skill "Run linting checks across the project" --role worker
/add-skill "Orchestrate dependency audits" --role orchestrator --dry
```

The `/add-skill` skill scaffolds a compliant SKILL.md with role-appropriate constraints and tools, runs `/eval-audit` to verify compliance, and adds the skill to CLAUDE.md.

To add manually instead:
1. Create `skills/my-skill/SKILL.md` with YAML frontmatter, role declaration, constraints section, argument parsing, and numbered steps
2. Run `/eval-audit skills/my-skill/SKILL.md --fix` to verify and fix compliance

### Add a deterministic hook

1. Create `hooks/my-check.sh` (must exit 0, read stdin for file path)
2. Register in `hooks/hooks.json` under `PostToolUse`

See `docs/eval-system.md` for the full eval architecture.

## Architecture References

This toolkit's design is informed by:

- [Minimum CD — Agentic CD Agent Configuration](https://migration.minimumcd.org/docs/agentic-cd/agent-configuration/) — separation of concerns, model tiering, context assembly, session summaries
- [Minimum CD — Pipeline Reference Architecture](https://migration.minimumcd.org/docs/pipeline-reference-architecture/) — fail fast/fail cheap gate sequencing, pre-feature baselines, quality gate layering

## License

MIT
