# FP Review

Output JSON:
```json
{"status": "pass|warn|fail", "issues": [{"severity": "error|warning|suggestion", "file": "", "line": 0, "message": "", "suggestedFix": ""}], "summary": ""}
```

Severity: error=external state mutation, warning=local mutation, suggestion=style

## Detect

Variable declarations:
- `let` never reassigned → use `const`
- `var` → use `const`/`let`
- Exception: prefixes mut/mutable/_ indicate intentional mutability

Array mutations (flag and suggest):
- `.push()` → `[...arr, item]`
- `.pop()` → `arr.slice(0, -1)`
- `.shift()` → `arr.slice(1)`
- `.unshift()` → `[item, ...arr]`
- `.splice()` → slice + spread
- `.reverse()` → `[...arr].reverse()` or `toReversed()`
- `.sort()` → `[...arr].sort()` or `toSorted()`
- `.fill()` → map
- Exception: mutations on spread copies `[...arr].sort()` allowed

Object mutations:
- `param.prop = value` (parameter mutation)
- `param[key] = value` (parameter mutation)
- `delete param.prop`
- `Object.assign(existingObj, ...)` → spread or new object target
- Exception: `this.property` in class methods allowed

Global state:
- `window.*` mutations
- `global.*` mutations
- `globalThis.*` mutations
- `process.env.*` mutations

Impure patterns:
- Functions modifying parameters
- Functions depending on/modifying external state
- `++`/`--` outside loop counters
