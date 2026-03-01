---
name: add-agent
description: Scaffold a new review agent from a description or URL. Use when adding a new code review agent to the toolkit.
argument-hint: "<description-or-url> [--name <name>] [--tier small|mid|frontier] [--context diff-only|full-file|project-structure] [--lang <exts>] [--dry]"
user-invocable: true
allowed-tools: Read, Write, Grep, Glob, WebFetch, Skill(eval-audit *)
---

# Add Agent

Role: implementation. This skill scaffolds new review agent files — it generates compliant agent definitions from a description or reference URL.

You have been invoked with the `/add-agent` skill. Generate a new review agent `.md` file that passes eval compliance checks.

## Implementation constraints

1. **Follow the agent template exactly.** Every generated agent must have: frontmatter, Output JSON block, Status/Severity lines, Model tier, Context needs, `## Skip`, `## Detect`, `## Ignore` — in that order.
2. **Do not invent detection rules.** Derive rules from the user's description or URL content. If the description is vague, ask before guessing.
3. **Respect scope boundaries.** Check existing agents for overlap before generating. Warn the user if the new agent's scope conflicts with an existing one.
4. **Be concise.** Detection rules should be short phrases, not paragraphs. Skip/Ignore sections should be one-liners where possible.

## Parse Arguments

Arguments: $ARGUMENTS

Required: description or URL (`$0`) — either a text description of what the agent should review, or a URL to fetch guidance from.

Optional:
- `--name <name>`: Agent name in kebab-case ending in `-review` (derived from description if omitted)
- `--tier small|mid|frontier`: Model tier (default: `small`)
- `--context diff-only|full-file|project-structure`: Context needs (default: `diff-only`)
- `--lang <exts>`: Comma-separated file extensions for language-specific scope (e.g., `js,ts,jsx,tsx`)
- `--dry`: Preview the generated agent without writing to disk

## Steps

### 1. Parse input

- If `$0` starts with `http://` or `https://`, fetch it with WebFetch and extract the review focus from the page content.
- Otherwise, treat `$0` as a text description of the agent's purpose.

### 2. Derive agent name

If `--name` was not provided:
- Extract key concept from the description (e.g., "React hook violations" → `react-hook`)
- Append `-review` if not already present
- Convert to kebab-case

### 3. Check for scope overlap

Read all files in `agents/*.md`. For each existing agent:
- Compare the `## Detect` section topics against the new agent's intended scope
- If overlap is found, warn the user: `⚠ Possible overlap with <existing-agent>: <overlapping topic>`
- Continue unless the user cancels

### 4. Generate agent file

Build the agent `.md` using this exact template:

```
---
name: <name>
description: <one-line summary>
tools: Read, Grep, Glob
model: <haiku|sonnet|opus>
---

# <Title Case Name>

<If --lang provided>
Scope: <Language> files only (<extensions>). Skip this agent entirely if the project has no <language> files.
</If>

Output JSON:
\```json
{"status": "pass|warn|fail|skip", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
\```

Status: pass=<no issues>, warn=<minor concerns>, fail=<critical issues>
Severity: error=<must fix>, warning=<should fix>, suggestion=<consider>

Model tier: <tier>
Context needs: <context>

## Skip

Return `{"status": "skip", "issues": [], "summary": "<reason>"}` when:
- <inapplicability condition 1>
- <inapplicability condition 2>

## Detect

<Category 1>:
- <specific pattern to flag>
- <specific pattern to flag>

<Category 2>:
- <specific pattern to flag>
- <specific pattern to flag>

## Ignore

<What other agents handle> (handled by other agents)
```

Map `--tier` to frontmatter `model:`: small→haiku, mid→sonnet, frontier→opus.

### 5. Write or preview

- If `--dry` was passed, display the generated content and stop.
- Otherwise, write to `agents/<name>.md`.

### 6. Run eval audit

Run `/eval-audit agents/<name>.md --fix` to validate compliance. If any checks fail after auto-fix, report the remaining issues.

### 7. Update CLAUDE.md

Add a row to the agents table in `CLAUDE.md`:

```
| <name> | <short focus description> | <tier> |
```

Insert alphabetically by agent name within the existing table.

### 8. Report

```
Agent created: agents/<name>.md
Model tier: <tier>
Context needs: <context>
Eval audit: PASS|WARN (details)
```
