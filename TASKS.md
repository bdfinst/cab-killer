# Implementation Tasks

## Phase 1: Project Setup

- [ ] **1.1** Initialize project with `npm init` and set `"type": "module"` for ES modules
- [ ] **1.2** Install dependencies: `@anthropic-ai/sdk`, `commander`, `glob`
- [ ] **1.3** Set up project directory structure (`src/agents`, `src/orchestrator`, `src/models`, `src/utils`, `tests`)
- [ ] **1.4** Configure ESLint for code consistency
- [ ] **1.5** Set up test runner (Node.js test runner or Jest)
- [ ] **1.6** Add npm scripts for `start`, `test`, `lint`

## Phase 2: Core Models

- [ ] **2.1** Create `createReviewIssue()` factory (severity, file, line, message, suggestedFix)
- [ ] **2.2** Create `createReviewResult()` factory (agentName, status, issues, summary)
- [ ] **2.3** Create `createCorrectionPrompt()` factory (priority, category, instruction, context, affectedFiles)
- [ ] **2.4** Create config schema and defaults for agents
- [ ] **2.5** Create config schema and defaults for orchestrator

## Phase 3: Base Agent Infrastructure

- [ ] **3.1** Create `BaseReviewAgent` class with `async review(files)` method
- [ ] **3.2** Add shared logic for file reading and result formatting in base class
- [ ] **3.3** Implement agent registry for dynamic agent loading
- [ ] **3.4** Create utility functions for code file discovery and filtering

## Phase 4: Review Agents

### Test Review Agent
- [ ] **4.1** Implement `TestReviewAgent` class extending `BaseReviewAgent`
- [ ] **4.2** Add check: test file existence for source files
- [ ] **4.3** Add check: test naming conventions (describe/it blocks)
- [ ] **4.4** Add check: assertion presence and quality
- [ ] **4.5** Add check: edge case coverage (null, empty, boundary values)
- [ ] **4.6** Add check: mock usage appropriateness
- [ ] **4.7** Write tests for `TestReviewAgent`

### Structure Review Agent
- [ ] **4.8** Implement `StructureReviewAgent` class
- [ ] **4.9** Add check: file length thresholds
- [ ] **4.10** Add check: function/method length thresholds
- [ ] **4.11** Add check: single responsibility indicators
- [ ] **4.12** Add check: import organization and circular dependencies
- [ ] **4.13** Add check: consistent file organization patterns
- [ ] **4.14** Write tests for `StructureReviewAgent`

### Naming Review Agent
- [ ] **4.15** Implement `NamingReviewAgent` class
- [ ] **4.16** Add check: variable naming conventions (camelCase, descriptive)
- [ ] **4.17** Add check: function naming (verb prefixes, clarity)
- [ ] **4.18** Add check: class naming (PascalCase, noun-based)
- [ ] **4.19** Add check: constant naming (UPPER_SNAKE_CASE)
- [ ] **4.20** Add check: abbreviation and acronym usage
- [ ] **4.21** Write tests for `NamingReviewAgent`

### Domain Review Agent
- [ ] **4.22** Implement `DomainReviewAgent` class
- [ ] **4.23** Add check: layer separation (controller/service/repository patterns)
- [ ] **4.24** Add check: domain boundary violations (imports across boundaries)
- [ ] **4.25** Add check: dependency direction (inner layers don't depend on outer)
- [ ] **4.26** Add check: domain model isolation
- [ ] **4.27** Write tests for `DomainReviewAgent`

### Complexity Review Agent
- [ ] **4.28** Implement `ComplexityReviewAgent` class
- [ ] **4.29** Add check: cyclomatic complexity calculation
- [ ] **4.30** Add check: nesting depth limits
- [ ] **4.31** Add check: parameter count limits
- [ ] **4.32** Add check: cognitive complexity scoring
- [ ] **4.33** Add check: duplicate code detection (basic)
- [ ] **4.34** Write tests for `ComplexityReviewAgent`

### Claude Setup Review Agent
- [ ] **4.35** Implement `ClaudeSetupReviewAgent` class
- [ ] **4.36** Add check: CLAUDE.md existence and basic structure
- [ ] **4.37** Add check: CLAUDE.md contains project overview section
- [ ] **4.38** Add check: CLAUDE.md contains architecture/structure documentation
- [ ] **4.39** Add check: CLAUDE.md contains development guidelines
- [ ] **4.40** Add check: CLAUDE.md commands/scripts are accurate and up-to-date
- [ ] **4.41** Add check: .clinerules or .claude/rules files for project-specific rules
- [ ] **4.42** Add check: skill definitions exist for common project workflows
- [ ] **4.43** Add check: consistency between CLAUDE.md and actual project structure
- [ ] **4.44** Add check: clarity and completeness of instructions for AI assistants
- [ ] **4.45** Write tests for `ClaudeSetupReviewAgent`

## Phase 5: Prompt Generator

- [ ] **5.1** Create `PromptGenerator` class
- [ ] **5.2** Implement `issueToPrompt()` - convert single issue to instruction
- [ ] **5.3** Implement `groupIssuesByFile()` - consolidate related issues
- [ ] **5.4** Implement `prioritizePrompts()` - order by severity and impact
- [ ] **5.5** Implement `formatForCodingAgent()` - produce final prompt text
- [ ] **5.6** Add context extraction (surrounding code) for better prompts
- [ ] **5.7** Write tests for `PromptGenerator`

## Phase 6: Orchestrator

- [ ] **6.1** Create `Orchestrator` class with agent management
- [ ] **6.2** Implement `runSingleAgent(agentName)` - execute one agent
- [ ] **6.3** Implement `runAllAgents()` - execute all enabled agents sequentially
- [ ] **6.4** Implement `aggregateResults()` - combine results from multiple agents
- [ ] **6.5** Implement loop mode with iteration tracking
- [ ] **6.6** Add termination conditions (max iterations, all issues resolved)
- [ ] **6.7** Integrate `PromptGenerator` for output
- [ ] **6.8** Add progress reporting and logging
- [ ] **6.9** Write tests for `Orchestrator`

## Phase 7: CLI Interface

- [ ] **7.1** Create CLI entry point with `commander`
- [ ] **7.2** Add `--path` option for target code directory
- [ ] **7.3** Add `--agent` option for single agent execution
- [ ] **7.4** Add `--mode` option (single, all, loop)
- [ ] **7.5** Add `--output` option for result file path
- [ ] **7.6** Add `--config` option for custom config file
- [ ] **7.7** Add `--verbose` flag for detailed output
- [ ] **7.8** Implement human-readable console output formatting
- [ ] **7.9** Implement JSON output format

## Phase 8: Configuration System

- [ ] **8.1** Create default configuration file
- [ ] **8.2** Implement config file loading and validation
- [ ] **8.3** Add per-agent enable/disable settings
- [ ] **8.4** Add severity thresholds per agent
- [ ] **8.5** Add file/directory exclusion patterns
- [ ] **8.6** Add custom rule configuration support

## Phase 9: Integration & Polish

- [ ] **9.1** End-to-end integration tests
- [ ] **9.2** Add example code samples for testing the reviewers
- [ ] **9.3** Create usage documentation
- [ ] **9.4** Add error handling and graceful failures
- [ ] **9.5** Performance optimization for large codebases
- [ ] **9.6** Add `--dry-run` mode for testing configuration

## Future Enhancements (Optional)

- [ ] Watch mode for continuous review during development
- [ ] Git diff mode to review only changed files
- [ ] Custom agent plugin system
- [ ] Review history and trend tracking
- [ ] IDE integration (VS Code extension)
- [ ] Web dashboard for review results
