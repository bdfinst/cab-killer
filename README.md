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

### Audit eval compliance

```
/eval-audit
/eval-audit .claude/agents/js-fp-review.md
```

Checks all agents, skills, and hooks for structural compliance (output format, severity levels, numbered steps, etc.).

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
  "status": "pass|warn|fail",
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

1. Create `.claude/agents/my-agent.md` with output format, severity levels, and detection rules
2. Add a config entry in `config/review-config.json`
3. Run `/eval-audit` to verify compliance

### Add a deterministic hook

1. Create `.claude/hooks/my-check.sh` (must exit 0, read stdin for file path)
2. Register in `.claude/settings.json` under `PostToolUse`

See `docs/eval-system.md` for the full eval architecture.

## License

MIT
