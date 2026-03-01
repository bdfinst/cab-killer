# cab-killer

A multi-agent code review system that uses Claude Code to independently review code written by AI coding agents. Each specialized review agent focuses on a specific aspect of code quality, and an orchestrator coordinates their execution.

## Why?

AI coding agents produce code fast, but without oversight they accumulate quality debt: weak tests, poor naming, tight coupling, security holes, unnecessary mutations. **cab-killer** runs a suite of focused review agents against your codebase and produces actionable correction prompts that can be fed back to a coding agent to fix the issues automatically.

## How It Works

1. **Review** - The orchestrator loads your source files and sends them through specialized review agents. Each agent is powered by Claude Code (`claude --print`) with a domain-specific prompt.
2. **Report** - Each agent returns structured JSON with issues, severity levels, and suggested fixes. Results are aggregated into a unified report.
3. **Fix** - Correction prompts are saved as individual JSON files. The `apply-fixes` command spawns independent Claude Code agents to apply each fix, then validates with lint/build/tests.

```
                        Orchestrator
                            |
      ┌──────────┬──────────┼──────────┬──────────┐
      v          v          v          v          v
  test-review  naming   security   fp-review   ...
      |          |          |          |          |
      └──────────┴──────────┴──────────┴──────────┘
                            |
                    Aggregated Report
                            |
                   Correction Prompts
                            |
                    Fix Orchestrator
                     (apply-fixes)
```

## Review Agents

| Agent | What it checks |
|-------|---------------|
| **test-review** | Test quality, coverage, and effectiveness |
| **structure-review** | Code organization and architecture |
| **naming-review** | Naming clarity and consistency |
| **domain-review** | Domain separation and boundary clarity |
| **complexity-review** | Excessive cyclomatic complexity |
| **claude-setup-review** | CLAUDE.md content, structure, and skill definitions |
| **token-efficiency-review** | Optimizes config and code for minimal token usage |
| **security-review** | Injection, auth, secrets, crypto, and input validation |
| **fp-review** | Detects mutations and impure patterns in functional code |

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Install

```bash
git clone <repo-url>
cd cab-killer
npm install
```

## Usage

### Review code

```bash
# Review current directory (all agents)
node src/index.js .

# Review a specific project
node src/index.js /path/to/project

# Run a single agent
node src/index.js --agent security-review ./src

# Run agents in parallel
node src/index.js --parallel .

# Review only uncommitted changes
node src/index.js --changed .

# Review changes since a branch
node src/index.js --since main .

# Output as JSON or markdown
node src/index.js --json .
node src/index.js --markdown --output report.md .

# Save correction prompts for later fixing
node src/index.js --prompts-output ./prompts-output .
```

### Apply fixes

```bash
# Apply fixes from saved prompts (runs lint/build/tests after each)
node src/index.js apply-fixes ./prompts-output

# Dry run to preview
node src/index.js apply-fixes ./prompts-output --dry

# Skip validation steps
node src/index.js apply-fixes ./prompts-output --skip-tests --skip-build --skip-lint

# Target a different repo
node src/index.js apply-fixes ./prompts-output --repo /path/to/target
```

### Loop mode

Runs all agents, generates fixes, and repeats until issues are resolved (up to `--max-iterations`):

```bash
node src/index.js --mode loop --max-iterations 3 .
```

## Configuration

Create `config/review-config.json` to enable/disable agents and tune thresholds:

```json
{
  "agents": {
    "test-review": { "enabled": true, "severity_threshold": "warning" },
    "complexity-review": { "enabled": true, "max_complexity": 10 },
    "fp-review": { "enabled": true, "strictMode": true },
    "security-review": { "enabled": true }
  },
  "orchestrator": {
    "max_loop_iterations": 5,
    "fail_on_error": true
  }
}
```

## Output Format

Each agent returns:

```json
{
  "agentName": "security-review",
  "status": "warn",
  "issues": [
    {
      "severity": "error",
      "file": "src/auth.js",
      "line": 42,
      "message": "Hardcoded API key",
      "suggestedFix": "Move to environment variable"
    }
  ],
  "summary": "Found 1 hardcoded credential"
}
```

Correction prompts for the fix pipeline:

```json
{
  "priority": "high",
  "category": "security-review",
  "instruction": "Move hardcoded API key to environment variable",
  "context": "src/auth.js contains a hardcoded credential on line 42",
  "affectedFiles": ["src/auth.js"]
}
```

## Development

```bash
npm test              # Run tests
npm run lint          # Lint
npm run format        # Format with Prettier
```

## License

MIT
