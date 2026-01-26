# Code Review Agent System

A multi-agent code review system that independently reviews code written by coding agents. Each specialized agent focuses on a specific aspect of code quality, and an orchestrator coordinates their execution.

## Project Overview

This system provides automated code review through specialized agents:

- **Test Review Agent**: Evaluates test quality, coverage, and effectiveness
- **Structure Review Agent**: Analyzes code organization and architecture
- **Naming Review Agent**: Checks naming clarity and consistency
- **Domain Review Agent**: Assesses domain separation and boundary clarity
- **Complexity Review Agent**: Measures and flags excessive code complexity
- **Claude Setup Review Agent**: Reviews CLAUDE.md content, structure, rules, and skill definitions

An **Orchestrator** coordinates these agents and can:

- Run a single review agent at a time
- Run all agents sequentially
- Loop until all review comments are addressed

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
```

## Directory Structure

```
src/
├── agents/              # Individual review agents
│   ├── base.js          # Base agent class
│   ├── test-review.js   # Test quality reviewer
│   ├── structure-review.js
│   ├── naming-review.js
│   ├── domain-review.js
│   ├── complexity-review.js
│   └── claude-setup-review.js
├── orchestrator/        # Orchestration logic
│   ├── orchestrator.js  # Main orchestrator
│   ├── modes.js         # Execution modes (single/all/loop)
│   └── prompt-generator.js  # Converts reviews to prompts
├── models/              # Data structure factories
│   ├── review-result.js # Review output structure
│   ├── review-issue.js  # Individual issue found
│   └── correction-prompt.js
├── fixer/               # Fix application logic
│   └── fix-orchestrator.js
├── utils/               # Shared utilities
│   ├── code-parser.js   # Code parsing helpers
│   └── file-utils.js    # File system operations
└── index.js             # Main entry point

tests/                   # Test files mirroring src/
config/                  # Configuration files
```

## Review Result Format

Each agent produces a review result object:

```javascript
// ReviewResult
{
  agentName: 'test-review',
  status: 'pass' | 'warn' | 'fail',
  issues: [ReviewIssue],
  summary: 'Found 3 issues with test coverage'
}

// ReviewIssue
{
  severity: 'error' | 'warning' | 'suggestion',
  file: 'src/utils/parser.js',
  line: 42,
  message: 'Function lacks test coverage',
  suggestedFix: 'Add unit test for parseInput()'
}
```

## Correction Prompt Format

The orchestrator converts review results into prompts for the coding agent:

```javascript
// CorrectionPrompt
{
  priority: 'high' | 'medium' | 'low',
  category: 'test-quality',  // e.g., 'naming', 'complexity'
  instruction: 'Add missing test for parseInput function',
  context: 'The function handles user input but has no tests',
  affectedFiles: ['src/utils/parser.js', 'tests/utils/parser.test.js']
}
```

## Commands

```bash
# Run all review agents
node src/index.js --path ./code-to-review

# Run a specific agent
node src/index.js --agent test-review --path ./code-to-review

# Run in loop mode (repeat until all issues resolved)
node src/index.js --mode loop --path ./code-to-review

# Generate correction prompts only (no loop)
node src/index.js --mode single --output prompts.json --path ./code-to-review

# Review only changed files (uncommitted changes)
node src/index.js --changed --path .

# Review files changed since a specific branch
node src/index.js --since main --path .

# Apply fixes from saved prompts (with automatic validation)
node src/index.js apply-fixes ./prompts-output --verbose

# Apply fixes with custom repository path
node src/index.js apply-fixes ./prompts-output --repo /path/to/target/repo

# Apply fixes without running tests/build/lint
node src/index.js apply-fixes ./prompts-output --skip-tests --skip-build --skip-lint

# Dry run to preview what would be applied
node src/index.js apply-fixes ./prompts-output --dry
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

## Fix Application with Validation

When applying fixes, the system now:

1. **Loads target repository rules** - Automatically detects and includes rules from:
   - `CLAUDE.md` - Project-specific AI assistant guidelines
   - `.clinerules` - Custom linting/coding rules
   - `.claude/rules/index.md` - Structured rules directory
   - `CONTRIBUTING.md` - Contribution guidelines
   - `README.md` - Project overview and conventions

2. **Applies fixes with context** - Each fix agent receives:
   - The specific issue to fix
   - All relevant repository rules and conventions
   - Instructions to follow coding standards

3. **Validates changes** - After each fix, automatically runs (if configured):
   - **Lint** - Code style and quality checks
   - **Build** - Compilation and build verification
   - **Tests** - Full test suite execution

4. **Reports validation results** - Fixes are categorized as:
   - **Applied & Validated** - Successfully applied and passed all checks
   - **Validation Failed** - Applied but failed lint/build/tests
   - **Failed** - Could not apply the fix

This ensures that all fixes adhere to repository standards and don't break existing functionality.

## Claude Setup Review Agent Details

The Claude Setup Review Agent examines the project's AI assistant configuration:

**CLAUDE.md checks:**

- File exists and has proper markdown structure
- Contains project overview explaining what the codebase does
- Documents architecture and directory structure
- Lists development guidelines and conventions
- Includes accurate commands/scripts that match package.json
- Instructions are clear enough for an AI assistant to follow

**Rules checks:**

- Presence of `.clinerules` or `.claude/rules/` definitions
- Rules are specific and actionable
- No conflicting or redundant rules

**Skills checks:**

- Common workflows have skill definitions (commit, test, deploy, etc.)
- Skills reference correct file paths and commands
- Skills are documented with clear triggers

**Consistency checks:**

- CLAUDE.md directory structure matches actual project
- Referenced files and paths exist
- Commands in documentation actually work

## Coding Conventions

- Use `const` over `let` when variables are not reassigned (`prefer-const`)
- Never use `var` (`no-var`)
- Use strict equality (`===` and `!==`) instead of loose equality (`eqeqeq`)
- Always use curly braces for control statements (`if`, `else`, `for`, `while`, etc.)
- Unused variables are errors, except those prefixed with `_`

See `eslint.config.js` for the complete linting configuration.

## Development Guidelines

- Each agent must implement the standard review interface: `async review(files) => ReviewResult`
- Agents should be stateless and side-effect free
- Review results must be deterministic for the same input
- Use ES modules (`import`/`export`)
- Use Node.js 18+ for native fetch and other modern APIs
- All agents must have corresponding tests

## Dependencies

- `@anthropic-ai/sdk` - Claude API access
- `commander` - CLI argument parsing
- `glob` - File pattern matching
