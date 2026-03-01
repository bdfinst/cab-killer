---
name: code-review
description: >-
  Run all enabled review agents against target files. Use after
  implementing features, before PRs, or when the user asks for a
  code review.
argument-hint: >-
  [--agent <name>] [--changed | --since <ref>] [--path <dir>]
  [--json] [--force]
user-invocable: true
allowed-tools: >-
  Read, Grep, Glob, Bash(git diff *), Bash(npx *), Bash(npm run *),
  Bash(pnpm *), Bash(yarn *), Bash(tsc *), Bash(eslint *),
  Bash(git log *), Bash(gh run *), Skill(review-agent *)
---

# Code Review

Role: orchestrator. This skill routes work — it does not review code
itself.

You have been invoked with the `/code-review` skill. Run all enabled
review agents and produce a summary.

For output format details, see [output-format.md](output-format.md).
For an example report, see
[examples/sample-report.md](examples/sample-report.md).

## Orchestrator constraints

Follow these constraints from the
[Minimum CD agent configuration](https://migration.minimumcd.org/docs/agentic-cd/agent-configuration/)
pattern:

1. **Do not review code yourself.** Delegate all semantic analysis to
   review agents.
2. **Minimize context passed to agents.** Each agent receives only
   what its `Context needs` field requires.
3. **Route to the right model tier.** Each agent declares its tier —
   pass it through when spawning subagents.
4. **Run deterministic gates first.** Standard tooling (lint,
   type-check, secret scan) is cheaper than AI review. Do not invoke
   agents if gates fail.
5. **Return structured results.** Aggregate agent JSON into a
   summary — do not add your own findings.
6. **Be concise.** Use tables, JSON, and short sentences. No
   preambles, no filler, no restating the task. Every output token
   costs money.

## Parse Arguments

Arguments: $ARGUMENTS

- `--agent <name>`: Run only the named agent (delegates to
  `/review-agent`)
- `--changed`: Review only uncommitted changes
  (`git diff --name-only` + `git diff --cached --name-only`)
- `--since <ref>`: Review files changed since a git ref
  (`git diff --name-only <ref>...HEAD`)
- `--path <dir>`: Target directory (default: current working
  directory)
- `--json`: Output aggregated JSON instead of prose summary (for CI
  integration)
- `--force`: Skip pre-flight gates and run agents even if
  deterministic checks fail
- No arguments: review all files in the target directory

## Progress tracking

Copy this checklist and track progress:

```text
- [ ] Target files determined
- [ ] Pre-flight gates passed
- [ ] Agents loaded and filtered
- [ ] All agents executed
- [ ] Results aggregated
- [ ] Report generated
- [ ] Correction prompts saved (if requested)
```

## Steps

### 1. Determine target files

Based on arguments, build a file list:

- `--changed`: run `git diff --name-only` and
  `git diff --cached --name-only`, combine and deduplicate
- `--since <ref>`: run `git diff --name-only <ref>...HEAD`
- Default: glob all source files in the target path (exclude
  node_modules, .git, dist, build, coverage)

### 2. Pre-flight gates (fail fast, fail cheap)

Run deterministic checks before spending tokens on AI agents. Skip
this step if `--force` is passed.

Sequence (stop on first failure unless `--force`):

1. **Lint**: Run `npx eslint` (or project lint command from
   package.json) on target files. If lint fails, report errors and
   stop.
2. **Type check**: Run `npx tsc --noEmit` if a `tsconfig.json`
   exists. If type errors exist, report and stop.
3. **Secret scan**: Grep target files for common secret patterns
   (`(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}`).
   If found, report and stop.
4. **Pipeline-red check**: Run `git log --oneline -1` and check if
   there's a failing CI status on the current branch (run
   `gh run list --branch $(git branch --show-current) --limit 1`
   `--json conclusion -q '.[0].conclusion'` if `gh` is available).
   If the last CI run failed, warn: "Pipeline is red — existing
   tests are failing. Fix CI before adding new code. Use `--force`
   to override."

If any gate fails and `--force` is not set, output the failure
details and stop. Do not run agents.

If a tool is not available (e.g., no eslint, no tsconfig, no gh),
skip that gate silently.

### 3. Determine enabled agents

List all agent files in `agents/*.md`. All agents are enabled by
default.

If a `review-config.json` exists in the project root, read it. It
can disable specific agents (`"enabled": false`). This file is
optional and project-local — it is not part of the toolkit.

### 4. Run each enabled agent

For each enabled agent, spawn it as a parallel subagent using the
Agent tool. Each agent runs in isolation against its matching files.

**File scope**: Each agent definition declares its own file scope
(e.g., js-fp-review says "JavaScript and TypeScript files only").
Respect these scope declarations — only pass matching files, and
skip the agent entirely if no target files match.

**Context needs**: Each agent declares a `Context needs` field.
When using `--changed` or `--since`:

- `diff-only`: Pass only the diff output, not full files. More
  token-efficient.
- `full-file`: Pass full file contents for files in the target list.
- `project-structure`: Pass full files plus directory tree context.

When not using `--changed`/`--since`, always pass full files
regardless of context needs.

**Model tier**: Each agent declares a `Model tier` field (`small`,
`mid`, `frontier`). When spawning subagents, pass the model
parameter:

- `small` → use `model: "haiku"` for the Agent tool
- `mid` → use `model: "sonnet"` for the Agent tool
- `frontier` → use default model (no model parameter needed)

**Parallelism**: Launch all agents concurrently using multiple Agent
tool calls in a single message. Wait for all to complete before
aggregating.

Produce a JSON result per agent:

```json
{"agentName": "<name>", "status": "pass|warn|fail", "issues": [], "summary": "..."}
```

### 5. Aggregate and report

**If `--json` flag is set**, output a single aggregated JSON object
and stop:

```json
{
  "overall": "pass|warn|fail",
  "timestamp": "<ISO 8601>",
  "targetFiles": 42,
  "preFlightPassed": true,
  "agents": [
    {"agentName": "test-review", "status": "pass", "issues": [], "summary": "..."},
    {"agentName": "security-review", "status": "fail", "issues": [], "summary": "..."}
  ],
  "totals": {"errors": 2, "warnings": 5, "suggestions": 3},
  "summary": "FAIL (N passed, N warned, N failed). N total issues."
}
```

**Otherwise**, produce a summary table:

```text
# Code Review Summary

| Agent              | Status | Issues | Model Tier |
|--------------------|--------|--------|------------|
| test-review        | PASS   | 0      | mid        |
| structure-review   | WARN   | 2      | mid        |
| ...                | ...    | ...    | ...        |

Overall: WARN (N agents passed, N warned, N failed)
Total issues: N (N errors, N warnings, N suggestions)
```

Then list all issues grouped by file, sorted by severity (errors
first).

### 6. Generate correction prompts

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

If the user requests it, save prompts as individual JSON files in a
`corrections/` directory.
