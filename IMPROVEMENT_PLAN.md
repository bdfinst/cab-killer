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

## High-Impact Recommendations

### 1. Switch from Claude Code CLI to Direct API (HIGHEST IMPACT)

**Impact**: 75-90% reduction in input tokens for repeated content
**Effort**: Medium
**Files**: `src/agents/claude-code-agent.js`, `src/fixer/fix-orchestrator.js`

**Current Issue**: Claude Code CLI (`claude` command) doesn't support prompt caching, causing static content to be charged at full price on every API call.

**Solution**: Use `@anthropic-ai/sdk` directly to enable prompt caching.

#### Implementation

**Step 1: Update package.json**

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "commander": "^13.0.0",
    "glob": "^11.0.0"
  }
}
```

**Step 2: Create new API-based agent**

Create `src/agents/claude-api-agent.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk'
import { BaseReviewAgent } from './base-agent.js'
import { extractJsonFromResponse } from '../utils/json-extractor.js'
import { truncateContent, estimateTokens } from '../utils/context-window.js'

/**
 * Review agent using direct Anthropic API with prompt caching
 */
export class ClaudeApiAgent extends BaseReviewAgent {
  /**
   * @param {string} name - Agent name
   * @param {PromptLoader} promptLoader - Prompt loader instance
   */
  constructor(name, promptLoader) {
    super(name)
    this.promptLoader = promptLoader
    this.prompt = null
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  /**
   * Review files using Claude API with caching
   *
   * @param {Array<{path: string, content: string}>} files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async review(files) {
    if (!this.prompt) {
      this.prompt = await this.promptLoader.load(this.name)
    }

    // Truncate large files to save tokens
    const MAX_FILE_TOKENS = 8000 // ~2000 lines
    const processedFiles = files.map((f) => ({
      ...f,
      content: truncateContent(f.content, MAX_FILE_TOKENS),
    }))

    const filesContext = processedFiles
      .map((f) => `## File: ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n')

    // Estimate tokens for monitoring
    const promptTokens = estimateTokens(
      this.prompt.role +
        this.prompt.objective +
        this.prompt.checklist +
        this.prompt.outputFormat,
    )
    const fileTokens = estimateTokens(filesContext)

    if (process.env.VERBOSE) {
      console.log(
        `[${this.name}] Tokens - Prompt: ${promptTokens} (cached), Files: ${fileTokens}`,
      )
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system: [
        {
          type: 'text',
          text: `${this.prompt.role}

## Objective
${this.prompt.objective}

## Checklist
${this.prompt.checklist}

## Output Format
${this.prompt.outputFormat}`,
          cache_control: { type: 'ephemeral' }, // ENABLE CACHING
        },
      ],
      messages: [
        {
          role: 'user',
          content: `## Code to Review

${filesContext}

Please analyze the code above and return your review as JSON only, no other text.`,
        },
      ],
    })

    // Log cache performance
    const usage = response.usage
    if (process.env.VERBOSE) {
      console.log(
        `[${this.name}] Cache - Read: ${usage.cache_read_input_tokens || 0}, ` +
          `Created: ${usage.cache_creation_input_tokens || 0}, ` +
          `Input: ${usage.input_tokens}`,
      )
    }

    return this.parseResponse(response.content[0].text)
  }

  /**
   * Parse response into ReviewResult
   *
   * @param {string} response - Raw response
   * @returns {Object} ReviewResult
   */
  parseResponse(response) {
    const jsonStr = extractJsonFromResponse(response)

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      throw new Error(
        `Failed to parse response as JSON: ${response.slice(0, 200)}`,
      )
    }

    const issues = (parsed.issues || []).map((issue) =>
      this.createIssue({
        severity: issue.severity || 'warning',
        file: issue.file || 'unknown',
        line: issue.line || 0,
        message: issue.message || 'No message',
        suggestedFix: issue.suggestedFix || null,
      }),
    )

    return this.formatResult({
      status: parsed.status || 'pass',
      issues,
      summary: parsed.summary || 'Review complete',
    })
  }
}
```

**Step 3: Update agent registry**

Modify `src/agents/registry.js` to use new agent:

```javascript
import { ClaudeApiAgent } from './claude-api-agent.js'
import { PromptLoader } from './prompt-loader.js'

export function createAgentRegistry(options = {}) {
  const { promptsDir = './prompts' } = options
  const promptLoader = new PromptLoader(promptsDir)
  const registry = new AgentRegistry()

  // Use API-based agents for caching support
  const agentNames = [
    'test-review',
    'structure-review',
    'naming-review',
    'domain-review',
    'complexity-review',
    'claude-setup-review',
  ]

  for (const name of agentNames) {
    registry.register(name, new ClaudeApiAgent(name, promptLoader))
  }

  return registry
}
```

**Expected Savings**:
- First review call: ~11KB prompt tokens charged at full price + cache creation
- Subsequent calls (within 5 min): ~11KB prompt tokens at 90% discount
- For 10 reviews: Save ~99KB of tokens (24,750 tokens at $3/MTok = $0.074 saved)

---

### 2. Cache Repository Rules in Fix Orchestrator (HIGH IMPACT)

**Impact**: ~2,400 tokens saved per fix
**Effort**: Low
**Files**: `src/fixer/fix-orchestrator.js`

**Current Issue**: Repository rules (~9.5KB) are loaded once but formatted into every fix prompt as plain text, preventing caching.

**Solution**: Use system message caching for repository rules.

#### Implementation

Modify `src/fixer/fix-orchestrator.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk'
import {
  loadRepositoryRules,
  formatRulesForPrompt,
} from '../utils/repo-rules-loader.js'

export class FixOrchestrator {
  constructor(options = {}) {
    // ... existing options ...
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
    this.repoRules = null
    this.repoRulesFormatted = null
  }

  /**
   * Load repository rules once for reuse with caching
   */
  async loadRepoRules() {
    if (!this.repoRules) {
      const rules = await loadRepositoryRules(this.repoPath)
      this.repoRules = rules
      this.repoRulesFormatted = formatRulesForPrompt(rules)

      if (this.verbose && rules.length > 0) {
        this.reporter.log(
          `Loaded ${rules.length} repository rules file(s): ${rules.map((r) => r.filename).join(', ')}`,
        )
      }
    }
  }

  /**
   * Build system message with cacheable repository rules
   */
  buildSystemMessage() {
    const baseInstructions = `You are a code fixing agent. Your job is to apply minimal, targeted fixes to code issues while following repository conventions.

Instructions:
1. Read the affected file(s)
2. Make the minimal fix required following the repository rules and conventions
3. Do not change anything else
4. Ensure your changes follow all coding standards and conventions listed below`

    if (!this.repoRulesFormatted) {
      return [{ type: 'text', text: baseInstructions }]
    }

    // Split into cacheable rules section and dynamic instructions
    return [
      {
        type: 'text',
        text: baseInstructions,
      },
      {
        type: 'text',
        text: this.repoRulesFormatted,
        cache_control: { type: 'ephemeral' }, // CACHE RULES
      },
    ]
  }

  /**
   * Spawn an independent Claude agent to apply a fix using API
   */
  async spawnAgent(prompt) {
    if (this.dryRun) {
      this.reporter.log(`  Prompt: ${prompt.instruction.slice(0, 80)}...`)
      return { success: true, output: '[dry-run]', validationFailed: false }
    }

    const userMessage = `Fix this code issue:

**Issue:** ${prompt.instruction}
**Location:** ${prompt.context}
**Files:** ${prompt.affectedFiles.join(', ')}

Apply the fix now.`

    this.tokenTracker.addText(userMessage)

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system: this.buildSystemMessage(),
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read the contents of a file',
            input_schema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path to read' },
              },
              required: ['path'],
            },
          },
          {
            name: 'edit_file',
            description: 'Edit a file by replacing old text with new text',
            input_schema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path to edit' },
                old_text: { type: 'string', description: 'Text to replace' },
                new_text: { type: 'string', description: 'New text' },
              },
              required: ['path', 'old_text', 'new_text'],
            },
          },
        ],
      })

      // Track response tokens
      this.tokenTracker.addTokens(response.usage.output_tokens)

      // Log cache performance
      if (this.verbose) {
        const usage = response.usage
        this.reporter.log(
          `  Cache - Read: ${usage.cache_read_input_tokens || 0}, Created: ${usage.cache_creation_input_tokens || 0}`,
        )
      }

      // Process tool calls to actually apply edits
      const success = await this.processToolCalls(response, prompt)

      if (!success) {
        return {
          success: false,
          output: 'Failed to apply fix',
          validationFailed: false,
        }
      }

      // Run validation
      const validation = await this.runValidation()

      return {
        success: validation.success,
        output: validation.output,
        validationFailed: !validation.success,
        failedStep: validation.failedStep,
      }
    } catch (error) {
      return {
        success: false,
        output: `API error: ${error.message}`,
        validationFailed: false,
      }
    }
  }

  /**
   * Process tool calls from Claude's response
   */
  async processToolCalls(response, prompt) {
    // Implementation depends on how you want to handle file operations
    // This is a simplified example - you may want to use the existing
    // file manipulation tools from your codebase
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        if (block.name === 'read_file') {
          // Handle read operation
        } else if (block.name === 'edit_file') {
          // Handle edit operation
        }
      }
    }
    return true
  }
}
```

**Expected Savings**:
- First fix: ~9.5KB rules charged at full price + cache creation
- Subsequent fixes (within 5 min): ~9.5KB rules at 90% discount
- For 20 fixes: Save ~171KB of tokens (42,750 tokens at $3/MTok = $0.128 saved)

---

### 3. Use File Chunking for Large Reviews (MEDIUM-HIGH IMPACT)

**Impact**: Enables reviewing larger codebases without hitting context limits
**Effort**: Low
**Files**: `src/cli.js`

**Current Issue**: All files sent at once in a single review call, can exceed context window for large codebases.

**Solution**: Use existing `chunkFiles()` utility from `src/utils/context-window.js`.

#### Implementation

Modify `src/cli.js`:

```javascript
import { chunkFiles } from './utils/context-window.js'

/**
 * Handle the main review command with chunking support
 */
async function handleReviewCommand(targetPath, options) {
  const config = await loadConfig(options.config)
  const promptsDir = join(__dirname, '..', 'prompts')
  const registry = createAgentRegistry({ promptsDir })
  const orchestrator = new Orchestrator(registry, config)

  if (options.verbose) {
    orchestrator.setProgressCallback(({ message }) => {
      console.log(`[progress] ${message}`)
    })
  }

  const files = await loadAndValidateFiles(targetPath, options)

  if (files.length === 0) {
    console.log('No files found to review.')
    process.exit(0)
  }

  // Chunk files to fit within context window
  // Reserve space for: prompt (~3k), repo rules (~2.5k), output (~4k) = ~10k
  // With 200k context, use ~180k for files with safety margin
  const MAX_FILE_TOKENS = 180000
  const chunks = chunkFiles(files, MAX_FILE_TOKENS)

  if (chunks.length > 1) {
    console.log(
      `Reviewing ${files.length} files in ${chunks.length} chunk(s) to fit context window`,
    )
  }

  const allResults = []

  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1) {
      console.log(`\nProcessing chunk ${i + 1}/${chunks.length}...`)
    }

    const aggregated = await executeReviewMode(orchestrator, chunks[i], options)
    allResults.push(...aggregated.results)
  }

  // Aggregate all chunk results
  const finalAggregated = orchestrator.aggregateResults(allResults)
  await formatAndOutputResults(finalAggregated, options)
  await generateCorrectionPrompts(finalAggregated, options)

  process.exit(finalAggregated.overallStatus === 'fail' ? 1 : 0)
}
```

**Expected Benefits**:
- No token savings directly
- Enables reviewing codebases of any size
- Prevents context window exhaustion errors
- More predictable token usage

---

### 4. Truncate Large Files (MEDIUM IMPACT)

**Impact**: 1K-50K tokens saved per large file
**Effort**: Low
**Files**: `src/agents/claude-api-agent.js`

**Current Issue**: Very large files (10K+ lines) sent in full even when only portions are relevant.

**Solution**: Use existing `truncateContent()` utility from `src/utils/context-window.js`.

#### Implementation

Already included in the `ClaudeApiAgent` implementation above (Step 2 of Recommendation #1):

```javascript
// In review() method:
const MAX_FILE_TOKENS = 8000 // ~2000 lines

const processedFiles = files.map((f) => ({
  ...f,
  content: truncateContent(f.content, MAX_FILE_TOKENS),
}))
```

**Configuration Options**:

Add to `config/review-config.json`:

```json
{
  "fileProcessing": {
    "maxFileTokens": 8000,
    "truncationStrategy": "preserve-ends"
  },
  "agents": {
    "test-review": {
      "enabled": true,
      "maxFileTokens": 10000
    },
    "complexity-review": {
      "enabled": true,
      "maxFileTokens": 6000
    }
  }
}
```

**Expected Savings**:
- Small files (<2000 lines): No change
- Medium files (2000-5000 lines): Save 4K-12K tokens per file
- Large files (>5000 lines): Save 20K-50K+ tokens per file

---

### 5. Run Agents in Parallel by Default (MEDIUM IMPACT - TIME)

**Impact**: No token savings, but 3-6x faster reviews
**Effort**: Very Low
**Files**: `src/cli.js`

**Current Issue**: Sequential execution is default, but agents are independent and can run in parallel.

**Solution**: Change default mode to parallel.

#### Implementation

Modify `src/cli.js`:

```javascript
program
  .name('cab-killer')
  .description('Multi-agent code review system')
  .version(packageJson.version)
  .argument('[path]', 'Path to code directory to review', '.')
  .option('-a, --agent <name>', 'Run a specific agent only')
  .option('-m, --mode <mode>', 'Execution mode: single, all, loop', 'parallel') // CHANGED
  .option('--sequential', 'Run agents sequentially instead of parallel', false) // NEW
  .option('-o, --output <file>', 'Output results to file')
  // ... rest of options

async function executeReviewMode(orchestrator, files, options) {
  if (options.agent) {
    const result = await orchestrator.runSingleAgent(options.agent, files)
    return orchestrator.aggregateResults([result])
  }

  // Use sequential mode only if explicitly requested or in loop mode
  const useParallel = !options.sequential && options.mode !== 'loop'
  const mode = useParallel ? 'parallel' : options.mode || 'single'

  const handler = modeHandlers[mode] || modeHandlers.parallel
  return handler(orchestrator, files, options)
}
```

**Expected Benefits**:
- 6 agents running sequentially: ~60-90 seconds
- 6 agents running in parallel: ~15-20 seconds
- 3-6x time savings
- Same token usage

---

## Parallel Execution: Conflict Prevention Strategies

### Overview

Parallel execution introduces the risk of conflicts when multiple agents attempt to modify the same files simultaneously. This section outlines strategies to prevent conflicts while maintaining the performance benefits of parallelization.

### Conflict Scenarios

#### Review Agents (Low Risk)
Review agents are **read-only** operations that analyze code and produce reports. These can safely run in parallel with no conflict risk:
- Multiple review agents reading the same files simultaneously: **Safe**
- Review agents running while code is being edited: **Safe** (reviews work on a snapshot)

#### Fix Agents (High Risk)
Fix agents modify files and can create conflicts:
- **Write-Write Conflicts**: Two agents editing the same file
- **Read-Write Conflicts**: One agent reading while another writes
- **Sequential Dependencies**: Fix B depends on changes from Fix A

### Strategy 1: File-Level Locking (Recommended)

Implement a simple file-based locking mechanism to ensure only one agent modifies a file at a time.

#### Implementation

Create `src/utils/file-lock-manager.js`:

```javascript
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileExists } from './repo-rules-loader.js'

/**
 * Simple file-based locking for parallel fix operations
 */
export class FileLockManager {
  constructor(lockDir = '.cab-killer-locks') {
    this.lockDir = lockDir
    this.locks = new Map() // In-memory tracking
  }

  /**
   * Initialize lock directory
   */
  async init() {
    await mkdir(this.lockDir, { recursive: true })
  }

  /**
   * Get lock file path for a file
   */
  getLockPath(filePath) {
    const normalized = filePath.replace(/[/\\]/g, '_')
    return join(this.lockDir, `${normalized}.lock`)
  }

  /**
   * Acquire lock on a file with timeout and retry
   *
   * @param {string} filePath - File to lock
   * @param {Object} options
   * @param {number} options.timeout - Max time to wait in ms (default: 30000)
   * @param {number} options.retryInterval - Time between retries in ms (default: 100)
   * @param {string} options.agentId - ID of agent acquiring lock
   * @returns {Promise<boolean>} True if lock acquired
   */
  async acquireLock(filePath, options = {}) {
    const {
      timeout = 30000,
      retryInterval = 100,
      agentId = 'unknown',
    } = options

    const lockPath = this.getLockPath(filePath)
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        // Check if lock file exists
        const exists = await fileExists(lockPath)

        if (!exists) {
          // Create lock file
          await writeFile(
            lockPath,
            JSON.stringify({
              agentId,
              acquiredAt: Date.now(),
              file: filePath,
            }),
            { flag: 'wx' }, // Fail if file exists
          )

          this.locks.set(filePath, { agentId, lockPath })
          return true
        }

        // Check if lock is stale (>5 minutes old)
        try {
          const lockData = await readFile(lockPath, 'utf-8')
          const lock = JSON.parse(lockData)
          const age = Date.now() - lock.acquiredAt

          if (age > 300000) {
            // 5 minutes
            // Steal stale lock
            await this.releaseLock(filePath)
            continue
          }
        } catch {
          // Lock file corrupted, remove it
          await this.releaseLock(filePath)
          continue
        }

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryInterval))
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock acquired by another process between check and create
          await new Promise((resolve) => setTimeout(resolve, retryInterval))
          continue
        }
        throw error
      }
    }

    return false // Timeout
  }

  /**
   * Acquire locks on multiple files atomically
   *
   * @param {string[]} filePaths - Files to lock
   * @param {Object} options - Lock options
   * @returns {Promise<boolean>} True if all locks acquired
   */
  async acquireLocks(filePaths, options = {}) {
    const acquired = []

    try {
      for (const filePath of filePaths) {
        const success = await this.acquireLock(filePath, options)
        if (!success) {
          // Failed to acquire lock, release all acquired locks
          for (const acquiredPath of acquired) {
            await this.releaseLock(acquiredPath)
          }
          return false
        }
        acquired.push(filePath)
      }
      return true
    } catch (error) {
      // Release all acquired locks on error
      for (const acquiredPath of acquired) {
        await this.releaseLock(acquiredPath)
      }
      throw error
    }
  }

  /**
   * Release lock on a file
   *
   * @param {string} filePath - File to unlock
   */
  async releaseLock(filePath) {
    const lockPath = this.getLockPath(filePath)

    try {
      await unlink(lockPath)
    } catch {
      // Lock file already deleted
    }

    this.locks.delete(filePath)
  }

  /**
   * Release all locks held by this manager
   */
  async releaseAll() {
    const lockPaths = Array.from(this.locks.keys())
    await Promise.all(lockPaths.map((path) => this.releaseLock(path)))
  }

  /**
   * Cleanup lock directory
   */
  async cleanup() {
    await this.releaseAll()
    try {
      await unlink(this.lockDir)
    } catch {
      // Directory not empty or doesn't exist
    }
  }
}
```

#### Update FixOrchestrator to use locking

Modify `src/fixer/fix-orchestrator.js`:

```javascript
import { FileLockManager } from '../utils/file-lock-manager.js'

export class FixOrchestrator {
  constructor(options = {}) {
    // ... existing options ...
    this.lockManager = new FileLockManager()
    this.enableLocking = options.enableLocking !== false
  }

  /**
   * Initialize orchestrator
   */
  async init() {
    if (this.enableLocking) {
      await this.lockManager.init()
    }
  }

  /**
   * Spawn agent with file locking
   */
  async spawnAgentWithLocking(prompt, agentId) {
    if (!this.enableLocking) {
      return this.spawnAgent(prompt)
    }

    const filesToLock = prompt.affectedFiles

    // Acquire locks on all affected files
    const lockAcquired = await this.lockManager.acquireLocks(filesToLock, {
      agentId,
      timeout: 60000, // 1 minute timeout
    })

    if (!lockAcquired) {
      return {
        success: false,
        output: `Failed to acquire lock on files: ${filesToLock.join(', ')}`,
        validationFailed: false,
      }
    }

    try {
      // Apply the fix
      const result = await this.spawnAgent(prompt)
      return result
    } finally {
      // Always release locks
      for (const file of filesToLock) {
        await this.lockManager.releaseLock(file)
      }
    }
  }

  /**
   * Apply fixes in parallel with locking
   */
  async applyFixesParallel(prompts, options = {}) {
    await this.init()
    await this.loadRepoRules()

    const maxConcurrent = options.maxConcurrent || 5
    const results = []
    const inProgress = new Set()

    for (let i = 0; i < prompts.length; i++) {
      const { file, prompt } = prompts[i]

      // Wait if too many concurrent operations
      while (inProgress.size >= maxConcurrent) {
        await Promise.race(Array.from(inProgress))
      }

      // Start fix operation
      const agentId = `agent-${i + 1}`
      const promise = this.spawnAgentWithLocking(prompt, agentId)
        .then((result) => {
          results.push({ file, prompt, result })
          return result
        })
        .finally(() => {
          inProgress.delete(promise)
        })

      inProgress.add(promise)
    }

    // Wait for all remaining operations
    await Promise.all(Array.from(inProgress))

    // Cleanup
    await this.lockManager.cleanup()

    return results
  }
}
```

#### CLI Integration

Add parallel fix option to `src/cli.js`:

```javascript
program
  .command('apply-fixes')
  .description('Apply fixes from saved prompts')
  .argument('<prompts-dir>', 'Directory containing prompt JSON files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--parallel', 'Apply fixes in parallel with file locking')
  .option('--max-concurrent <n>', 'Max concurrent fix operations', '5')
  .option('--no-locking', 'Disable file locking (unsafe for parallel)')
  .action(async (promptsDir, options) => {
    const orchestrator = new FixOrchestrator({
      verbose: options.verbose,
      enableLocking: options.locking !== false,
    })

    if (options.parallel) {
      const prompts = await orchestrator.loadPrompts(promptsDir)
      const results = await orchestrator.applyFixesParallel(prompts, {
        maxConcurrent: parseInt(options.maxConcurrent, 10),
      })
      // ... process results
    } else {
      // Sequential mode (existing implementation)
      await orchestrator.applyFixes(promptsDir)
    }
  })
```

**Benefits**:
- Prevents write-write conflicts
- Allows maximum parallelization
- Simple file-based implementation
- No external dependencies
- Automatic stale lock detection

**Trade-offs**:
- Small overhead for lock management
- May reduce parallelization if many fixes target same files

---

### Strategy 2: Dependency Graph (Advanced)

For more sophisticated conflict prevention, build a dependency graph of fixes based on file overlap.

#### Implementation

Create `src/utils/fix-dependency-graph.js`:

```javascript
/**
 * Build a dependency graph for fixes to enable safe parallelization
 */
export class FixDependencyGraph {
  constructor(fixes) {
    this.fixes = fixes
    this.graph = this.buildGraph()
  }

  /**
   * Build dependency graph based on file overlaps
   */
  buildGraph() {
    const graph = new Map()
    const fileToFixes = new Map()

    // Map files to fixes that affect them
    for (let i = 0; i < this.fixes.length; i++) {
      const fix = this.fixes[i]
      for (const file of fix.prompt.affectedFiles) {
        if (!fileToFixes.has(file)) {
          fileToFixes.set(file, [])
        }
        fileToFixes.get(file).push(i)
      }
    }

    // Build dependency edges
    for (let i = 0; i < this.fixes.length; i++) {
      const dependencies = new Set()
      const fix = this.fixes[i]

      for (const file of fix.prompt.affectedFiles) {
        const conflictingFixes = fileToFixes.get(file)
        for (const otherId of conflictingFixes) {
          if (otherId < i) {
            // Depend on earlier fixes that touch same files
            dependencies.add(otherId)
          }
        }
      }

      graph.set(i, Array.from(dependencies))
    }

    return graph
  }

  /**
   * Get independent batches of fixes that can run in parallel
   * Uses topological sort with level assignment
   */
  getParallelBatches() {
    const batches = []
    const completed = new Set()
    const inDegree = new Map()

    // Calculate in-degree for each fix
    for (let i = 0; i < this.fixes.length; i++) {
      inDegree.set(i, 0)
    }

    for (const [node, dependencies] of this.graph) {
      for (const dep of dependencies) {
        inDegree.set(node, inDegree.get(node) + 1)
      }
    }

    // Process fixes in levels (batches)
    while (completed.size < this.fixes.length) {
      const batch = []

      // Find all fixes with no remaining dependencies
      for (let i = 0; i < this.fixes.length; i++) {
        if (!completed.has(i) && inDegree.get(i) === 0) {
          batch.push(i)
        }
      }

      if (batch.length === 0) {
        throw new Error('Circular dependency detected in fix graph')
      }

      // Mark batch as completed and reduce in-degree for dependents
      for (const fixId of batch) {
        completed.add(fixId)

        // Find fixes that depend on this one
        for (const [node, dependencies] of this.graph) {
          if (dependencies.includes(fixId)) {
            inDegree.set(node, inDegree.get(node) - 1)
          }
        }
      }

      batches.push(batch.map((id) => this.fixes[id]))
    }

    return batches
  }

  /**
   * Get execution plan with parallelization stats
   */
  getExecutionPlan() {
    const batches = this.getParallelBatches()

    return {
      batches,
      totalFixes: this.fixes.length,
      batchCount: batches.length,
      maxParallelism: Math.max(...batches.map((b) => b.length)),
      avgParallelism: batches.reduce((sum, b) => sum + b.length, 0) / batches.length,
      sequentialTime: this.fixes.length, // Normalized to 1 unit per fix
      parallelTime: batches.length, // Assuming 1 unit per batch
      speedup: this.fixes.length / batches.length,
    }
  }
}
```

#### Update FixOrchestrator to use dependency graph

```javascript
import { FixDependencyGraph } from '../utils/fix-dependency-graph.js'

export class FixOrchestrator {
  /**
   * Apply fixes using dependency-aware parallel execution
   */
  async applyFixesWithDependencies(prompts, options = {}) {
    await this.loadRepoRules()

    // Build dependency graph
    const graph = new FixDependencyGraph(prompts)
    const plan = graph.getExecutionPlan()

    if (this.verbose) {
      this.reporter.log('\n--- Execution Plan ---')
      this.reporter.log(`Total fixes: ${plan.totalFixes}`)
      this.reporter.log(`Batches: ${plan.batchCount}`)
      this.reporter.log(`Max parallelism: ${plan.maxParallelism}`)
      this.reporter.log(`Expected speedup: ${plan.speedup.toFixed(1)}x`)
      this.reporter.log('----------------------\n')
    }

    let applied = 0
    let failed = 0
    const results = []

    // Execute batches sequentially, fixes within batch in parallel
    for (let i = 0; i < plan.batches.length; i++) {
      const batch = plan.batches[i]
      this.reporter.log(
        `\nBatch ${i + 1}/${plan.batches.length}: Processing ${batch.length} fixes in parallel...`,
      )

      // Run all fixes in this batch in parallel
      const batchResults = await Promise.all(
        batch.map(async ({ file, prompt }) => {
          const result = await this.spawnAgent(prompt)
          return { file, prompt, result }
        }),
      )

      // Process results
      for (const { file, prompt, result } of batchResults) {
        if (result.success) {
          applied++
          await this.markComplete(promptsDir, file)
        } else {
          failed++
        }
        results.push({ file, prompt, result })
      }
    }

    return {
      total: prompts.length,
      applied,
      failed,
      results,
      executionPlan: plan,
    }
  }
}
```

**Benefits**:
- Maximum safe parallelization
- No locking overhead
- Optimal execution order
- Provides speedup metrics

**Trade-offs**:
- More complex implementation
- Requires analyzing all fixes upfront
- May still be sequential if many fixes conflict

---

### Strategy 3: Partition by File (Simplest)

Group fixes by affected files and only parallelize independent groups.

#### Implementation

```javascript
/**
 * Partition fixes into independent groups based on file overlap
 */
function partitionFixesByFiles(prompts) {
  const groups = []
  const fileToGroup = new Map()

  for (const prompt of prompts) {
    // Check if any affected file is already in a group
    let targetGroup = null
    for (const file of prompt.prompt.affectedFiles) {
      if (fileToGroup.has(file)) {
        targetGroup = fileToGroup.get(file)
        break
      }
    }

    if (targetGroup === null) {
      // Create new group
      targetGroup = groups.length
      groups.push([])
    }

    // Add to group
    groups[targetGroup].push(prompt)

    // Map all affected files to this group
    for (const file of prompt.prompt.affectedFiles) {
      fileToGroup.set(file, targetGroup)
    }
  }

  return groups
}

// Usage in FixOrchestrator
async applyFixesPartitioned(prompts) {
  const groups = partitionFixesByFiles(prompts)

  this.reporter.log(
    `Partitioned ${prompts.length} fixes into ${groups.length} independent groups`,
  )

  const results = []

  // Process groups in parallel
  const groupResults = await Promise.all(
    groups.map(async (group, idx) => {
      this.reporter.log(`Group ${idx + 1}: ${group.length} fixes`)
      return this.applyFixesSequential(group)
    }),
  )

  // Aggregate results
  for (const groupResult of groupResults) {
    results.push(...groupResult.results)
  }

  return results
}
```

**Benefits**:
- Very simple to implement
- No locking needed
- Safe by construction

**Trade-offs**:
- May not achieve optimal parallelization
- Conservative (groups may be larger than necessary)

---

### Recommended Approach

**For most cases**: Use **Strategy 1 (File-Level Locking)** with parallel execution
- Simple to implement
- Maximum parallelization
- Safe and proven approach

**For advanced optimization**: Use **Strategy 2 (Dependency Graph)**
- Best performance for complex fix sets
- Optimal execution ordering
- Provides insights into fix dependencies

**For quick implementation**: Use **Strategy 3 (Partition by File)**
- Minimal code changes
- Good enough for most scenarios
- Easy to understand and debug

---

### Configuration

Add to `config/review-config.json`:

```json
{
  "parallelExecution": {
    "enabled": true,
    "strategy": "locking",
    "maxConcurrent": 5,
    "lockTimeout": 60000,
    "reviewAgents": {
      "parallel": true
    },
    "fixAgents": {
      "parallel": true,
      "conflictStrategy": "locking"
    }
  }
}
```

---

### 6. Batch Similar Fixes (LOW-MEDIUM IMPACT)

**Impact**: 30-50% fewer API calls for fix application
**Effort**: Medium
**Files**: `src/fixer/fix-orchestrator.js`

**Current Issue**: One Claude agent spawned per fix, causing overhead from separate API calls.

**Solution**: Batch 3-5 similar fixes into single API calls.

#### Implementation

Add to `src/fixer/fix-orchestrator.js`:

```javascript
/**
 * Group fixes by category and batch them
 */
groupFixesByCategory(prompts) {
  const MAX_BATCH_SIZE = 3 // Don't overwhelm with too many fixes
  const batches = []
  const grouped = {}

  // Group by category
  for (const { file, prompt } of prompts) {
    const key = prompt.category
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push({ file, prompt })
  }

  // Split into batches of MAX_BATCH_SIZE
  for (const category in grouped) {
    const categoryPrompts = grouped[category]
    for (let i = 0; i < categoryPrompts.length; i += MAX_BATCH_SIZE) {
      batches.push({
        category,
        items: categoryPrompts.slice(i, i + MAX_BATCH_SIZE),
      })
    }
  }

  return batches
}

/**
 * Apply a batch of related fixes in one API call
 */
async applyBatchOfFixes(batch) {
  const fixInstructions = batch.items
    .map(
      (item, idx) => `${idx + 1}. **${item.prompt.instruction}**
   Location: ${item.prompt.context}
   Files: ${item.prompt.affectedFiles.join(', ')}`,
    )
    .join('\n\n')

  const userMessage = `Apply these ${batch.items.length} related fixes from the ${batch.category} category:

${fixInstructions}

Apply each fix in order, making minimal targeted changes.`

  try {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8000, // More tokens for multiple fixes
      system: this.buildSystemMessage(),
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      tools: [
        /* read_file, edit_file tools */
      ],
    })

    // Process all tool calls for the batch
    const success = await this.processToolCalls(response, batch.items)

    if (success) {
      const validation = await this.runValidation()
      return {
        success: validation.success,
        validationFailed: !validation.success,
        failedStep: validation.failedStep,
      }
    }

    return { success: false, validationFailed: false }
  } catch (error) {
    return { success: false, validationFailed: false, error: error.message }
  }
}

/**
 * Apply fixes with optional batching
 */
async applyFixes(promptsDir, options = {}) {
  const useBatching = options.batch !== false

  await this.loadRepoRules()
  const prompts = await this.loadPrompts(promptsDir)

  if (useBatching && prompts.length > 3) {
    this.reporter.log(`Using batched mode for ${prompts.length} fixes`)
    return this.applyFixesBatched(prompts)
  }

  // Original sequential mode
  return this.applyFixesSequential(prompts)
}

async applyFixesBatched(prompts) {
  const batches = this.groupFixesByCategory(prompts)
  this.reporter.log(
    `Grouped ${prompts.length} fixes into ${batches.length} batches`,
  )

  let applied = 0
  let failed = 0
  const appliedItems = []
  const failedItems = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    this.reporter.log(
      `\n[${i + 1}/${batches.length}] Processing batch: ${batch.category} (${batch.items.length} fixes)`,
    )

    const result = await this.applyBatchOfFixes(batch)

    if (result.success) {
      applied += batch.items.length
      appliedItems.push(
        ...batch.items.map((item) => ({
          file: item.file,
          category: item.prompt.category,
          instruction: item.prompt.instruction,
        })),
      )

      // Mark all as complete
      for (const item of batch.items) {
        await this.markComplete(dirname(item.file), basename(item.file))
      }
    } else {
      failed += batch.items.length
      failedItems.push(
        ...batch.items.map((item) => ({
          file: item.file,
          reason: result.error || 'Batch application failed',
        })),
      )
    }
  }

  return {
    total: prompts.length,
    applied,
    failed,
    appliedItems,
    failedItems,
  }
}
```

**Configuration**:

Add to CLI:

```javascript
program
  .command('apply-fixes')
  .description('Apply fixes from saved prompts using independent Claude agents')
  .argument('<prompts-dir>', 'Directory containing prompt JSON files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--batch', 'Batch similar fixes together (default: true)', true)
  .option('--no-batch', 'Apply fixes one at a time')
  .option('--batch-size <n>', 'Maximum fixes per batch', '3')
  // ... other options
```

**Expected Savings**:
- 20 fixes without batching: 20 API calls
- 20 fixes with batching (3 per batch): ~7 API calls
- 65% fewer API calls
- Reduced overhead and latency

---

## Summary of Expected Savings

| Optimization | Token Savings | API Call Reduction | Time Savings | Implementation Effort |
|-------------|---------------|-------------------|--------------|---------------------|
| Switch to API + Prompt Caching | **75-90%** on prompts (~8-10K tokens/call) | 0% | 0% | Medium |
| Cache Repository Rules | **2.4K tokens** per fix | 0% | 0% | Low |
| Use File Chunking | Enables larger reviews | 0% | 0% | Low |
| Truncate Large Files | Variable (1-50K tokens/file) | 0% | 0% | Low |
| Parallel Execution | 0 tokens | 0% | **70-85%** | Very Low |
| Batch Fixes | Minimal | **60-70%** | 30-50% | Medium |

### Cost Savings Example

Assuming:
- 100 reviews per day
- Average 6 agents per review
- Average 50KB file content per review
- 50 fixes applied per day

**Before Optimizations:**
- Review tokens: 600 calls × 15K avg = 9,000K input tokens
- Fix tokens: 50 calls × 12K avg = 600K input tokens
- Total: 9,600K tokens/day
- Cost: $28.80/day at $3/MTok input

**After Optimizations:**
- Review tokens: 600 calls × 5K avg (caching) = 3,000K input tokens
- Fix tokens: 50 calls × 3K avg (caching) = 150K input tokens
- Total: 3,150K tokens/day
- Cost: $9.45/day at $3/MTok input

**Savings: $19.35/day, $580.50/month, ~67% reduction**

---

## Implementation Priority

### Phase 1: Foundation (Week 1)

1. **Add Anthropic SDK dependency**
   - Update package.json
   - Run `npm install @anthropic-ai/sdk`
   - Set ANTHROPIC_API_KEY environment variable

2. **Create ClaudeApiAgent**
   - Implement `src/agents/claude-api-agent.js`
   - Add prompt caching support
   - Add truncation support

3. **Update AgentRegistry**
   - Modify `src/agents/registry.js`
   - Switch to ClaudeApiAgent

**Expected Outcome**: 75-90% token savings on reviews

### Phase 2: Fix Optimization (Week 2)

4. **Update FixOrchestrator to use API**
   - Modify `src/fixer/fix-orchestrator.js`
   - Add cache support for repository rules
   - Implement tool call processing

5. **Add File Chunking**
   - Modify `src/cli.js`
   - Use existing `chunkFiles()` utility

**Expected Outcome**: 70% token savings on fixes + handle larger codebases

### Phase 3: Performance (Week 3)

6. **Enable Parallel Execution**
   - Update CLI defaults in `src/cli.js`
   - Make parallel the default mode

7. **Add Batching Support**
   - Implement batch processing in FixOrchestrator
   - Add CLI flags for batch control

**Expected Outcome**: 3-6x faster reviews, 60% fewer API calls for fixes

### Phase 4: Polish (Week 4)

8. **Add Configuration Options**
   - Update `config/review-config.json` schema
   - Support per-agent token limits
   - Add batch size configuration

9. **Improve Monitoring**
   - Add cache hit/miss tracking
   - Add token usage reporting
   - Add cost estimation

10. **Documentation**
    - Update README with new features
    - Document cache behavior
    - Add cost optimization guide

---

## Testing Strategy

### Unit Tests

1. Test `ClaudeApiAgent.review()` with mocked API responses
2. Test cache control header generation
3. Test file truncation edge cases
4. Test batch grouping logic

### Integration Tests

1. Test full review cycle with API caching
2. Test fix application with repository rules caching
3. Test chunking with large file sets
4. Test parallel execution vs sequential

### Performance Tests

1. Measure token usage before/after optimizations
2. Measure API call counts before/after batching
3. Measure review time with parallel vs sequential
4. Measure cache hit rates over time

---

## Monitoring and Metrics

### Key Metrics to Track

1. **Token Usage**
   - Input tokens per review
   - Input tokens per fix
   - Cache hit rate
   - Cache creation tokens vs cached tokens

2. **API Calls**
   - Number of API calls per review
   - Number of API calls per fix
   - Batch efficiency (fixes per call)

3. **Performance**
   - Average review time
   - Average fix application time
   - Parallel speedup factor

4. **Cost**
   - Daily token cost
   - Cost per review
   - Cost per fix

### Implementation

Add to `src/utils/metrics-tracker.js`:

```javascript
export class MetricsTracker {
  constructor() {
    this.metrics = {
      apiCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      startTime: Date.now(),
    }
  }

  recordApiCall(usage) {
    this.metrics.apiCalls++
    this.metrics.inputTokens += usage.input_tokens || 0
    this.metrics.outputTokens += usage.output_tokens || 0
    this.metrics.cacheCreationTokens += usage.cache_creation_input_tokens || 0
    this.metrics.cacheReadTokens += usage.cache_read_input_tokens || 0
  }

  getCacheHitRate() {
    const total = this.metrics.cacheCreationTokens + this.metrics.cacheReadTokens
    if (total === 0) {
      return 0
    }
    return (this.metrics.cacheReadTokens / total) * 100
  }

  getCostEstimate() {
    const inputCost =
      (this.metrics.inputTokens / 1_000_000) * 3.0 + // Regular input
      (this.metrics.cacheCreationTokens / 1_000_000) * 3.75 + // Cache writes
      (this.metrics.cacheReadTokens / 1_000_000) * 0.3 // Cache reads

    const outputCost = (this.metrics.outputTokens / 1_000_000) * 15.0

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    }
  }

  getSummary() {
    return {
      ...this.metrics,
      duration: Date.now() - this.metrics.startTime,
      cacheHitRate: this.getCacheHitRate(),
      cost: this.getCostEstimate(),
    }
  }
}
```

---

## Migration Path

### Backward Compatibility

Keep `ClaudeCodeAgent` for users who prefer CLI:

```javascript
// src/agents/registry.js
export function createAgentRegistry(options = {}) {
  const { promptsDir = './prompts', useApi = true } = options
  const promptLoader = new PromptLoader(promptsDir)
  const registry = new AgentRegistry()

  const AgentClass = useApi ? ClaudeApiAgent : ClaudeCodeAgent
  const agentNames = [
    'test-review',
    'structure-review',
    'naming-review',
    'domain-review',
    'complexity-review',
    'claude-setup-review',
  ]

  for (const name of agentNames) {
    registry.register(name, new AgentClass(name, promptLoader))
  }

  return registry
}
```

Add CLI flag:

```javascript
program.option('--use-cli', 'Use Claude CLI instead of API (disables caching)')
```

### Environment Variables

```bash
# Required for API mode
ANTHROPIC_API_KEY=sk-ant-...

# Optional configuration
CAB_KILLER_USE_API=true  # Default: true
CAB_KILLER_CACHE_ENABLED=true  # Default: true
CAB_KILLER_MAX_FILE_TOKENS=8000  # Default: 8000
CAB_KILLER_BATCH_SIZE=3  # Default: 3
```

---

## Risks and Mitigation

### Risk 1: API Rate Limits

**Risk**: Parallel execution may hit rate limits
**Mitigation**: Add exponential backoff and retry logic

```javascript
async function callApiWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}
```

### Risk 2: Cache Misses

**Risk**: Cache expires between calls, losing savings
**Mitigation**:
- Keep cache duration in mind (5 minutes)
- Process files in batches within cache window
- Monitor cache hit rates

### Risk 3: Truncation Loses Context

**Risk**: Truncating large files may miss important context
**Mitigation**:
- Make truncation limits configurable per agent
- Add option to disable truncation
- Log when truncation occurs

### Risk 4: Batch Failures

**Risk**: One failure in a batch fails all fixes
**Mitigation**:
- Limit batch size to 3-5 fixes
- Add granular error handling
- Fall back to sequential on batch failure

---

## Success Criteria

### Must Have
- [ ] 60%+ reduction in token usage for reviews
- [ ] 50%+ reduction in token usage for fixes
- [ ] No regression in fix success rate
- [ ] All existing tests pass

### Should Have
- [ ] 3x+ speedup with parallel execution
- [ ] Cache hit rate >70% for repeated operations
- [ ] 50%+ reduction in API calls with batching
- [ ] Cost tracking and reporting

### Nice to Have
- [ ] Configurable token limits per agent
- [ ] Automatic cost optimization suggestions
- [ ] Dashboard for token usage trends
- [ ] A/B testing framework for optimizations

---

## Future Optimizations

### Advanced Caching Strategies

1. **Persistent Cache**: Store prompt embeddings locally
2. **Shared Cache**: Share cache across team members
3. **Smart Cache Invalidation**: Only refresh changed rule sections

### Intelligent File Selection

1. **Relevance Scoring**: Only review files likely to have issues
2. **Differential Reviews**: Only review changed functions/classes
3. **Dependency-Aware Chunking**: Group related files together

### Model Optimization

1. **Use Haiku for Simple Fixes**: 5x cheaper for straightforward changes
2. **Use Opus for Complex Reviews**: Better quality for critical code
3. **Adaptive Model Selection**: Choose model based on complexity

---

## Appendix: Token Usage Reference

### Anthropic Pricing (2024)

| Model | Input | Cache Write | Cache Read | Output |
|-------|-------|-------------|------------|--------|
| Sonnet 4.5 | $3/MTok | $3.75/MTok | $0.30/MTok | $15/MTok |
| Haiku 3.5 | $1/MTok | $1.25/MTok | $0.10/MTok | $5/MTok |
| Opus 4 | $15/MTok | $18.75/MTok | $1.50/MTok | $75/MTok |

### Token Estimation

- 1 token ≈ 4 characters
- 1 token ≈ 0.75 words
- 1K tokens ≈ 750 words ≈ 1.5 pages of text
- 100K tokens ≈ 75K words ≈ 300 pages

### Cache Behavior

- **Cache Duration**: 5 minutes
- **Minimum Cache Size**: 1024 tokens (2048 for Claude 3.5 Sonnet)
- **Cache Discount**: 90% off input tokens
- **Cache Locations**: End of system message blocks
