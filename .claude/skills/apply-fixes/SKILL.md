---
name: apply-fixes
description: Apply correction prompts from a review run
user-invocable: true
---

# Apply Fixes

You have been invoked with the `/apply-fixes` skill. Load correction prompt JSON files and apply each fix.

## Parse Arguments

Required: path to directory containing correction prompt JSON files

Optional:
- `--repo <path>`: Target repository path (default: current working directory)
- `--skip-tests`: Skip running tests after each fix
- `--skip-build`: Skip running build after each fix
- `--skip-lint`: Skip running lint after each fix
- `--dry`: Preview what would be applied without making changes
- `--verbose`: Show detailed output

## Steps

### 1. Load repository rules

Detect and read rules from the target repository:
- `CLAUDE.md`
- `.clinerules`
- `.claude/rules/index.md`
- `CONTRIBUTING.md`

These rules inform how fixes should be applied.

### 2. Load correction prompts

Read all `.json` files from the specified directory, sorted alphabetically. Each file contains:

```json
{
  "priority": "high|medium|low",
  "category": "<agent-name>",
  "instruction": "<what to fix>",
  "context": "<where>",
  "affectedFiles": ["<path>"]
}
```

### 3. Apply each fix

For each prompt, sorted by priority (high first):

1. Read the affected file(s)
2. Apply the minimal fix described in the instruction
3. Follow all repository rules and coding conventions
4. Do not change anything beyond what the instruction requires

### 4. Validate after each fix

Unless skipped, run after each fix:
1. **Lint** — run the project's lint command
2. **Build** — run the project's build command
3. **Tests** — run the project's test command

If validation fails, report the failure and continue to the next fix.

### 5. Track and report

After completing all fixes, display a summary:

```
Fix Summary
===========
Total: N | Applied: N | Failed: N | Validation Failed: N

--- APPLIED ---
[category] instruction (files)

--- FAILED ---
[category] instruction (reason)
```

Move successfully applied prompt files to a `completed/` subdirectory.
