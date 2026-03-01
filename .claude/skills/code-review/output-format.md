# Output Format Reference

## Per-agent JSON result

```json
{
  "agentName": "structure-review",
  "status": "pass|warn|fail|skip",
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "file": "src/auth/login.ts",
      "line": 42,
      "message": "God object: AuthController handles login, registration, and password reset",
      "suggestedFix": "Split into LoginController, RegistrationController, and PasswordResetController"
    }
  ],
  "summary": "2 issues found: 1 error, 1 warning"
}
```

## Correction prompt JSON

```json
{
  "priority": "high|medium|low",
  "category": "structure-review",
  "instruction": "Fix: God object handles too many concerns (Suggested: Split into focused controllers)",
  "context": "Line 42 in src/auth/login.ts",
  "affectedFiles": ["src/auth/login.ts"]
}
```

Severity mapping: error->high, warning->medium, suggestion->low.

## Status rules

- **pass**: Zero issues
- **warn**: Issues found, none are errors
- **fail**: At least one error-severity issue
- **skip**: Agent is inapplicable to the target (e.g., no JS/TS files for js-fp-review)
