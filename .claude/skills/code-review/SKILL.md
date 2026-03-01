---
name: code-review
description: Run all enabled review agents against target files. Use after implementing features, before PRs, or when the user asks for a code review.
argument-hint: "[--agent <name>] [--changed | --since <ref>] [--path <dir>]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(git diff *), Skill(review-agent *)
---

# Code Review

You have been invoked with the `/code-review` skill. Run all enabled review agents and produce a summary.

For output format details, see [output-format.md](output-format.md).
For an example report, see [examples/sample-report.md](examples/sample-report.md).

## Parse Arguments

Arguments: $ARGUMENTS

- `--agent <name>`: Run only the named agent (delegates to `/review-agent`)
- `--changed`: Review only uncommitted changes (`git diff --name-only` + `git diff --cached --name-only`)
- `--since <ref>`: Review files changed since a git ref (`git diff --name-only <ref>...HEAD`)
- `--path <dir>`: Target directory (default: current working directory)
- No arguments: review all files in the target directory

## Progress tracking

Copy this checklist and track progress:

```
- [ ] Target files determined
- [ ] Agents loaded and filtered
- [ ] All agents executed
- [ ] Results aggregated
- [ ] Report generated
- [ ] Correction prompts saved (if requested)
```

## Steps

### 1. Determine target files

Based on arguments, build a file list:
- `--changed`: run `git diff --name-only` and `git diff --cached --name-only`, combine and deduplicate
- `--since <ref>`: run `git diff --name-only <ref>...HEAD`
- Default: glob all source files in the target path (exclude node_modules, .git, dist, build, coverage)

### 2. Determine enabled agents

List all agent files in `.claude/agents/*.md`. All agents are enabled by default.

If a `review-config.json` exists in the project root, read it. It can disable specific agents (`"enabled": false`). This file is optional and project-local — it is not part of the toolkit.

### 3. Run each enabled agent

For each enabled agent, spawn it as a parallel subagent using the Agent tool. Each agent runs in isolation against its matching files.

**File scope**: Each agent definition declares its own file scope (e.g., js-fp-review says "JavaScript and TypeScript files only"). Respect these scope declarations — only pass matching files, and skip the agent entirely if no target files match.

**Parallelism**: Launch all agents concurrently using multiple Agent tool calls in a single message. Wait for all to complete before aggregating.

Produce a JSON result per agent:

```json
{"agentName": "<name>", "status": "pass|warn|fail", "issues": [...], "summary": "..."}
```

### 4. Aggregate and report

Produce a summary table:

```
# Code Review Summary

| Agent              | Status | Issues |
|--------------------|--------|--------|
| test-review        | PASS   | 0      |
| structure-review   | WARN   | 2      |
| ...                | ...    | ...    |

Overall: WARN (N agents passed, N warned, N failed)
Total issues: N (N errors, N warnings, N suggestions)
```

Then list all issues grouped by file, sorted by severity (errors first).

### 5. Generate correction prompts

For each issue, generate a correction prompt:

```json
{
  "priority": "high|medium|low",
  "category": "<agent-name>",
  "instruction": "Fix: <message> (Suggested: <suggestedFix>)",
  "context": "Line <line> in <file>",
  "affectedFiles": ["<file>"]
}
```

Severity mapping: error→high, warning→medium, suggestion→low.

If the user requests it, save prompts as individual JSON files in a `corrections/` directory.
