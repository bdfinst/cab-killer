# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

#### Repository Rules Integration
- **New utility: `repo-rules-loader.js`**
  - Automatically detects and loads repository rules from common locations:
    - `CLAUDE.md` - AI assistant guidelines
    - `.clinerules` - Custom coding rules
    - `.claude/rules/index.md` - Structured rules directory
    - `CONTRIBUTING.md` - Contribution guidelines
    - `README.md` - Project conventions
  - Exports `loadRepositoryRules()` to load all available rules
  - Exports `formatRulesForPrompt()` to format rules for AI agent prompts
  - Exports `fileExists()` helper for file existence checks

#### Automatic Progress and Token Usage Display
- **New utility: `token-tracker.js`**
  - Tracks estimated token usage throughout the fix application process
  - Provides visual progress bar showing token consumption
  - Estimates tokens using industry standard ~4 chars per token approximation
  - Exports `TokenTracker` class with methods:
    - `estimateTokens()` - Estimate token count from text
    - `addTokens()` / `addText()` - Track token usage
    - `getPercentage()` / `getRemaining()` - Calculate usage stats
    - `formatProgressBar()` - Generate visual progress bar
    - `display()` - Output current usage to console
    - `getSummary()` - Get usage statistics object
    - `reset()` - Reset tracker for new session

- **Enhanced `FixOrchestrator` with progress tracking**
  - Displays progress automatically after each fix:
    - Current fix number / total count
    - Completion percentage
    - Elapsed time and estimated time remaining
    - Token usage with visual progress bar
  - New constructor option: `showProgress` (default: true)
  - New method `displayProgress()` - Shows progress after each fix
  - New method `formatElapsedTime()` - Formats duration for display
  - Tracks start time and calculates ETA based on average fix time
  - Returns `tokenUsage` and `duration` in applyFixes() result

#### Automated Test and Build Validation
- **New utility: `test-runner.js`**
  - Automatically detects package manager (npm, yarn, pnpm, bun) via lock files
  - Parses `package.json` to discover available scripts
  - Exports `detectScripts()` to find test, build, and lint scripts
  - Exports `runScript()` to execute any npm script with timeout
  - Exports `runTests()`, `runBuild()`, `runLint()` for specific validation steps
  - Returns detailed results including success status, output, and exit code

#### Enhanced Fix Orchestrator
- **Updated `FixOrchestrator` class**
  - Now loads repository rules automatically at initialization
  - Includes repository rules in fix prompts sent to Claude agents
  - Runs automatic validation (lint, build, tests) after each fix
  - Categorizes fixes into three groups:
    - **Applied & Validated**: Successfully applied and passed all checks
    - **Validation Failed**: Applied but failed lint/build/tests
    - **Failed**: Could not apply the fix
  - New constructor options:
    - `runTests` (default: true) - Run tests after each fix
    - `runBuild` (default: true) - Run build after each fix
    - `runLint` (default: true) - Run lint after each fix
    - `repoPath` (default: `process.cwd()`) - Target repository path
  - New method `loadRepoRules()` - Loads and caches repository rules
  - New method `runValidation()` - Runs lint, build, and test validation
  - Enhanced `buildFixPrompt()` - Includes repository rules in prompts
  - Enhanced `spawnAgent()` - Runs validation after applying fix
  - Enhanced `applyFixes()` - Tracks validation failures separately
  - Enhanced `generateReport()` - Shows validation failure details

#### CLI Enhancements
- **New `apply-fixes` command options**
  - `--repo <path>` - Specify target repository path (default: current directory)
  - `--skip-tests` - Skip running tests after each fix
  - `--skip-build` - Skip running build after each fix
  - `--skip-lint` - Skip running lint after each fix
  - `--no-progress` - Disable automatic progress and token usage display
  - Existing options maintained: `--verbose`, `--dry`

### Changed
- Fix agents now work in the target repository's directory (via `cwd` option)
- Fix prompts now include repository-specific rules and conventions
- Exit code for `apply-fixes` now considers validation failures (non-zero if any fix failed or validation failed)
- Progress and token usage displayed by default during fix application
- Final report now includes total duration and token usage summary

### Documentation
- Updated `CLAUDE.md` with new commands and configuration examples
- Added section on "Fix Application with Validation" explaining the new workflow
- Created `examples/fix-with-validation.md` with detailed usage examples
- Created `examples/progress-display.md` showing progress and token tracking
- Added comprehensive test coverage for new utilities

### Testing
- Added `tests/utils/repo-rules-loader.test.js` - Tests for repository rules loading
- Added `tests/utils/test-runner.test.js` - Tests for script detection and execution
- Added `tests/utils/token-tracker.test.js` - Tests for token tracking and progress display
- All new tests passing (18 test suites, 129 total tests, 117 passing)

## Summary

This release adds intelligent repository-aware fix application with automatic validation and progress tracking. Fix agents now:
1. **Read and follow** the target repository's coding standards and conventions
2. **Apply fixes** with full context of project-specific guidelines
3. **Validate changes** by running lint, build, and tests automatically
4. **Display progress** showing completion percentage, time estimates, and token usage
5. **Report results** with detailed categorization and usage statistics

This ensures that all applied fixes maintain code quality, don't break existing functionality, and provides full visibility into the fix application process.
