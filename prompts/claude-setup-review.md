# Claude Setup Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=complete config, warn=gaps, fail=critical missing
Severity: error=blocks AI effectiveness, warning=reduces quality, suggestion=enhancement

## Detect

CLAUDE.md:
- Missing or malformed
- No project overview
- No architecture documentation
- Undocumented directory structure
- Missing/incorrect commands
- Missing coding conventions
- Referenced paths don't exist

Rules:
- Missing .clinerules or .claude/rules/
- Rules not actionable
- Conflicting rules

Skills:
- Common workflows (commit, test, deploy) not defined as skills
- Missing skill definitions
- Skills reference wrong paths/commands

Accuracy:
- Documented structure doesn't match actual project
- Commands don't work

## Ignore

Code quality, tests, domain modeling (handled by other agents)
