# Domain Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=clean model, warn=minor issues, fail=boundary violations
Severity: error=leaky abstraction, warning=misplaced logic, suggestion=modeling improvement

## Detect

Business logic placement:
- Business rules in UI layer
- Business rules in data access layer
- Services containing business rules (should coordinate only)

Abstraction leaks:
- Domain objects exposing implementation details
- Technical concerns in domain model
- Infrastructure code (DB, HTTP) mixed with domain

Entity/DTO confusion:
- Missing DTOs for cross-boundary transfer
- Domain objects used for data transfer

Boundary violations:
- Aggregate boundaries not respected
- Direct cross-context dependencies
- Missing domain events for cross-boundary communication

Ubiquitous language:
- Domain terms not matching business language
- Inconsistent terminology

## Ignore

Code structure, naming style, tests (handled by other agents)
