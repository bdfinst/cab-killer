# Security Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=no vulnerabilities, warn=concerns, fail=critical vulnerabilities
Severity: error=exploitable, warning=potential weakness, suggestion=best practice

## Detect

Injection:
- SQL: unsanitized input in queries, missing parameterized queries
- XSS: unescaped user input in HTML output
- Command: user input in shell execution
- Template: unescaped template variables
- Path traversal: user input in file paths

Auth/authz:
- Weak password hashing (not bcrypt/argon2)
- Insecure token generation
- Missing session management
- Missing authorization checks
- No brute force protection
- JWT issues (algorithm confusion, no expiration validation)

Data exposure:
- Hardcoded secrets/API keys/passwords
- Sensitive data in logs
- Unencrypted sensitive storage
- PII mishandling
- Verbose error messages exposing internals

Config:
- Missing security headers (CSP, HSTS, X-Frame-Options)
- Permissive CORS
- Debug enabled in production
- Default credentials
- Missing rate limiting

Crypto:
- MD5/SHA1 for security purposes
- Insecure random generation
- Hardcoded keys
- Deprecated crypto functions

Input:
- Missing server-side validation
- Unsafe file uploads
- Insecure deserialization
- Open redirects

## Ignore

Code style, naming, tests, complexity (handled by other agents)
