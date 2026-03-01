# Concurrency Review

Output JSON:
```json
{"status": "pass|warn|fail|skip", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=no concurrency issues, warn=potential concerns, fail=likely race conditions or safety violations
Severity: error=race condition or data corruption risk, warning=potential concurrency concern, suggestion=defensive improvement

Model tier: mid
Context needs: full-file

## Skip

Return `{"status": "skip", "issues": [], "summary": "No concurrency-relevant patterns in target"}` when:
- No async/await, Promise, Worker, SharedArrayBuffer, or threading patterns
- No shared mutable state across callbacks, event handlers, or concurrent paths
- Pure synchronous single-threaded code with no event-driven patterns

## Detect

Race conditions:
- Read-then-write without atomicity (check-then-act)
- Shared mutable state accessed from multiple async paths
- Event handlers modifying shared state without guards
- Database read-modify-write without transactions or optimistic locking
- File operations without locking (open-write-close races)

Idempotency:
- Non-idempotent HTTP handlers (POST/PUT without deduplication)
- Side effects in retry-able operations (payments, emails, queue messages)
- Missing idempotency keys on critical mutations

Promise/async pitfalls:
- Unhandled promise rejections (missing `.catch()` or try/catch on await)
- Dangling promises (async calls without await)
- Promise.all without error boundaries (one failure rejects all)
- Sequential awaits that could be parallel (`Promise.all`)
- async forEach (does not await iterations)

Shared state safety:
- Module-level mutable state in server code (request-scoped data in module scope)
- Global caches without eviction or size bounds
- Mutable singletons accessed across requests
- Closure-captured mutable variables in concurrent callbacks

Resource ordering:
- Nested locks or resource acquisition in inconsistent order (deadlock risk)
- Connection pool exhaustion from unawaited async operations
- Missing cleanup in error paths (finally/dispose)

## Ignore

Code style, naming, domain modeling, security, complexity (handled by other agents)
