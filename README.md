# cab-killer

A multi-agent code review toolkit for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Nine specialized review agents, three automation skills, and deterministic hooks — all packaged as a portable `.claude/` directory you copy into any project.

## Why

Coding agents write code fast but skip quality checks. cab-killer adds automated review for test quality, structure, naming, domain boundaries, complexity, security, functional purity, token efficiency, and Claude setup — without leaving your Claude Code workflow.

## How It Works

1. **Agents** (`.claude/agents/*.md`) — LLM-native prompt definitions that each focus on one aspect of code quality
2. **Skills** (`.claude/skills/`) — Orchestration workflows invoked via slash commands
3. **Hooks** (`.claude/hooks/`) — Deterministic shell scripts that fire on every Write/Edit for instant feedback

## Install

```bash
# Clone the toolkit
git clone https://github.com/your-org/cab-killer.git

# Install into your project (symlinks agents, skills, hooks; merges hook config)
cab-killer/install.sh /path/to/your-project
```

The install script:
- Symlinks `.claude/agents/`, `.claude/skills/`, and `.claude/hooks/` into your project
- Merges cab-killer hooks into your existing `.claude/settings.json` (or creates one)
- Appends a toolkit reference to your `CLAUDE.md`
- Adds symlink paths to `.gitignore`

Updates propagate automatically — just `git pull` the toolkit repo. To remove: `install.sh /path/to/project --uninstall`.

Requires `jq` and `claude` (the script checks for both and fails with an error if missing).

## Usage

### Run all review agents

```
/code-review
```

Options:
- `/code-review --changed` — review only uncommitted changes
- `/code-review --since main` — review files changed since a branch
- `/code-review --agent test-review` — run a single agent

### Run a single agent

```
/review-agent test-review
/review-agent security-review --changed
/review-agent js-fp-review --since main
```

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
/eval-audit .claude/agents/js-fp-review.md
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

Runs review agents against a corpus of 46 known-good/known-bad code samples and grades the results against reference solutions. Supports multi-trial pass@k scoring and saturation detection.

## Review Agents

| Agent | What it checks |
|-------|---------------|
| `test-review` | Coverage gaps, assertion quality, test hygiene, missing edge cases |
| `structure-review` | SRP violations, DRY, coupling, nesting depth, file organization |
| `naming-review` | Intent-revealing names, boolean prefixes, magic values, consistency |
| `domain-review` | Business logic placement, abstraction leaks, entity/DTO confusion, boundaries |
| `complexity-review` | Function size (<20 lines), cyclomatic complexity (<10), nesting (<4), parameters (<5) |
| `claude-setup-review` | CLAUDE.md completeness, rules, skills, path accuracy |
| `token-efficiency-review` | CLAUDE.md length, file/function size, nesting, duplicate code, LLM anti-patterns |
| `security-review` | Injection, auth/authz, data exposure, security headers, crypto, input validation |
| `js-fp-review` | let→const, array mutations, parameter mutations, global state, Object.assign |

## Hooks

Hooks fire automatically on every `Write` or `Edit` via PostToolUse. They are advisory only (never block).

| Hook | Triggers on | What it checks |
|------|------------|----------------|
| `js-fp-review.sh` | JS/TS files | `.push()`, `.sort()`, `Object.assign(obj, ...)`, global mutations |
| `token-efficiency-review.sh` | All source files | File >500 lines, CLAUDE.md >5000 chars, functions >50 lines |
| `eval-compliance-check.sh` | Agent/skill files | Output format, severity levels, numbered steps |

## Configuration

All agents are enabled by default — no config file required. Each agent declares its own thresholds and file scope in its definition (e.g., js-fp-review scopes itself to JS/TS files).

To disable specific agents in your project, create a `review-config.json` in your project root:

```json
{
  "agents": {
    "js-fp-review": { "enabled": false },
    "domain-review": { "enabled": false }
  }
}
```

This file is project-local and is not part of the toolkit.

## Output Format

Each agent produces:

```json
{
  "agentName": "test-review",
  "status": "pass|warn|fail|skip",
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

### Add a new agent

1. Create `.claude/agents/my-agent.md` with output format, severity levels, detection rules, and skip conditions
2. Add eval fixtures in `evals/fixtures/` (2-3 pass, 2-3 fail) and reference solutions in `evals/expected/`
3. Run `/eval-audit` to verify compliance
4. Run `/eval-runner --agent my-agent` to validate accuracy

### Add a deterministic hook

1. Create `.claude/hooks/my-check.sh` (must exit 0, read stdin for file path)
2. Register in `.claude/settings.json` under `PostToolUse`

See `docs/eval-system.md` for the full eval architecture.

## License

MIT
