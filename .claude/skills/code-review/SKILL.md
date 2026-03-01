---
name: code-review
description: Run all enabled review agents against target files
user-invocable: true
---

# Code Review

You have been invoked with the `/code-review` skill. Run all enabled review agents and produce a summary.

## Parse Arguments

- `--agent <name>`: Run only the named agent (delegates to `/review-agent`)
- `--changed`: Review only uncommitted changes (`git diff --name-only` + `git diff --cached --name-only`)
- `--since <ref>`: Review files changed since a git ref (`git diff --name-only <ref>...HEAD`)
- `--path <dir>`: Target directory (default: current working directory)
- No arguments: review all files in the target directory

## Steps

### 1. Determine target files

Based on arguments, build a file list:
- `--changed`: run `git diff --name-only` and `git diff --cached --name-only`, combine and deduplicate
- `--since <ref>`: run `git diff --name-only <ref>...HEAD`
- Default: glob all source files in the target path (exclude node_modules, .git, dist, build, coverage)

### 2. Load configuration

Look for `config/review-config.json` in the current working directory. If it exists, read it. If not, treat all agents as enabled with default thresholds.

For each agent file in `.claude/agents/*.md`, check if the config disables it (`"enabled": false`). Agents not mentioned in the config are enabled by default.

### 3. Run each enabled agent

For each enabled agent, read its definition from `.claude/agents/<name>.md` and review the target files following the agent's instructions.

**File filtering**: If the agent's config has a `filePatterns` array (e.g., `["*.js", "*.ts"]`), only pass files matching those patterns to the agent. If the agent definition itself states a file scope (e.g., "JavaScript and TypeScript files only"), respect that. Skip the agent entirely if no target files match its patterns.

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
