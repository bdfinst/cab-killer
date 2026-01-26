# Implementation Tasks

## Design Principles

1. **LLM-Native**: Agents are defined by prompts, not heuristics. The LLM understands code quality; our job is orchestration.
2. **Prompt-First**: Each agent is a markdown file with role, objective, checklist, and output format. Adding an agent = adding a file.
3. **Structured Output**: Despite LLM-based analysis, output is always typed `ReviewResult` JSON for machine consumption.
4. **Parallel by Default**: Agents are independent and can run concurrently for speed.
5. **Minimal Code**: Infrastructure handles loading prompts, calling the API, and parsing results. Review logic lives in prompts.
6. **Test-Driven Development**: All code follows the red-green-refactor cycle:
   - **Red**: Write a failing test first
   - **Green**: Write minimal code to make the test pass
   - **Refactor**: Clean up while keeping tests green
   - For prompts: write integration test with sample code → craft prompt to pass → refine

---

## Phase 1: Project Setup

- [x] **1.1** Initialize project with `npm init` and set `"type": "module"` for ES modules
- [x] **1.2** Install dependencies: `@anthropic-ai/sdk`, `commander`, `glob`
- [x] **1.3** Set up project directory structure:
  - `src/agents/` - Agent runner and registry
  - `src/orchestrator/` - Orchestration logic
  - `src/models/` - Data structure factories
  - `src/utils/` - Shared utilities
  - `prompts/` - Markdown prompt definitions for each agent
  - `tests/` - Test files
- [x] **1.4** Configure ESLint for code consistency
- [x] **1.5** Set up test runner (Node.js test runner or Jest) with watch mode for TDD workflow
- [x] **1.6** Add npm scripts for `start`, `test`, `lint`

## Phase 2: Core Models

For each model: write failing test → implement → refactor.

- [ ] **2.1** Test + implement `createReviewIssue()` factory (severity, file, line, message, suggestedFix)
- [ ] **2.2** Test + implement `createReviewResult()` factory (agentName, status, issues, summary)
- [ ] **2.3** Test + implement `createCorrectionPrompt()` factory (priority, category, instruction, context, affectedFiles)
- [ ] **2.4** Test + implement config schema and defaults for agents
- [ ] **2.5** Test + implement config schema and defaults for orchestrator

## Phase 3: Base Agent Infrastructure

For each component: write failing test → implement → refactor.

- [ ] **3.1** Test + implement `BaseReviewAgent` class with `async review(files)` method
- [ ] **3.2** Test + implement shared logic for file reading and result formatting in base class
- [ ] **3.3** Test + implement agent registry for dynamic agent loading
- [ ] **3.4** Test + implement utility functions for code file discovery and filtering

### Prompt-Based Agent System

- [ ] **3.5** Define standard prompt template structure:
  - `<role>` - Agent persona and expertise
  - `<objective>` - Focused review scope (what to check, what to ignore)
  - `<checklist>` - Specific items to evaluate
  - `<output_format>` - Expected response structure (JSON schema for ReviewResult)
- [ ] **3.6** Test + implement `PromptLoader` to read agent prompts from `prompts/*.md`
- [ ] **3.7** Test + implement `LLMReviewAgent` class that:
  - Loads prompt from markdown file
  - Injects code context into prompt
  - Calls Claude API
  - Parses response into `ReviewResult` structure
- [ ] **3.8** Test + implement context windowing utility to handle large codebases (chunk files, summarize, or filter)

## Phase 4: Agent Prompt Definitions

Each agent is defined by a markdown prompt file. The LLM does the analysis; code just orchestrates.

For each agent: write failing integration test with sample code → craft prompt to pass → refactor prompt for clarity.

### Test Review Agent (`prompts/test-review.md`)

- [ ] **4.1** Write integration test with sample code that has known test quality issues
- [ ] **4.2** Create prompt with role: "Senior QA Automation Engineer & SDET"
- [ ] **4.3** Define checklist: happy path vs edge cases, mock hygiene, assertion specificity, setup/teardown isolation
- [ ] **4.4** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.5** Iterate on prompt until integration test passes

### Structure Review Agent (`prompts/structure-review.md`)

- [ ] **4.6** Write integration test with sample code that has known structure issues
- [ ] **4.7** Create prompt with role: "Software Architect (SOLID principles)"
- [ ] **4.8** Define checklist: single responsibility, DRY violations, deep nesting, dependency cycles
- [ ] **4.9** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.10** Iterate on prompt until integration test passes

### Naming Review Agent (`prompts/naming-review.md`)

- [ ] **4.11** Write integration test with sample code that has known naming issues
- [ ] **4.12** Create prompt with role: "Code Readability Expert"
- [ ] **4.13** Define checklist: intent-revealing names, boolean hygiene, magic numbers/strings, consistency
- [ ] **4.14** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.15** Iterate on prompt until integration test passes

### Domain Review Agent (`prompts/domain-review.md`)

- [ ] **4.16** Write integration test with sample code that has known domain boundary issues
- [ ] **4.17** Create prompt with role: "Domain-Driven Design Purist"
- [ ] **4.18** Define checklist: leaky abstractions, DTO usage, business logic location, ubiquitous language
- [ ] **4.19** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.20** Iterate on prompt until integration test passes

### Complexity Review Agent (`prompts/complexity-review.md`)

- [ ] **4.21** Write integration test with sample code that has known complexity issues
- [ ] **4.22** Create prompt with role: "Complexity Analyst"
- [ ] **4.23** Define checklist: cyclomatic complexity, nesting depth, parameter counts, cognitive load, duplication
- [ ] **4.24** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.25** Iterate on prompt until integration test passes

### Claude Setup Review Agent (`prompts/claude-setup-review.md`)

- [ ] **4.26** Write integration test with sample CLAUDE.md that has known issues
- [ ] **4.27** Create prompt with role: "AI Developer Experience Specialist"
- [ ] **4.28** Define checklist: CLAUDE.md structure, project overview, architecture docs, commands accuracy, rules files, skill definitions, path consistency
- [ ] **4.29** Specify output format: JSON matching `ReviewResult` schema
- [ ] **4.30** Iterate on prompt until integration test passes

## Phase 5: Prompt Generator

For each method: write failing test → implement → refactor.

- [ ] **5.1** Test + implement `PromptGenerator` class skeleton
- [ ] **5.2** Test + implement `issueToPrompt()` - convert single issue to instruction
- [ ] **5.3** Test + implement `groupIssuesByFile()` - consolidate related issues
- [ ] **5.4** Test + implement `prioritizePrompts()` - order by severity and impact
- [ ] **5.5** Test + implement `formatForCodingAgent()` - produce final prompt text
- [ ] **5.6** Test + implement context extraction (surrounding code) for better prompts

## Phase 6: Orchestrator

For each method: write failing test → implement → refactor.

- [ ] **6.1** Test + implement `Orchestrator` class with agent management
- [ ] **6.2** Test + implement `runSingleAgent(agentName)` - execute one agent
- [ ] **6.3** Test + implement `runAllAgents()` - execute all enabled agents sequentially
- [ ] **6.4** Test + implement `runAllAgentsParallel()` - execute all enabled agents concurrently with `Promise.all()`
- [ ] **6.5** Test + implement `aggregateResults()` - combine results from multiple agents (handle parallel write safety)
- [ ] **6.6** Test + implement loop mode with iteration tracking and max iteration limit
- [ ] **6.7** Test + implement completion marker detection (`status: 'pass'` on all agents) for loop termination
- [ ] **6.8** Test + implement `PromptGenerator` integration for output
- [ ] **6.9** Test + implement progress reporting and logging

## Phase 7: CLI Interface

- [ ] **7.1** Create CLI entry point with `commander`
- [ ] **7.2** Add `--path` option for target code directory
- [ ] **7.3** Add `--agent` option for single agent execution
- [ ] **7.4** Add `--mode` option (single, all, loop)
- [ ] **7.5** Add `--parallel` flag to run agents concurrently (faster, uses more API calls)
- [ ] **7.6** Add `--output` option for result file path
- [ ] **7.7** Add `--config` option for custom config file
- [ ] **7.8** Add `--verbose` flag for detailed output
- [ ] **7.9** Add `--fix` flag to enable auto-fix loop (off by default)
- [ ] **7.10** Add `--max-fix-iterations <n>` option (default: 5)
- [ ] **7.11** Add `--dry-run` flag for testing without making changes
- [ ] **7.12** Implement human-readable console output formatting (markdown report)
- [ ] **7.13** Implement JSON output format

## Phase 8: Configuration System

For each feature: write failing test → implement → refactor.

- [ ] **8.1** Create default configuration file
- [ ] **8.2** Test + implement config file loading and validation
- [ ] **8.3** Test + implement per-agent enable/disable settings
- [ ] **8.4** Test + implement severity thresholds per agent
- [ ] **8.5** Test + implement file/directory exclusion patterns
- [ ] **8.6** Test + implement custom rule configuration support

## Phase 9: Auto-Fix Loop

The fix loop invokes a coding agent to apply corrections, then re-reviews until all issues are resolved or max iterations reached. Defaults to off.

For each feature: write failing test → implement → refactor.

- [ ] **9.1** Test + implement `FixerLoop` class with iteration tracking
- [ ] **9.2** Test + implement `invokeCodingAgent(correctionPrompts)` - calls Claude with fix instructions
- [ ] **9.3** Test + implement `verifyFixes()` - re-runs review agents on modified files
- [ ] **9.4** Test + implement termination conditions:
  - All agents return `status: 'pass'`
  - Max iterations reached (configurable, default: 5)
  - No progress between iterations (same issues remain)
- [ ] **9.5** Test + implement fix dry-run behavior - shows proposed changes without applying them
- [ ] **9.6** Test + implement fix loop progress reporting (iteration count, issues fixed, issues remaining)

## Phase 10: Integration & Polish

- [ ] **10.1** End-to-end integration tests (review only)
- [ ] **10.2** End-to-end integration tests (review + fix loop)
- [ ] **10.3** Add example code samples for testing the reviewers
- [ ] **10.4** Create usage documentation
- [ ] **10.5** Add error handling and graceful failures
- [ ] **10.6** Performance optimization for large codebases:
  - File filtering by extension and gitignore
  - Context chunking for repos exceeding token limits
  - Caching of unchanged file reviews
- [ ] **10.7** Verify `--dry-run` works correctly with all modes (review, fix, parallel)
- [ ] **10.8** Add markdown report output (similar to `COUNCIL_REPORT.md` format) for human review

## Future Enhancements (Optional)

- [ ] Watch mode for continuous review during development
- [ ] Git diff mode to review only changed files
- [ ] Custom agent plugin system (add new agents by dropping a `.md` file in `prompts/`)
- [ ] Review history and trend tracking
- [ ] IDE integration (VS Code extension)
- [ ] Web dashboard for review results
- [ ] Standalone bash runner for environments without Node.js
