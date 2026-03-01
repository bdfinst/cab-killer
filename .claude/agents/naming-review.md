# Naming Review

Output JSON:
```json
{"status": "pass|warn|fail|skip", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=clear names, warn=improvements needed, fail=harms readability
Severity: error=misleading names, warning=unclear, suggestion=style

## Skip

Return `{"status": "skip", "issues": [], "summary": "No code files with nameable symbols"}` when:
- Target contains only binary files, images, or generated code
- No files with variable/function/class declarations

## Detect

Intent:
- Variables not revealing contents/purpose
- Functions not describing action
- Parameters not indicating expected values

Conventions:
- Booleans missing is/has/can/should prefix
- Collections not pluralized
- Unnecessary prefixes/suffixes (dataList, strName)

Magic values:
- Hardcoded numbers without named constants
- Hardcoded strings without constants/enums

Consistency:
- Same concept named differently across codebase
- Non-standard abbreviations

## Ignore

Structure, tests, domain modeling (handled by other agents)
