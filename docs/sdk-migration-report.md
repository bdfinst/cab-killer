# SDK Migration Report

## Overview

Migrated cab-killer from CLI spawning (`spawn('claude', ...)`) to the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) to achieve cost reduction, native parallel execution, and accurate token tracking.

## Changes Summary

| Component | Before | After |
|-----------|--------|-------|
| API calls | `spawn('claude', ['--print'])` | `query({ prompt, options })` |
| Token tracking | Estimated (~4 chars/token) | Native `usage.input_tokens` |
| Cost tracking | None | Native `total_cost_usd` |
| Parallel execution | Multiple subprocesses | Single SDK client, Promise.all |
| Permission handling | CLI flags | `permissionMode: 'bypassPermissions'` |

## Files Modified

### New Files
- `src/sdk/client.js` - SDK wrapper with usage aggregation
- `src/sdk/index.js` - Public exports
- `tests/sdk/client.test.js` - Unit tests

### Modified Files
- `src/agents/claude-code-agent.js` - SDK `chat()` instead of `spawn()`
- `src/agents/registry.js` - Accepts `sdkClient` option
- `src/utils/token-tracker.js` - Added `addUsage()` for native stats
- `src/orchestrator/orchestrator.js` - Accepts SDK client, `getUsage()`
- `src/fixer/fix-orchestrator.js` - SDK with `permissionMode: 'acceptEdits'`
- `src/cli.js` - Initializes SDK client, displays usage stats

## Architecture

```
CLI (creates SDKClient)
 │
 ├── Registry (receives sdkClient)
 │    └── ClaudeCodeAgent (uses sdkClient.chat())
 │
 ├── Orchestrator (receives sdkClient)
 │    └── getUsage() → aggregated stats
 │
 └── FixOrchestrator (creates or receives sdkClient)
      └── spawnAgent() → sdkClient.chat() with acceptEdits
```

**Key Pattern**: Dependency injection - SDK client created once, shared across components for unified usage tracking.

## SDK API Usage

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk'

const response = query({
  prompt,
  options: {
    model: 'claude-sonnet-4-5',
    cwd: workingDirectory,
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'bypassPermissions',
  }
})

for await (const message of response) {
  if (message.type === 'result' && message.subtype === 'success') {
    // message.usage.input_tokens
    // message.usage.output_tokens
    // message.total_cost_usd
    // message.duration_ms
    // message.result
  }
}
```

## Backward Compatibility

- `TokenTracker` preserves legacy methods (`addTokens`, `addText`, `formatProgressBar`)
- New SDK methods added (`addUsage`, `formatCostProgressBar`, `displaySdkUsage`)
- Tests use mock SDK client with same interface

## Demo Results

```
SDK Usage:
  Tokens: 3 in / 1,211 out
  Cost: $0.1740
  Duration: 23.96s
```

## Benefits Realized

1. **Accurate cost tracking** - Real `$0.1740` vs estimated token count
2. **Native token counts** - API reports exact input/output tokens
3. **Cache visibility** - Can track `cache_read_input_tokens` for prompt caching
4. **Simpler code** - No subprocess management, stdio handling, exit code parsing
5. **Unified usage** - Single SDK client aggregates stats across all agents

## Complexity Issues Fixed

The SDK migration demo ran a complexity review that flagged issues in the new code. These were immediately addressed:

### 1. Orchestrator.aggregateResults() - O(3n) → O(n)

**Before:** Three `.filter()` passes over results array
```javascript
const passed = results.filter(r => r.status === 'pass').length
const warned = results.filter(r => r.status === 'warn').length
const failed = results.filter(r => r.status === 'fail').length
```

**After:** Single `.reduce()` pass
```javascript
const counts = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1
  acc.issues += r.issues?.length || 0
  return acc
}, { pass: 0, warn: 0, fail: 0, issues: 0 })
```

### 2. SDKClient.chat() - Nested loops → Helper methods

**Before:** Nested conditionals with inner loops mixing concerns
**After:** Extracted helpers:
- `extractText(content)` - pulls text from content blocks
- `extractUsage(message)` - normalizes SDK usage format
- `accumulateUsage(usage)` - adds to totals
- `createEmptyUsage()` - factory for usage objects

### 3. FixOrchestrator - Long methods → Extracted helpers

**Before:** `applyFixes()` was ~60 lines with mixed responsibilities
**After:**
- `processPrompt(file, prompt, promptsDir)` - handles single prompt
- `getValidationSteps()` - data-driven validation config
- `formatReportItem(item, extraFields)` - formats one report item
- `formatReportSection(title, items, extraFields)` - formats report section

**Before:** `extractErrorMessage()` iterated 7 regex patterns
**After:** Single combined regex with alternation

### 4. TokenTracker - Added mode auto-detection

**Added:**
- `isSdkMode()` - detects if real cost data is present
- `formatAutoProgressBar()` - uses cost or token based on mode
- `displayAuto()` - delegates to appropriate display method

Kept existing methods for backward compatibility with tests.

## Verification

- ✅ 144 tests passing
- ✅ ESLint clean
- ✅ Demo review completed successfully
- ✅ Complexity issues addressed
