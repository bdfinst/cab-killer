# Automatic Progress and Token Usage Display

The fix orchestrator now automatically displays progress and token usage as it works through fixes. This happens by default without any special setup.

## What You'll See

### During Execution

```bash
$ node src/index.js apply-fixes ./review-prompts --repo /path/to/target/repo

Found 5 prompts in ./review-prompts
Token tracking enabled (max: 200,000)

[1/5] 001-test-quality.json
  Priority: high
  Category: test-quality
  Files: src/utils/parser.js, tests/utils/parser.test.js
  Running lint...
  Running build...
  Running tests...
  Status: Applied & Validated
  Progress: 1/5 (20.0%) | Elapsed: 1m 23s | ETA: 5m 32s
  [██████░░░░░░░░░░░░░░░░░░░░░░░░] 20.5% | Tokens: 41,000/200,000 (159,000 remaining)

[2/5] 002-naming.json
  Priority: medium
  Category: naming
  Files: src/api/handler.js
  Running lint...
  Running build...
  Status: Applied but validation failed
  Failed step: build
  Details: Type error: Cannot find name 'Request'
  Progress: 2/5 (40.0%) | Elapsed: 2m 45s | ETA: 4m 8s
  [████████████░░░░░░░░░░░░░░░░░░] 39.8% | Tokens: 79,600/200,000 (120,400 remaining)

[3/5] 003-structure-review.json
  Priority: medium
  Category: structure-review
  Files: src/api/validator.js
  Running lint...
  Running build...
  Running tests...
  Status: Applied & Validated
  Progress: 3/5 (60.0%) | Elapsed: 4m 12s | ETA: 2m 48s
  [██████████████████░░░░░░░░░░░░] 61.2% | Tokens: 122,400/200,000 (77,600 remaining)

[4/5] 004-domain-review.json
  Priority: low
  Category: domain-review
  Files: src/models/user.js
  Running lint...
  Running build...
  Running tests...
  Status: Applied & Validated
  Progress: 4/5 (80.0%) | Elapsed: 5m 38s | ETA: 1m 25s
  [████████████████████████░░░░░░] 79.5% | Tokens: 159,000/200,000 (41,000 remaining)

[5/5] 005-complexity-review.json
  Priority: high
  Category: complexity-review
  Files: src/data/processor.js
  Running lint...
  Running build...
  Running tests...
  Status: Applied & Validated
  Progress: 5/5 (100.0%) | Elapsed: 7m 5s | ETA: 0s
  [██████████████████████████████] 98.2% | Tokens: 196,400/200,000 (3,600 remaining)
```

### Final Summary

```
============================================================
  FIX SUMMARY REPORT
============================================================

Total: 5 | Applied: 4 | Failed: 0 | Validation Failed: 1
Duration: 7m 5s
Token Usage: 196,400/200,000 (98.2%)

--- APPLIED & VALIDATED ---

[test-quality] 001-test-quality.json
  Add missing test for parseInput function
  Files: src/utils/parser.js, tests/utils/parser.test.js

[structure-review] 003-structure-review.json
  Extract validation logic into separate module
  Files: src/api/validator.js

[domain-review] 004-domain-review.json
  Improve model encapsulation
  Files: src/models/user.js

[complexity-review] 005-complexity-review.json
  Simplify nested conditions in processData
  Files: src/data/processor.js

--- VALIDATION FAILED ---

[naming] 002-naming.json
  Rename handler to handleRequest for clarity
  Files: src/api/handler.js
  Failed step: build
  Reason: Type error: Cannot find name 'Request'

============================================================
```

## Progress Information Explained

### Progress Line
- **1/5 (20.0%)** - Current fix out of total, with percentage
- **Elapsed: 1m 23s** - Time spent so far
- **ETA: 5m 32s** - Estimated time remaining (based on average time per fix)

### Token Usage Bar
- **Visual bar** - Shows token consumption visually
- **Percentage** - Exact percentage of context window used
- **Tokens used/max** - Current token count and maximum
- **Remaining** - Tokens still available

## Disabling Progress Display

If you prefer minimal output, disable the progress display:

```bash
node src/index.js apply-fixes ./prompts --no-progress
```

This will only show:
- Fix status (Applied, Failed, Validation Failed)
- Final summary
- No progress bars or token usage

## Benefits

1. **Visibility** - See exactly how much progress has been made
2. **Time estimates** - Know when the process will complete
3. **Token awareness** - Monitor context window usage to avoid hitting limits
4. **Early warning** - Spot if token usage is too high and may cause issues
5. **Debugging** - Elapsed time helps identify slow fixes

## Token Tracking Details

The token tracker uses a rough estimation:
- **~4 characters per token** - Industry standard approximation
- Tracks both input (prompts + repository rules) and output (Claude responses)
- Cumulative across all fixes in the session
- Helps prevent hitting the 200K token context window limit

If you're working with many fixes, monitor the token usage bar to ensure you don't run out of context before completing all fixes.
