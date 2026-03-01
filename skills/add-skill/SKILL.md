---
name: add-skill
description: >-
  Scaffold a new SKILL.md from a description or URL.
  Use when adding a new skill to the toolkit.
argument-hint: >-
  <description-or-url> [--name <name>]
  [--role orchestrator|worker|implementation]
  [--tools <extra>] [--dry]
user-invocable: true
allowed-tools: Read, Write, Grep, Glob, WebFetch, Skill(eval-audit *)
---

# Add Skill

Role: implementation. This skill scaffolds new SKILL.md files — it
generates compliant skill definitions from a description or reference
URL.

You have been invoked with the `/add-skill` skill. Generate a new
SKILL.md file that passes eval compliance checks.

## Implementation constraints

1. **Follow the skill template exactly.** Every generated skill must
   have: frontmatter, Role declaration, invocation line, constraints
   section, argument parsing, numbered steps.
2. **Match constraints to role.** Orchestrators must not review code
   directly. Workers must return structured JSON. Implementation skills
   must validate after changes.
3. **Do not over-specify.** Generate steps that match the described
   purpose. Do not add steps the user did not ask for.
4. **Be concise.** Constraints should be one sentence each. Steps
   should be actionable, not explanatory.

## Parse Arguments

Arguments: $ARGUMENTS

Required: description or URL (`$0`) — either a text description of
what the skill should do, or a URL to fetch guidance from.

Optional:

- `--name <name>`: Skill name in kebab-case (derived from description
  if omitted)
- `--role orchestrator|worker|implementation`: Skill role
  (default: `worker`)
- `--tools <extra>`: Comma-separated additional tools beyond the role
  defaults
- `--dry`: Preview the generated skill without writing to disk

## Steps

### 1. Parse input

- If `$0` starts with `http://` or `https://`, fetch it with WebFetch
  and extract the skill purpose from the page content.
- Otherwise, treat `$0` as a text description of the skill's purpose.

### 2. Derive skill name

If `--name` was not provided:

- Extract key action from the description (e.g., "run linting
  checks" → `lint-check`)
- Convert to kebab-case

### 3. Check for overlap

Read all files in `skills/*/SKILL.md`. For each existing skill:

- Compare the description and steps against the new skill's intended
  purpose
- If overlap is found, warn the user:
  `⚠ Possible overlap with <existing-skill>: <overlapping concern>`
- Continue unless the user cancels

### 4. Build allowed-tools

Start with role defaults, then add `--tools` extras:

| Role | Default tools |
| --- | --- |
| orchestrator | Read, Grep, Glob, Skill(*) |
| worker | Read, Grep, Glob |
| implementation | Read, Edit, Grep, Glob |

### 5. Generate SKILL.md

Build the SKILL.md using this exact template:

```markdown
---
name: <name>
description: <when to use this skill>
argument-hint: "<args hint>"
user-invocable: true
allowed-tools: <tools from step 4>
---

# <Title Case Name>

Role: <role>. <One sentence describing what the skill does.>

You have been invoked with the `/<name>` skill. <Short instruction.>

## <Role> constraints

1. **<Primary constraint>.** <One sentence.>
2. **<Secondary constraint>.** <One sentence.>
3. **Be concise.** <Output format expectation.>

## Parse Arguments

Arguments: $ARGUMENTS

<Document required and optional arguments>

## Steps

### 1. <First step>

<Step description>

### 2. <Next step>

<Step description>

### N. Report

<Output format>
```

### 6. Write or preview

- If `--dry` was passed, display the generated content and stop.
- Otherwise, create `skills/<name>/` directory and write
  `skills/<name>/SKILL.md`.

### 7. Run eval audit

Run `/eval-audit skills/<name>/SKILL.md --fix` to validate compliance.
If any checks fail after auto-fix, report the remaining issues.

### 8. Update CLAUDE.md

Add a bullet to the skills list in `CLAUDE.md`:

```text
- `/<name>` — <short description>
```

Insert alphabetically within the existing list.

### 9. Report

```text
Skill created: skills/<name>/SKILL.md
Role: <role>
Tools: <allowed-tools>
Eval audit: PASS|WARN (details)
```
