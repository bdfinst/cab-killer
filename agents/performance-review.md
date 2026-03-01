# Performance Review

Output JSON:
```json
{"status": "pass|warn|fail|skip", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Status: pass=no performance issues, warn=potential bottlenecks, fail=critical performance defects
Severity: error=resource leak or unbounded growth, warning=likely bottleneck, suggestion=optimization opportunity

Model tier: small
Context needs: full-file

## Skip

Return `{"status": "skip", "issues": [], "summary": "No performance-relevant patterns in target"}` when:
- Target contains only configuration, documentation, or type definitions
- No runtime code with I/O, loops, or data structures

## Detect

Resource leaks:
- Unclosed database connections, file handles, streams, sockets
- Missing `finally`/`using`/`defer`/`with` for resource cleanup
- Event listeners added without corresponding removal
- Timers (setInterval) without cleanup on teardown

N+1 patterns:
- Database queries inside loops
- API calls inside loops without batching
- Sequential I/O that could be parallel

Unbounded growth:
- Caches without size limits or eviction (Map/object growing forever)
- Arrays accumulating without bounds in long-lived processes
- Event listener accumulation (adding listeners in loops or repeated calls)
- Unbounded queue or buffer growth

Timeouts and degradation:
- Network calls without timeout configuration
- Missing circuit breakers on external service calls
- No fallback for degraded dependencies
- Blocking operations on main thread / event loop

Algorithmic:
- O(n^2) or worse in hot paths (nested loops over same collection)
- Repeated computation that could be memoized
- Large object cloning where partial updates suffice (deep clone in loops)
- String concatenation in loops (use join/builder)

## Ignore

Code structure, naming, tests, domain modeling, security, concurrency (handled by other agents)
