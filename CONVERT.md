# Prompt: Convert Script-Based Claude Toolkit to a Plugin

Use this prompt inside Claude Code at the root of your existing toolkit repository.

---

## The Prompt

```text
I have an existing repository that distributes Claude Code skills, agents, and hooks
using a shell script (install.sh) that symlinks directories into target projects.
I want to convert this into a proper Claude Code plugin so it can be installed
cross-platform with `claude plugin install`.

## Current repository structure

Audit my current repo and map what exists. I expect some combination of:
- agents/ directory with .md agent definitions
- skills/ directory with subdirectories each containing SKILL.md
- hooks/ directory with hook scripts or hooks.json
- commands/ directory with .md command files
- install.sh (the script-based installer to be replaced)
- CLAUDE.md or README.md

## What I need you to do

### 1. Create the plugin manifest

Create `.claude-plugin/plugin.json` at the repo root with this structure:

```json
{
  "name": "<derive from repo name>",
  "version": "1.0.0",
  "description": "<derive from README or CLAUDE.md>",
  "author": "<derive from git config>",
  "repository": "<derive from git remote>",
  "license": "MIT"
}
```

### 2. Reorganize files to match plugin layout

The required structure is:

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json          ← only the manifest goes here
├── agents/                   ← at root level, NOT inside .claude-plugin/
│   ├── code-review.md
│   └── ...
├── skills/                   ← at root level
│   ├── my-skill/
│   │   └── SKILL.md
│   └── ...
├── commands/                 ← at root level (optional)
│   └── ...
├── hooks/                    ← at root level (optional)
│   └── hooks.json
└── README.md
```

Critical rules:

- ONLY plugin.json goes inside `.claude-plugin/`
- All component directories (agents, skills, commands, hooks) must be at the plugin root
- Skills must be subdirectories containing a SKILL.md file
- Agent files must be .md files with YAML frontmatter (name, description, tools, model)
- Hooks need a hooks.json configuration file if not already present
- Files outside the plugin root directory will not be accessible after installation
  (the plugin is copied to a cache), so no `../` references

### 3. Validate all SKILL.md frontmatter

Every SKILL.md must have valid YAML frontmatter with at minimum:

```yaml
---
name: skill-name
description: >
  What this skill does and when to trigger it. Be specific about
  trigger phrases and contexts. Err on the side of being "pushy"
  about when to activate — undertriggering is the common failure mode.
---
```

Review each skill description and improve it if it's too vague.
The description is the primary mechanism Claude uses to decide whether to load a skill.

### 4. Validate all agent .md frontmatter

Every agent file must have YAML frontmatter with at minimum:

```yaml
---
name: agent-name
description: >
  When and why to delegate to this agent.
  Use PROACTIVELY if this agent should auto-invoke.
tools: Read, Grep, Glob
model: sonnet
---
```

Review tool scoping for each agent:

- Read-only agents (reviewers): Read, Grep, Glob
- Research agents: Read, Grep, Glob, WebFetch, WebSearch
- Code-writing agents: Read, Write, Edit, Bash, Glob, Grep
- If an agent preloads skills, add: `skills: skill-name-1, skill-name-2`

### 5. Handle hooks migration

If hooks exist as standalone shell scripts, create a `hooks/hooks.json` that
registers them properly. The format is:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "command": "bash ./hooks/my-hook.sh"
      }
    ]
  }
}
```

If no hooks exist, skip this step.

### 6. Clean up the old installer

- Remove or rename install.sh (e.g., move to `legacy/install.sh` with a note)
- Remove any symlink-related entries from .gitignore
- Update README.md with the new installation instructions:

```bash
# Install from GitHub
claude plugin install https://github.com/<owner>/<repo>

# Or install locally during development
claude --plugin-dir /path/to/this/repo

# Update
claude plugin update <plugin-name>
```

### 7. Add a .gitignore for plugin development

Ensure .gitignore includes:

```text
node_modules/
.DS_Store
*.log
```

### 8. Version bump strategy

Document in README that `plugin.json` version must be bumped for users
to receive updates. Claude Code uses the version field to determine
whether to refresh the cached copy.

## Constraints

- Do NOT put any component directories inside .claude-plugin/
- Do NOT reference files outside the plugin root (no ../ paths)
- Do NOT create a marketplace.json — this is a standalone plugin
- Do NOT modify the actual content/instructions within skills or agents,
  only fix structural issues (frontmatter, file locations)
- DO preserve all existing git history — use git mv where possible
- DO run `claude --plugin-dir .` after changes to verify the plugin loads

## Output

After making changes:

1. Show me a tree of the new structure
2. Show me the plugin.json you created
3. List any skills or agents whose descriptions you improved, with before/after
4. List any issues you found but couldn't fix automatically
5. Run `claude --plugin-dir .` to verify the plugin loads without errors

```text
```

---

## Usage

1. Open Claude Code at the root of your toolkit repository
2. Paste the prompt above
3. Claude will audit your current structure and reorganize it
4. Review the changes, then commit and push
5. Install in any project with `claude plugin install https://github.com/<you>/<repo>`
