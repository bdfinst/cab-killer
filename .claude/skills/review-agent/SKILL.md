---
name: review-agent
description: Run a single review agent against target files. Use when the user wants to run a specific agent by name rather than the full suite.
argument-hint: "<agent-name> [--changed | --since <ref>] [--path <dir>]"
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---

# Review Agent

You have been invoked with the `/review-agent` skill. Run a single named review agent.

## Parse Arguments

Arguments: $ARGUMENTS

Required: agent name (`$0`, e.g., `test-review`, `js-fp-review`, `security-review`)

Optional:
- `--changed`: Review only uncommitted changes
- `--since <ref>`: Review files changed since a git ref
- `--path <dir>`: Target directory (default: current working directory)

## Steps

### 1. Load agent definition

Read `.claude/agents/<name>.md`. If the file doesn't exist, list available agents from `.claude/agents/` and ask the user to pick one.

### 2. Determine target files

Same logic as `/code-review`:
- `--changed`: `git diff --name-only` + `git diff --cached --name-only`
- `--since <ref>`: `git diff --name-only <ref>...HEAD`
- Default: glob all source files

### 3. Run review

Follow the agent definition to review each target file. Produce a JSON result:

```json
{
  "agentName": "<name>",
  "status": "pass|warn|fail",
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "file": "<path>",
      "line": 0,
      "message": "<description>",
      "suggestedFix": "<fix>"
    }
  ],
  "summary": "<summary>"
}
```

### 4. Report

Display the result as a formatted summary with issues grouped by file. Include suggested fixes inline.
