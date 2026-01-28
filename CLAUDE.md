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
- **Token Efficiency Review Agent**: Optimizes Claude configuration and code for minimal token usage

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
│   ├── claude-setup-review.js
│   └── token-efficiency-review.js
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

# Apply fixes from saved prompts (with automatic validation and progress tracking)
node src/index.js apply-fixes ./prompts-output --verbose

# Apply fixes with custom repository path
node src/index.js apply-fixes ./prompts-output --repo /path/to/target/repo

# Apply fixes without running tests/build/lint
node src/index.js apply-fixes ./prompts-output --skip-tests --skip-build --skip-lint

# Disable progress and token usage display
node src/index.js apply-fixes ./prompts-output --no-progress

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
    "claude-setup-review": { "enabled": true },
    "token-efficiency-review": {
      "enabled": true,
      "maxClaudeMdLength": 5000,
      "maxFileLength": 500,
      "maxFunctionLength": 50
    }
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

5. **Displays progress automatically** - Shows real-time progress including:
   - Current fix number and total count
   - Estimated time elapsed and remaining
   - Token usage with visual progress bar
   - Completion percentage

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

## Token Efficiency Review Agent Details

The Token Efficiency Review Agent optimizes Claude configuration and code structure to minimize token usage and API costs:

**CLAUDE.md optimization:**

- Flags overly long CLAUDE.md files (>5000 chars default)
- Detects excessive code examples that bloat system prompts
- Identifies verbose or redundant sections
- Suggests moving detailed command docs to package.json references
- Flags large ASCII diagrams that consume tokens without adding much value
- Detects multi-step workflows that should be converted to skills

**Rules optimization:**

- Identifies verbose rules (>200 chars) that should be more concise
- Detects duplicate or very similar rules
- Flags example-heavy rule files that increase token load
- Suggests consolidating redundant rules

**Skills optimization:**

- Identifies missing skills for common workflows (commit, test, deploy)
- Detects when CLAUDE.md contains step-by-step instructions that should be skills
- Flags overly verbose skill definitions (>2000 chars)
- Suggests extracting repeated workflows into reusable skills

**Code structure optimization:**

- Flags long files (>500 lines default) that require more context tokens
- Identifies long functions (>50 lines default) that should be split
- Detects deeply nested code (>5 levels) that increases cognitive load
- Finds duplicate code blocks that should be extracted to shared utilities
- Suggests flatter code structures for better token efficiency

**Documentation optimization:**

- Flags verbose JSDoc comments (>15 lines) that should be external
- Identifies tutorial-style comments that belong in docs/ not source
- Detects excessive commented-out code that wastes tokens
- Suggests moving detailed docs to external .md files

This agent helps reduce API costs by ensuring that only essential context is loaded into Claude's prompt, while maintaining code quality and documentation clarity.

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

### Runtime Dependencies

- `commander` - CLI argument parsing
- `glob` - File pattern matching

### Development Dependencies

- `@yao-pkg/pkg` - Packaging tool for creating standalone executables
- `eslint` - Code linting
- `prettier` - Code formatting

### Optional Runtime (for fix application)

- `@anthropic-ai/sdk` - Claude API access (only needed when using `apply-fixes` command)
