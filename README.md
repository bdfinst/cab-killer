# CAB Killer

A multi-agent code review system that independently reviews code written by coding agents. Each specialized agent focuses on a specific aspect of code quality, and an orchestrator coordinates their execution.

## Features

- **Specialized Review Agents**: Six focused agents for comprehensive code review
  - Test Review - Evaluates test quality, coverage, and effectiveness
  - Structure Review - Analyzes code organization and architecture
  - Naming Review - Checks naming clarity and consistency
  - Domain Review - Assesses domain separation and boundary clarity
  - Complexity Review - Measures and flags excessive code complexity
  - Claude Setup Review - Reviews CLAUDE.md content and AI assistant configuration

- **Flexible Execution Modes**
  - Single agent review
  - All agents sequentially
  - Loop mode until all issues resolved

- **Fix Application**: Automatically apply suggested fixes with validation
- **SDK Integration**: Native Claude Agent SDK support with usage tracking

## Installation

```bash
npm install
```

## Usage

### Review Code

```bash
# Run all review agents
node src/index.js ./code-to-review

# Run a specific agent
node src/index.js --agent complexity-review ./code-to-review

# Run in loop mode (repeat until all issues resolved)
node src/index.js --mode loop ./code-to-review

# Review only changed files (uncommitted changes)
node src/index.js --changed .

# Review files changed since a specific branch
node src/index.js --since main .

# Generate correction prompts
node src/index.js --prompts-output ./prompts .
```

### Apply Fixes

```bash
# Apply fixes from saved prompts
node src/index.js apply-fixes ./prompts-output

# Apply with verbose output
node src/index.js apply-fixes ./prompts-output --verbose

# Dry run to preview changes
node src/index.js apply-fixes ./prompts-output --dry

# Skip validation steps
node src/index.js apply-fixes ./prompts-output --skip-tests --skip-build --skip-lint
```

### Options

| Option | Description |
|--------|-------------|
| `-a, --agent <name>` | Run a specific agent only |
| `-m, --mode <mode>` | Execution mode: single, all, loop (default: all) |
| `-p, --parallel` | Run agents in parallel |
| `-o, --output <file>` | Output results to file |
| `-f, --format <type>` | Output format: json, markdown, console |
| `--prompts-output <dir>` | Save correction prompts to directory |
| `--changed` | Only review uncommitted changes |
| `--since <ref>` | Review files changed since git ref |
| `-v, --verbose` | Show detailed output |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                           │
│  - Manages agent execution (single/all/loop modes)          │
│  - Aggregates review results                                │
│  - Generates correction prompts for coding agent            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐     ┌───────────────┐
│ Review Agent  │   │ Review Agent  │ ... │ Review Agent  │
│  (Test/etc)   │   │  (Structure)  │     │ (Complexity)  │
└───────────────┘   └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                      ┌───────────────┐
                      │  SDK Client   │
                      │ (Claude API)  │
                      └───────────────┘
```

## Project Structure

```
src/
├── agents/              # Review agents
│   ├── base-agent.js    # Base agent class
│   ├── claude-code-agent.js  # SDK-integrated agent
│   └── registry.js      # Agent registry
├── sdk/                 # Claude Agent SDK integration
│   └── client.js        # SDK client wrapper
├── orchestrator/        # Orchestration logic
│   ├── orchestrator.js  # Main orchestrator
│   └── prompt-generator.js  # Correction prompt generation
├── fixer/               # Fix application
│   └── fix-orchestrator.js  # Fix coordinator
├── formatters/          # Output formatting
├── models/              # Data structures
├── utils/               # Shared utilities
└── cli.js               # CLI entry point

tests/                   # Test files (mirrors src/)
config/                  # Configuration files
prompts/                 # Agent prompt templates
```

## Review Result Format

```javascript
{
  agentName: 'complexity-review',
  status: 'pass' | 'warn' | 'fail',
  issues: [{
    severity: 'error' | 'warning' | 'suggestion',
    file: 'src/utils/parser.js',
    line: 42,
    message: 'Function exceeds complexity threshold',
    suggestedFix: 'Extract helper functions'
  }],
  summary: 'Found 3 complexity issues'
}
```

## Configuration

Create `config/review-config.json`:

```json
{
  "agents": {
    "test-review": { "enabled": true, "severity_threshold": "warning" },
    "structure-review": { "enabled": true },
    "naming-review": { "enabled": true },
    "domain-review": { "enabled": true },
    "complexity-review": { "enabled": true, "max_complexity": 10 },
    "claude-setup-review": { "enabled": true }
  },
  "orchestrator": {
    "max_loop_iterations": 5,
    "fail_on_error": true
  }
}
```

## Development

```bash
# Run tests
npm test

# Run linter
npm run lint

# Run specific test file
npm test tests/utils/token-tracker.test.js
```

## Requirements

- Node.js 18+
- Claude API access (via Claude Agent SDK)

## License

MIT
