---
name: semgrep-analyze
description: >-
  Run Semgrep static analysis on target files. Returns structured
  JSON with prioritized findings.
argument-hint: "[path] [--rules <ruleset>]"
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(semgrep *)
---

# Semgrep Analyze

Role: worker. This skill runs Semgrep and reports findings — it does
not fix code.

## Constraints

1. **Do not modify code.** Report findings only.
2. **Return structured JSON.** Output must match the output format below.
3. **Be concise.** No preambles, narration, or filler text.

## Parse Arguments

Arguments: $ARGUMENTS

- `path`: Directory or file to scan (default: current working
  directory)
- `--rules <ruleset>`: Semgrep ruleset (default: `auto`)

Examples:

```text
/semgrep-analyze
/semgrep-analyze src/
/semgrep-analyze --rules p/security-audit
/semgrep-analyze src/utils --rules p/javascript
```

## Steps

### 1. Check Semgrep installation

```bash
semgrep --version
```

If not installed, output:

```json
{"status": "skip", "issues": [], "summary": "semgrep not installed — install via pip install semgrep, pipx install semgrep, or brew install semgrep"}
```

Stop.

### 2. Run Semgrep scan

```bash
semgrep scan --config <ruleset> --quiet --json <path>
```

Default ruleset is `auto`. Default path is `.`.

### 3. Parse results

Map each Semgrep finding to an issue:

| Semgrep field        | Output field        |
| -------------------- | ------------------- |
| `check_id`           | `ruleId`            |
| `extra.severity`     | `severity`          |
| `path`               | `file`              |
| `start.line`         | `line`              |
| `extra.message`      | `message`           |
| `extra.metadata.cwe` | `cwe` (if present)  |

Severity mapping:

| Semgrep severity | Output severity |
| ---------------- | --------------- |
| ERROR            | error           |
| WARNING          | warning         |
| INFO             | suggestion      |

### 4. Output JSON

```json
{
  "status": "pass|warn|fail",
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "file": "<path>",
      "line": 0,
      "ruleId": "<check_id>",
      "message": "<description>",
      "cwe": "<CWE-ID>",
      "suggestedFix": "<fix>"
    }
  ],
  "summary": "<N findings: N errors, N warnings, N suggestions>"
}
```

Status: `fail` if any errors, `warn` if warnings but no errors,
`pass` if clean.

## Common Rulesets

| Ruleset            | Description                                 |
| ------------------ | ------------------------------------------- |
| `auto`             | Auto-detect language, use recommended rules |
| `p/javascript`     | JavaScript-specific rules                   |
| `p/typescript`     | TypeScript-specific rules                   |
| `p/react`          | React-specific rules                        |
| `p/nodejs`         | Node.js security rules                      |
| `p/security-audit` | General security audit                      |
| `p/owasp-top-ten`  | OWASP Top 10 vulnerabilities                |
| `p/ci`             | Rules suitable for CI/CD                    |
| `p/default`        | Semgrep default ruleset                     |

## Common Fixes

### Security

| Issue               | Fix                           |
| ------------------- | ----------------------------- |
| Hardcoded secrets   | Move to environment variables |
| SQL injection       | Use parameterized queries     |
| XSS vulnerability   | Sanitize user input           |
| Insecure randomness | Use crypto.randomUUID()       |

### Code Quality

| Issue                  | Fix                              |
| ---------------------- | -------------------------------- |
| Unused variables       | Remove or prefix with `_`        |
| Missing error handling | Add try/catch or error callbacks |
| Deprecated API usage   | Update to modern API             |

## Troubleshooting

### Rate limiting

```bash
semgrep login
# Or use offline mode with local rules
semgrep scan --config ./local-rules.yml .
```

### Memory issues on large codebases

```bash
semgrep scan --config auto --exclude node_modules --exclude dist .
```
