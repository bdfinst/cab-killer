---
name: review-summary
description: Generate a compact session summary from the most recent code review results. Supports context continuity across sessions.
argument-hint: "[--from <json-file>]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Read, Write, Glob, Bash(date *), Bash(git rev-parse *), Bash(git branch *)
---

# Review Summary

You have been invoked with the `/review-summary` skill. Generate a compact summary of the most recent code review.

## Parse Arguments

Arguments: $ARGUMENTS

- `--from <json-file>`: Read review results from a JSON file (output of `/code-review --json`). If not provided, summarize from the most recent `/code-review` output in the conversation.

## Steps

### 1. Gather review data

If `--from` is specified, read the JSON file. Otherwise, look for the most recent code review results in the current conversation context.

Extract: overall status, agent statuses, issue counts by severity, and top issues.

### 2. Generate compact summary

Write a summary under 150 words following this template:

```
## Review: <branch> @ <short-sha> — <date>

**Status**: <PASS|WARN|FAIL> (<N> agents, <N> issues)

**Findings**:
- <top 3-5 findings, one line each, severity prefix>

**Blocked by**: <agent names that returned fail, or "none">

**Action items**: <1-3 concrete next steps>
```

### 3. Save summary

Write the summary to `.claude/review-summaries/<date>-<short-sha>.md`.

Create the `.claude/review-summaries/` directory if it doesn't exist.

### 4. Report

Display the summary to the user. Note that it will be available as context in future sessions.
