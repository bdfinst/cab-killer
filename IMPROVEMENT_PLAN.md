# Token Efficiency Improvement Plan

This document outlines strategies to optimize Claude API token usage in the cab-killer code review system.

## Current Token Usage Analysis

### Key Findings

After analyzing the codebase, the following token usage patterns were identified:

1. **No prompt caching** - Static content (~11KB of agent prompts) is resent on every API call
2. **Repository rules repeated** - ~9.5KB of CLAUDE.md/README/CONTRIBUTING sent with every fix
3. **Prompt templates repeated** - ~11KB of agent prompts resent for every review
4. **No file chunking** - All files sent at once despite chunking utility existing but unused
5. **Full file contents always sent** - No truncation for large files
6. **Claude Code CLI used** - Doesn't support prompt caching features

### Token Usage Breakdown

- **Review Agent Prompts**: ~2KB each × 6 agents = ~12KB per review cycle
- **Repository Rules**: ~9.5KB per fix operation
- **File Contents**: Variable, can be 50KB-500KB+ for large codebases
- **Fix Instructions**: ~0.5-1KB per fix

### Current Architecture Issues

- `src/agents/claude-code-agent.js` uses CLI spawn instead of direct API
- `src/fixer/fix-orchestrator.js` rebuilds repository rules for every fix
- `src/cli.js` doesn't utilize existing `chunkFiles()` utility from `src/utils/context-window.js`
- No truncation applied despite `truncateContent()` utility existing

---

## Optimization Recommendations

### 1. Switch from Claude Code CLI to Direct API (HIGHEST IMPACT)

**Impact**: 75-90% reduction in input tokens for repeated content
**Effort**: Medium
**Files**: `src/agents/claude-code-agent.js`, `src/fixer/fix-orchestrator.js`

#### Requirements

- Replace CLI-based agent (`ClaudeCodeAgent`) with direct Anthropic API calls using `@anthropic-ai/sdk`
- Add `@anthropic-ai/sdk` dependency to `package.json`
- Implement prompt caching by marking static content (role, objective, checklist, output format) with `cache_control: { type: 'ephemeral' }`
- Use system message blocks for cacheable content instead of concatenating into user message
- Support both API and CLI modes via configuration flag for backward compatibility
- Add environment variable support for `ANTHROPIC_API_KEY`
- Track cache hit/miss statistics using `response.usage.cache_read_input_tokens` and `response.usage.cache_creation_input_tokens`

#### LLM Implementation Prompt

```
Create a new ClaudeApiAgent class in src/agents/claude-api-agent.js that replaces the CLI-based ClaudeCodeAgent.

Requirements:
1. Import @anthropic-ai/sdk and use the Messages API directly
2. Load agent prompts from PromptLoader (existing utility)
3. Structure API calls with:
   - System message containing: role, objective, checklist, and output_format sections
   - Mark system message with cache_control: { type: 'ephemeral' } to enable prompt caching
   - User message containing the files to review
4. Use truncateContent() from src/utils/context-window.js to limit file sizes (max 8000 tokens per file)
5. Use estimateTokens() to track token usage before and after API calls
6. Parse JSON responses using extractJsonFromResponse() from src/utils/json-extractor.js
7. Log cache performance metrics (cache_read_input_tokens, cache_creation_input_tokens) when VERBOSE=true
8. Handle API errors gracefully with try-catch
9. Return ReviewResult using the formatResult() method from BaseReviewAgent

Update src/agents/registry.js to use ClaudeApiAgent instead of ClaudeCodeAgent by default, with option to use CLI via useApi flag.

Follow existing code patterns in src/agents/base-agent.js and match the interface of ClaudeCodeAgent.
```

---

### 2. Cache Repository Rules in Fix Orchestrator (HIGH IMPACT)

**Impact**: ~2,400 tokens saved per fix
**Effort**: Low
**Files**: `src/fixer/fix-orchestrator.js`

#### Requirements

- Convert fix orchestrator from CLI spawning to direct API calls
- Load repository rules once using existing `loadRepositoryRules()` function
- Store formatted rules in `this.repoRulesFormatted` for reuse across all fixes
- Structure API calls with cacheable system message containing repository rules
- Apply `cache_control: { type: 'ephemeral' }` to rules section
- Implement tool use for file operations (read_file, edit_file, write_file)
- Process tool calls from Claude's response to actually modify files
- Maintain validation workflow (lint, build, test) after each fix

#### LLM Implementation Prompt

```
Modify src/fixer/fix-orchestrator.js to use direct Anthropic API instead of CLI spawning.

Requirements:
1. Add Anthropic client initialization in constructor
2. Keep existing loadRepoRules() method but store formatted rules for reuse
3. Create buildSystemMessage() method that returns:
   - Base instructions as first text block
   - Repository rules as second text block with cache_control: { type: 'ephemeral' }
4. Replace spawnAgent() CLI logic with direct API call:
   - Use messages.create() with system message from buildSystemMessage()
   - Include tools: read_file, edit_file, write_file with proper JSON schemas
   - User message contains the fix instruction, context, and affected files
5. Create processToolCalls() method to handle tool_use blocks from response:
   - Execute actual file read/write operations based on tool calls
   - Return success/failure status
6. Keep existing runValidation() logic unchanged
7. Track token usage with this.tokenTracker.addText() for prompts and responses
8. Log cache metrics when verbose mode is enabled
9. Maintain existing error handling and retry logic

Preserve all existing public methods and their signatures for backward compatibility.
```

---

### 3. Use File Chunking for Large Reviews (MEDIUM-HIGH IMPACT)

**Impact**: Enables reviewing larger codebases without context exhaustion
**Effort**: Low
**Files**: `src/cli.js`

#### Requirements

- Use existing `chunkFiles()` utility from `src/utils/context-window.js`
- Split files into chunks of max 180,000 tokens (reserve 20k for prompts/output)
- Process each chunk separately through the review orchestrator
- Aggregate results from all chunks into final ReviewResult
- Display progress showing current chunk number and total chunks
- Maintain existing CLI interface and options

#### LLM Implementation Prompt

```
Modify handleReviewCommand() in src/cli.js to support file chunking for large codebases.

Requirements:
1. Import chunkFiles from src/utils/context-window.js
2. After loading files with loadAndValidateFiles(), chunk them:
   - Use chunkFiles(files, 180000) to split into manageable chunks
   - 180k tokens reserves space for prompts (~10k) and output (~10k)
3. If chunks.length > 1, log: "Reviewing X files in Y chunk(s)"
4. Loop through each chunk:
   - Log "Processing chunk N/M..." if multiple chunks
   - Call executeReviewMode(orchestrator, chunk, options)
   - Collect results in allResults array
5. After all chunks processed, aggregate:
   - Use orchestrator.aggregateResults(allResults)
   - Continue with existing formatAndOutputResults() and generateCorrectionPrompts()
6. For single chunk (all files fit), skip chunking and process normally

Maintain existing error handling and exit codes.
```

---

### 4. Truncate Large Files (MEDIUM IMPACT)

**Impact**: 1-50K tokens saved per large file
**Effort**: Low
**Files**: `src/agents/claude-api-agent.js` (from Recommendation #1)

#### Requirements

- Apply existing `truncateContent()` utility to files before sending to API
- Set default limit of 8,000 tokens per file (~2,000 lines)
- Make limit configurable per-agent via config file
- Preserve start and end of files (existing utility behavior)
- Log when truncation occurs in verbose mode

#### LLM Implementation Prompt

```
Already included in Recommendation #1 implementation.

In the ClaudeApiAgent.review() method, before building filesContext:
1. Map over files and apply truncateContent(file.content, MAX_FILE_TOKENS)
2. Use MAX_FILE_TOKENS = 8000 as default
3. Support per-agent override via config: config.agents[agentName].maxFileTokens
4. Log when files are truncated: "Truncated ${file.path} from X to Y tokens"

This is already specified in the first prompt but emphasize the truncation step.
```

---

### 5. Run Agents in Parallel by Default (MEDIUM IMPACT - TIME)

**Impact**: 3-6x faster reviews (no token savings)
**Effort**: Very Low
**Files**: `src/cli.js`, `src/orchestrator/orchestrator.js`

#### Requirements

- Change default execution mode from sequential to parallel
- Add `--sequential` flag to opt-out of parallel execution
- Keep loop mode sequential (cannot parallelize iterations)
- Use existing `runAllAgentsParallel()` method from Orchestrator
- Maintain error handling and progress reporting

#### LLM Implementation Prompt

```
Update src/cli.js to make parallel execution the default mode.

Requirements:
1. In program definition, change mode default from 'all' to 'parallel'
2. Add new option: .option('--sequential', 'Run agents sequentially instead of parallel', false)
3. In executeReviewMode():
   - If options.sequential is true OR options.mode is 'loop', use sequential execution
   - Otherwise, use parallel execution via orchestrator.runAllAgentsParallel()
4. Update help text to reflect parallel as default
5. Keep all existing modes (single, loop) working as before

No changes needed to src/orchestrator/orchestrator.js - it already has runAllAgentsParallel().
```

---

### 6. Batch Similar Fixes (LOW-MEDIUM IMPACT)

**Impact**: 30-50% fewer API calls for fix application
**Effort**: Medium
**Files**: `src/fixer/fix-orchestrator.js`

#### Requirements

- Group fixes by category (test-quality, naming, complexity, etc.)
- Batch 3-5 fixes per API call when they're in the same category
- Pass multiple fix instructions in a single user message
- Process all tool calls from the batched response
- Validate after entire batch is applied
- Add `--batch` CLI flag to enable/disable batching
- Add `--batch-size` CLI flag to control batch size

#### LLM Implementation Prompt

```
Add batching capability to src/fixer/fix-orchestrator.js.

Requirements:
1. Create groupFixesByCategory(prompts) method:
   - Group prompts by prompt.category field
   - Split groups into batches of MAX_BATCH_SIZE (default 3)
   - Return array of batches: [{ category, items: [prompts] }]
2. Create applyBatchOfFixes(batch) method:
   - Combine fix instructions into single user message: "Apply these N related fixes..."
   - List each fix with number, instruction, location, files
   - Call API with higher max_tokens (8000 for multiple fixes)
   - Use buildSystemMessage() for cached rules
   - Process all tool_use blocks in response
   - Run validation once after all fixes applied
   - Return aggregated result
3. Create applyFixesBatched(prompts) method:
   - Call groupFixesByCategory() to organize
   - Loop through batches, applying each with applyBatchOfFixes()
   - Track applied/failed counts across all batches
   - Mark completed prompts after successful batch
4. Modify applyFixes() to check options.batch flag:
   - If true and prompts.length > 3, use applyFixesBatched()
   - Otherwise use existing sequential applyFixesSequential()
5. Update CLI in src/cli.js to add:
   - .option('--batch', 'Batch similar fixes together', true)
   - .option('--batch-size <n>', 'Fixes per batch', '3')

Follow existing patterns for error handling and progress reporting.
```

---

### 7. Implement Rate Limiting (CRITICAL FOR PRODUCTION)

**Impact**: Prevents API throttling errors and service disruptions
**Effort**: Medium
**Files**: `src/utils/rate-limiter.js`, `src/agents/claude-api-agent.js`

#### Requirements

- Implement token bucket algorithm for rate limiting
- Track requests per minute, tokens per minute, and tokens per day
- Queue requests when limits are reached
- Refill buckets continuously based on time elapsed
- Update buckets with actual token usage after API calls
- Share rate limiter instance across all agents
- Add timeout and rejection for queued requests (5 min max wait)
- Implement exponential backoff for 429 errors
- Add configuration for rate limit values
- Track and report statistics (throttled requests, queue length, etc.)

#### LLM Implementation Prompt

```
Create a rate limiting system for Anthropic API calls.

Part 1: Create src/utils/rate-limiter.js with RateLimiter class:

Requirements:
1. Constructor takes options: requestsPerMinute (50), tokensPerMinute (40000), tokensPerDay (1000000)
2. Maintain three token buckets: requests, tokens/min, tokens/day
3. Implement refillBuckets() method:
   - Calculate time elapsed since last refill
   - Add tokens proportional to elapsed time
   - Cap at maximum values
4. Implement canProceed(estimatedTokens) method:
   - Call refillBuckets()
   - Check if all buckets have sufficient capacity
5. Implement acquire(estimatedTokens) method:
   - If canProceed(), immediately deduct and return
   - Otherwise, add to queue and return Promise
   - Queue items have 5 minute timeout
6. Implement processQueue() method:
   - Check queue items against current capacity
   - Resolve as many as possible
   - Schedule next check if queue still has items
7. Implement updateUsage(actualTokens, estimatedTokens):
   - Adjust buckets based on actual vs estimated
   - Trigger processQueue()
8. Implement getStats() for monitoring
9. Track statistics: totalRequests, throttledRequests, rejectedRequests

Part 2: Integrate with ClaudeApiAgent:

Requirements:
1. Create shared global rate limiter instance
2. In review() method, before API call:
   - Estimate tokens with estimateTokens()
   - Call await rateLimiter.acquire(estimatedTokens)
3. After API call:
   - Get actual tokens from response.usage.input_tokens
   - Call rateLimiter.updateUsage(actualTokens, estimatedTokens)
4. Handle 429 errors with exponential backoff:
   - Wait 1s, 2s, 4s, 8s for retries
   - Max 3 retries before failing

Part 3: Add CLI monitoring:
1. In src/cli.js, add displayRateLimitStats() function
2. Show stats at end of review: total requests, throttled, rejected, queue length
3. Add --show-rate-limits flag to display during execution

Use Anthropic's documented rate limits as defaults: https://docs.anthropic.com/en/api/rate-limits
```

---

## Parallel Execution: Conflict Prevention

### Overview

Parallel execution introduces the risk of conflicts when multiple agents attempt to modify the same files simultaneously. Review agents are safe (read-only), but fix agents need conflict prevention.

### Strategy 1: File-Level Locking (Recommended)

**Impact**: Prevents write-write conflicts
**Effort**: Medium
**Files**: `src/utils/file-lock-manager.js`, `src/fixer/fix-orchestrator.js`

#### Requirements

- Implement file-based locking mechanism using lock files on disk
- Create lock directory (`.cab-killer-locks/`) for lock files
- Acquire locks before modifying files, release after completion
- Support atomic multi-file locking for fixes affecting multiple files
- Detect and remove stale locks (>5 minutes old)
- Implement timeout and retry logic for lock acquisition
- Add CLI flags: `--parallel`, `--max-concurrent`, `--no-locking`

#### LLM Implementation Prompt

```
Create file locking system to prevent conflicts in parallel fix execution.

Part 1: Create src/utils/file-lock-manager.js with FileLockManager class:

Requirements:
1. Constructor takes lockDir (default: '.cab-killer-locks')
2. init() method creates lock directory
3. getLockPath(filePath) converts file path to lock file name
4. acquireLock(filePath, options) method:
   - Check if lock file exists using fileExists() from repo-rules-loader.js
   - If not, create lock file with JSON: {agentId, acquiredAt, file}
   - Use flag: 'wx' to fail if file exists (atomic)
   - If exists, check age - steal if >5 minutes old
   - Retry with timeout (default 30s) and interval (100ms)
   - Return true if acquired, false if timeout
5. acquireLocks(filePaths, options) for multi-file locking:
   - Acquire locks sequentially
   - If any fails, release all acquired locks
   - Return true only if all acquired
6. releaseLock(filePath) deletes lock file
7. releaseAll() releases all held locks
8. cleanup() removes lock directory

Part 2: Integrate with FixOrchestrator:

Requirements:
1. Add FileLockManager instance in constructor
2. Add enableLocking option (default: true)
3. Create spawnAgentWithLocking(prompt, agentId) method:
   - Call lockManager.acquireLocks(prompt.affectedFiles)
   - If acquired, call spawnAgent(prompt) in try-finally
   - Always release locks in finally block
4. Create applyFixesParallel(prompts, options) method:
   - Limit concurrent operations (maxConcurrent: 5)
   - Use Set to track in-progress operations
   - For each prompt, call spawnAgentWithLocking()
   - Wait when at max concurrent
5. Update CLI to add:
   - .option('--parallel', 'Apply fixes in parallel with locking')
   - .option('--max-concurrent <n>', 'Max parallel operations', '5')
   - .option('--no-locking', 'Disable locking (unsafe)')

Handle lock acquisition failures gracefully by reporting them in results.
```

---

### Strategy 2: Dependency Graph (Advanced Alternative)

**Impact**: Optimal execution order without locking overhead
**Effort**: High
**Files**: `src/utils/fix-dependency-graph.js`, `src/fixer/fix-orchestrator.js`

#### Requirements

- Build directed graph of fix dependencies based on file overlaps
- Implement topological sort to find execution order
- Group fixes into batches that can safely run in parallel
- Each batch waits for previous batch to complete
- Provide statistics on parallelization efficiency (speedup factor)

#### LLM Implementation Prompt

```
Create dependency-aware batching for fix execution without locking.

Part 1: Create src/utils/fix-dependency-graph.js with FixDependencyGraph class:

Requirements:
1. Constructor takes array of fixes
2. buildGraph() method:
   - Map each file to list of fixes that affect it
   - For each fix, find dependencies: earlier fixes affecting same files
   - Return Map of fixId -> [dependencyIds]
3. getParallelBatches() method:
   - Use topological sort with level assignment
   - Calculate in-degree for each fix
   - Extract fixes with in-degree 0 as first batch
   - Mark completed and reduce in-degree for dependents
   - Repeat until all fixes assigned to batches
   - Return array of batches: [[fix1, fix2], [fix3], ...]
4. getExecutionPlan() method:
   - Call getParallelBatches()
   - Calculate stats: batchCount, maxParallelism, avgParallelism, speedup
   - Return execution plan with metadata

Part 2: Integrate with FixOrchestrator:

Requirements:
1. Create applyFixesWithDependencies(prompts) method:
   - Create FixDependencyGraph instance
   - Get execution plan
   - Log plan details if verbose
   - Execute batches sequentially
   - Within each batch, run fixes in parallel with Promise.all()
2. Update applyFixes() to use dependency graph when --optimize flag is set

This is an alternative to file locking - more complex but potentially faster.
```

---

### Strategy 3: Simple Partitioning (Simplest)

**Impact**: Safe parallelization with minimal complexity
**Effort**: Low
**Files**: `src/fixer/fix-orchestrator.js`

#### Requirements

- Group fixes by file overlap into independent partitions
- Run partitions in parallel, fixes within partition sequentially
- Use union-find or simple grouping algorithm

#### LLM Implementation Prompt

```
Add simple partitioning for parallel fix execution.

Create partitionFixesByFiles(prompts) function in src/fixer/fix-orchestrator.js:

Requirements:
1. Initialize empty groups array and fileToGroup Map
2. For each prompt:
   - Check if any affected file already in a group
   - If yes, add to that group
   - If no, create new group
   - Map all affected files to the group
3. Return array of groups (each group is array of prompts)

Create applyFixesPartitioned(prompts) method:
1. Call partitionFixesByFiles(prompts) to get groups
2. Log: "Partitioned X fixes into Y groups"
3. Use Promise.all() to process groups in parallel
4. Within each group, process fixes sequentially
5. Aggregate results from all groups

This is the simplest safe approach - fixes in different groups can't conflict.
```

---

## Summary of Expected Savings

| Optimization | Token Savings | API Call Reduction | Time Savings | Effort |
|-------------|---------------|-------------------|--------------|--------|
| Switch to API + Prompt Caching | **75-90%** on prompts (~8-10K tokens/call) | 0% | 0% | Medium |
| Cache Repository Rules | **2.4K tokens** per fix | 0% | 0% | Low |
| Use File Chunking | Enables larger reviews | 0% | 0% | Low |
| Truncate Large Files | Variable (1-50K tokens/file) | 0% | 0% | Low |
| Parallel Execution | 0 tokens | 0% | **70-85%** | Very Low |
| Batch Fixes | Minimal tokens | **60-70%** | 30-50% | Medium |
| Rate Limiting | 0 tokens | 0% | Prevents failures | Medium |

### Cost Savings Example

**Before Optimizations:**
- 100 reviews/day × 6 agents × 15K tokens = 9,000K input tokens
- 50 fixes/day × 12K tokens = 600K input tokens
- **Total: 9,600K tokens/day = $28.80/day**

**After Optimizations:**
- 100 reviews/day × 6 agents × 5K tokens (cached) = 3,000K input tokens
- 50 fixes/day × 3K tokens (cached) = 150K input tokens
- **Total: 3,150K tokens/day = $9.45/day**

**Savings: $19.35/day, $580.50/month, ~67% reduction**

---

## Implementation Priority

### Phase 1: API Foundation (Week 1)
1. Switch to Direct API (#1) - Enables all caching
2. Cache Repository Rules (#2) - Immediate savings

**Prompt for Phase 1:**
```
Implement Recommendations #1 and #2 from the improvement plan. First create ClaudeApiAgent with prompt caching support, then update FixOrchestrator to use API with cached repository rules. Test thoroughly to ensure cache hit rates are >70%.
```

### Phase 2: Scale and Performance (Week 2)
3. File Chunking (#3) - Enable large codebases
4. File Truncation (#4) - Already in #1
5. Parallel Execution (#5) - Speed improvement

**Prompt for Phase 2:**
```
Implement Recommendations #3 and #5. Add file chunking to CLI to handle large codebases, and make parallel execution the default mode. Ensure backward compatibility with --sequential flag.
```

### Phase 3: Advanced Optimization (Week 3)
6. Batch Fixes (#6) - Reduce API calls
7. Rate Limiting (#7) - Production safety

**Prompt for Phase 3:**
```
Implement Recommendations #6 and #7. Add fix batching to group similar changes, and implement comprehensive rate limiting with token bucket algorithm. Include monitoring and statistics.
```

### Phase 4: Conflict Prevention (Week 4)
8. File Locking or Dependency Graph - Safe parallel fixes

**Prompt for Phase 4:**
```
Implement parallel fix execution with conflict prevention using Strategy 1 (file-level locking). Create FileLockManager and integrate with FixOrchestrator to enable safe parallel fix application.
```

---

## Configuration Reference

All optimizations should be configurable via `config/review-config.json`:

```json
{
  "api": {
    "useDirectApi": true,
    "cacheEnabled": true
  },
  "fileProcessing": {
    "enableChunking": true,
    "chunkSize": 180000,
    "truncateLargeFiles": true,
    "maxFileTokens": 8000
  },
  "execution": {
    "parallelReviews": true,
    "parallelFixes": true,
    "maxConcurrent": 5
  },
  "batching": {
    "enabled": true,
    "batchSize": 3
  },
  "locking": {
    "enabled": true,
    "strategy": "file-lock",
    "timeout": 30000
  },
  "rateLimiting": {
    "enabled": true,
    "requestsPerMinute": 50,
    "tokensPerMinute": 40000,
    "tokensPerDay": 1000000
  }
}
```

---

## Success Criteria

- [ ] 60%+ reduction in token usage for reviews
- [ ] 50%+ reduction in token usage for fixes
- [ ] Cache hit rate >70% for repeated operations
- [ ] 3x+ speedup with parallel execution
- [ ] No increase in fix failure rate
- [ ] No API rate limit errors in production
- [ ] All existing tests pass
