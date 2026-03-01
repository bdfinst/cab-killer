# Eval System for Code Review Agents

This document describes how the evaluation system ensures quality and consistency
across the code-review agent toolkit.

The system follows recommendations from Anthropic's
[Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
use deterministic (code-based) graders for everything they can handle, use
model-based graders only for what genuinely requires judgment, and calibrate
both against human review.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              User Workflows                      │
│  /code-review  /review-agent  /apply-fixes       │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Layer 1  │ │ Layer 2  │ │ Layer 3  │
│ Hooks    │ │ Agents   │ │ Human    │
│ (determ.)│ │ (model)  │ │ (review) │
└──────────┘ └──────────┘ └──────────┘
```

## Grader Layers

### Layer 1: Deterministic (hooks)

Fast, free, deterministic checks that run automatically via PostToolUse hooks:

| Hook | What it checks |
|------|---------------|
| `fp-review.sh` | Array mutations, global state mutations, Object.assign, parameter mutations |
| `token-efficiency-review.sh` | File length >500 lines, CLAUDE.md >5000 chars, function length >50 lines |
| `eval-compliance-check.sh` | Agent/skill file structure, output format, severity levels |

Hooks are **advisory only** — they warn but never block. They catch mechanical
issues cheaply before the model-based agents spend tokens on full analysis.

### Layer 2: Model-based (agents)

Nine specialized agents that require LLM judgment:

| Agent | Focus |
|-------|-------|
| test-review | Test quality, coverage, assertion quality |
| structure-review | SRP, DRY, coupling, organization |
| naming-review | Naming clarity, conventions, magic values |
| domain-review | Business logic placement, boundary violations |
| complexity-review | Cyclomatic complexity, nesting, function size |
| claude-setup-review | CLAUDE.md completeness and accuracy |
| token-efficiency-review | Token optimization (full analysis beyond hook) |
| security-review | Injection, auth, data exposure, crypto |
| fp-review | Mutation detection (full analysis beyond hook) |

Each agent outputs a structured result:

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

### Layer 3: Human review

The user reviews agent findings and decides which fixes to apply. The
`/apply-fixes` skill automates fix application but the user controls which
correction prompts are included.

## Workflows

### `/code-review` — Full review

```
Files → Config → Enabled Agents → Results → Summary Table → Correction Prompts
```

1. Determine target files (all, changed, or since ref)
2. Load config to find enabled agents
3. Run each enabled agent
4. Aggregate results into summary table
5. Generate correction prompts (optionally save to directory)

### `/review-agent <name>` — Single agent

```
Files → Agent Definition → Review → Result
```

1. Load agent definition from `.claude/agents/<name>.md`
2. Determine target files
3. Run review following agent instructions
4. Report findings

### `/apply-fixes <dir>` — Fix application

```
Prompts → Repo Rules → Apply Fix → Validate → Report
```

1. Load correction prompt JSON files from directory
2. Load repository rules (CLAUDE.md, .clinerules, etc.)
3. Apply each fix respecting repo conventions
4. Run validation (lint/build/tests) after each fix
5. Report results (applied, failed, validation failed)

## How Hooks and Agents Complement Each Other

The hooks (`fp-review.sh`, `token-efficiency-review.sh`) provide instant
feedback on the most common, mechanically detectable issues. The corresponding
agents (`fp-review`, `token-efficiency-review`) provide deeper analysis that
requires LLM judgment — for example, understanding whether a mutation is
intentional based on surrounding context, or whether a long function is
justified by its complexity.

```
Hook (instant, free)          Agent (thorough, costs tokens)
─────────────────────         ──────────────────────────────
.push() detected              Is the push on a local copy?
file >500 lines               Is the file a generated file?
Object.assign(obj, ...)       Is obj freshly created above?
```

## Eval Compliance

Two mechanisms ensure new agents and skills follow patterns:

### `/eval-audit` skill (manual)

Reads every agent, skill, and hook file and checks for:
- Structured output format
- Severity definitions
- Detection rules and scope boundaries
- Numbered steps and argument parsing
- Advisory-only hook behavior

Outputs a compliance report with PASS/WARN/FAIL per item.

### `eval-compliance-check.sh` hook (automatic)

Fires on Write/Edit to agent or skill files. Provides real-time advisory
warnings when:
- A review agent is missing output format or severity definitions
- A skill is missing numbered steps or argument parsing
- A review-related skill has no report section

## Configuration

`config/review-config.json` controls which agents are enabled and their
thresholds:

```json
{
  "agents": {
    "test-review": { "enabled": true, "severityThreshold": "warning" },
    "complexity-review": { "enabled": true, "maxComplexity": 10 },
    "fp-review": { "enabled": true }
  },
  "orchestrator": {
    "maxLoopIterations": 5,
    "failOnError": true
  }
}
```

Agents not listed in the config are enabled by default.

## Adding a New Agent

1. Create `.claude/agents/<name>.md` with:
   - JSON output format (status, issues, summary)
   - Severity definitions (error, warning, suggestion)
   - Detection rules
   - Scope boundaries (what to ignore)

2. Optionally add a hook in `.claude/hooks/<name>.sh` for deterministic checks

3. Add config entry in `config/review-config.json`

4. Run `/eval-audit` to verify compliance
