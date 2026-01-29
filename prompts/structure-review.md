# Structure Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=clean, warn=minor issues, fail=architectural problems
Severity: error=breaks maintainability, warning=tech debt, suggestion=improvement

## Detect

SRP violations:
- Module/class with multiple responsibilities
- God objects/functions doing too much
- Mixed concerns (UI + business logic + data access)

DRY violations:
- Duplicated code blocks
- Copy-paste patterns

Coupling issues:
- Hardcoded dependencies (not injected)
- Circular dependencies
- Change propagation across modules

Nesting:
- >3 levels of conditionals/loops

Organization:
- Inconsistent file/folder structure
- Misplaced abstractions

## Ignore

Test quality, naming, domain modeling (handled by other agents)
