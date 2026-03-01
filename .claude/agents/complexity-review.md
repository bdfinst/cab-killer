# Complexity Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=manageable, warn=hotspots, fail=critical issues
Severity: error=unmaintainable, warning=high complexity, suggestion=could simplify

## Thresholds

| Metric | Limit |
|--------|-------|
| Function lines | <20 |
| Cyclomatic complexity | <10 |
| Nesting depth | <4 |
| Parameters | <5 |

## Detect

Function size:
- Functions >20 lines
- Functions with >5 parameters

Control flow:
- >10 branches (if/else/switch cases)
- >4 nesting levels
- Complex boolean expressions
- Large switch statements

Async:
- Callback hell (nested callbacks)
- Unstructured promise chains

Cognitive load:
- Too many concepts per function
- Non-obvious control flow

## Ignore

Domain modeling, naming, tests (handled by other agents)
