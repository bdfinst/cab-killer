# Test Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=no issues, warn=minor, fail=critical
Severity: error=compromises test effectiveness, warning=should fix, suggestion=improvement

## Detect

Coverage gaps:
- Missing edge cases (empty, null, boundary)
- Missing error paths (exceptions, invalid states)
- Missing happy path scenarios

Assertion quality:
- Non-specific assertions (truthiness-only checks)
- Implementation verification instead of behavior
- Incomplete state verification

Test hygiene:
- Shared mutable state between tests
- Mocks/stubs not reset
- Missing await on async operations
- No arrange-act-assert structure
- Misleading test descriptions

## Ignore

Code style, naming conventions (handled by other agents)
