import { readFile, readdir, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import {
  loadRepositoryRules,
  formatRulesForPrompt,
} from '../utils/repo-rules-loader.js'
import { runTests, runBuild, runLint } from '../utils/test-runner.js'
import { TokenTracker } from '../utils/token-tracker.js'
import { SDKClient } from '../sdk/index.js'

const MAX_ERROR_MESSAGE_LENGTH = 200
const MAX_REPORT_INSTRUCTION_LENGTH = 100
const DEFAULT_MAX_BUDGET_USD = 10.0 // USD

/**
 * Orchestrates applying fixes using Claude Agent SDK
 */
export class FixOrchestrator {
  constructor(options = {}) {
    // Validation flags
    this.runTests = options.runTests !== false
    this.runBuild = options.runBuild !== false
    this.runLint = options.runLint !== false

    // Display flags
    this.verbose = options.verbose || false
    this.showProgress = options.showProgress !== false
    this.dryRun = options.dryRun || false

    // Paths and reporter
    this.repoPath = options.repoPath || process.cwd()
    this.reporter = options.reporter || {
      log: (msg) => console.log(msg),
      write: (msg) => process.stdout.write(msg),
    }

    // Internal state
    this.repoRulesPromptText = null
    this.startTime = null
    this.tokenTracker = new TokenTracker({
      maxBudget: options.maxBudget || DEFAULT_MAX_BUDGET_USD,
      maxTokens: 200000,
      verbose: this.verbose,
      reporter: this.reporter,
    })

    // SDK client
    this.sdkClient = options.sdkClient || new SDKClient({
      model: options.model || 'claude-sonnet-4-5',
      workingDirectory: this.repoPath,
    })
  }

  log(message) {
    if (this.verbose) {
      this.reporter.log(message)
    }
  }

  /**
   * Extract a meaningful error message from Claude output
   *
   * @param {string} output - Raw output from Claude
   * @returns {string} Extracted error message
   */
  extractErrorMessage(output) {
    if (!output || output.trim() === '') {
      return 'No output received from Claude agent'
    }

    // Combined pattern for common errors
    const errorPattern = /error:\s*.+|failed:\s*.+|cannot\s+.+|unable to\s+.+|permission denied|file not found|no such file/i
    const match = output.match(errorPattern)
    if (match) {
      return match[0].slice(0, MAX_ERROR_MESSAGE_LENGTH)
    }

    // Fallback: first meaningful line
    const firstLine = output.trim().split('\n').find((l) => l.trim())
    if (firstLine) {
      return firstLine.length > MAX_ERROR_MESSAGE_LENGTH ? firstLine.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3) + '...' : firstLine
    }

    return 'Unknown error'
  }

  /**
   * Load all prompt files from a directory (excludes completed/ subdirectory)
   *
   * @param {string} dir - Directory containing prompt JSON files
   * @returns {Promise<Array<{file: string, prompt: Object}>>}
   */
  async loadPrompts(dir) {
    const files = await readdir(dir)
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort()

    const prompts = []
    for (const file of jsonFiles) {
      const content = await readFile(join(dir, file), 'utf-8')
      prompts.push({
        file,
        prompt: JSON.parse(content),
      })
    }

    return prompts
  }

  /**
   * Mark a prompt as complete by moving it to the completed/ subdirectory
   *
   * @param {string} promptsDir - Base prompts directory
   * @param {string} file - Prompt filename
   */
  async markComplete(promptsDir, file) {
    const completedDir = join(promptsDir, 'completed')
    await mkdir(completedDir, { recursive: true })
    await rename(join(promptsDir, file), join(completedDir, file))
  }

  /**
   * Load repository rules once for reuse
   *
   * @returns {Promise<void>}
   */
  async loadRepoRules() {
    if (!this.repoRulesPromptText) {
      const rules = await loadRepositoryRules(this.repoPath)
      this.repoRulesPromptText = formatRulesForPrompt(rules)
      if (this.verbose && rules.length > 0) {
        this.reporter.log(
          `Loaded ${rules.length} repository rules file(s): ${rules.map((r) => r.filename).join(', ')}`,
        )
      }
    }
  }

  /**
   * Build a prompt string for Claude to fix an issue
   *
   * @param {Object} prompt - CorrectionPrompt object
   * @returns {string}
   */
  buildFixPrompt(prompt) {
    let fixPrompt = `Fix this code issue:

**Issue:** ${prompt.instruction}
**Location:** ${prompt.context}
**Files:** ${prompt.affectedFiles.join(', ')}`

    if (this.repoRulesPromptText) {
      fixPrompt += `\n${this.repoRulesPromptText}`
    }

    fixPrompt += `

Instructions:
1. Read the affected file(s)
2. Make the minimal fix required following the repository rules and conventions
3. Do not change anything else
4. Ensure your changes follow all coding standards and conventions listed above

Apply the fix now.`

    // Note: Token usage is now tracked via SDK usage stats in spawnAgent
    return fixPrompt
  }

  /**
   * Validation step definitions
   */
  getValidationSteps() {
    return [
      { name: 'lint', enabled: this.runLint, runner: runLint, timeout: 60000 },
      { name: 'build', enabled: this.runBuild, runner: runBuild, timeout: 120000 },
      { name: 'tests', enabled: this.runTests, runner: runTests, timeout: 180000 },
    ]
  }

  /**
   * Run validation checks (lint, build, tests) after a fix
   *
   * @returns {Promise<{success: boolean, output: string, failedStep: string|null}>}
   */
  async runValidation() {
    const results = { success: true, output: '', failedStep: null }

    for (const step of this.getValidationSteps()) {
      if (!step.enabled) {
        continue
      }

      this.log(`  Running ${step.name}...`)
      const stepResult = await step.runner(this.repoPath, { timeout: step.timeout })
      results.output += `\n${step.name}: ${stepResult.success ? 'PASS' : 'FAIL'}\n${stepResult.output}`

      if (!stepResult.success) {
        results.success = false
        results.failedStep = step.name
        return results
      }
    }

    return results
  }

  /**
   * Apply a fix using Claude Agent SDK
   *
   * @param {Object} prompt - CorrectionPrompt object
   * @returns {Promise<{success: boolean, output: string, validationFailed: boolean}>}
   */
  async spawnAgent(prompt) {
    const fixPrompt = this.buildFixPrompt(prompt)

    if (this.dryRun) {
      this.reporter.log(`  Prompt: ${prompt.instruction.slice(0, 80)}...`)
      return { success: true, output: '[dry-run]', validationFailed: false }
    }

    try {
      const { result = '', usage } = await this.sdkClient.chat(fixPrompt, {
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
        permissionMode: 'acceptEdits',
      })

      // Track usage from SDK
      if (usage) {
        this.tokenTracker.addUsage(usage)
      }

      if (this.verbose && result) {
        this.reporter.log(result)
      }

      // Fix was applied, now run validation
      const validation = await this.runValidation()

      return {
        success: validation.success,
        output: (result || '') + validation.output,
        validationFailed: !validation.success,
        failedStep: validation.failedStep,
      }
    } catch (err) {
      return {
        success: false,
        output: `SDK error: ${err.message}`,
        validationFailed: false,
      }
    }
  }

  /**
   * Format elapsed time
   *
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted time
   */
  formatElapsedTime(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Display progress information
   *
   * @param {number} current - Current item number (1-indexed)
   * @param {number} total - Total items
   */
  displayProgress(current, total) {
    if (!this.showProgress) {
      return
    }

    const elapsed = Date.now() - this.startTime
    const avgTime = elapsed / current
    const remaining = avgTime * (total - current)
    const percentage = ((current / total) * 100).toFixed(1)

    this.reporter.log(
      `  Progress: ${current}/${total} (${percentage}%) | ` +
        `Elapsed: ${this.formatElapsedTime(elapsed)} | ` +
        `ETA: ${this.formatElapsedTime(remaining)}`,
    )

    // Display token usage
    if (this.tokenTracker) {
      this.reporter.log(`  ${this.tokenTracker.formatProgressBar(30)}`)
    }
  }

  /**
   * Process a single prompt and categorize the result
   *
   * @param {string} file - Prompt filename
   * @param {Object} prompt - Prompt object
   * @param {string} promptsDir - Base prompts directory
   * @returns {Promise<{status: 'applied'|'validationFailed'|'failed', item: Object}>}
   */
  async processPrompt(file, prompt, promptsDir) {
    // Log prompt details (moved from applyFixes loop)
    this.reporter.log(`  Priority: ${prompt.priority}`)
    this.reporter.log(`  Category: ${prompt.category}`)
    this.reporter.log(`  Files: ${prompt.affectedFiles.join(', ')}`)

    const baseItem = {
      file,
      category: prompt.category,
      instruction: prompt.instruction,
      affectedFiles: prompt.affectedFiles,
    }

    const result = await this.spawnAgent(prompt)

    if (result.success) {
      this.reporter.log(`  Status: Applied & Validated`)
      if (!this.dryRun) {
        await this.markComplete(promptsDir, file)
      }
      return { status: 'applied', item: baseItem }
    }

    const errorMsg = this.extractErrorMessage(result.output)

    if (result.validationFailed) {
      this.reporter.log(`  Status: Applied but validation failed`)
      this.reporter.log(`  Failed step: ${result.failedStep}`)
      this.reporter.log(`  Details: ${errorMsg}`)
      return {
        status: 'validationFailed',
        item: { ...baseItem, failedStep: result.failedStep, reason: errorMsg },
      }
    }

    this.reporter.log(`  Status: Failed`)
    this.reporter.log(`  Reason: ${errorMsg}`)
    return { status: 'failed', item: { ...baseItem, reason: errorMsg } }
  }

  /**
   * Build final results object from categorized items
   *
   * @param {number} total - Total prompts processed
   * @param {Object} results - Categorized results
   * @returns {Object} Final results summary
   */
  _buildApplyFixesResult(total, results) {
    return {
      total,
      applied: results.applied.length,
      failed: results.failed.length,
      validationFailed: results.validationFailed.length,
      appliedItems: results.applied,
      failedItems: results.failed,
      validationFailedItems: results.validationFailed,
      tokenUsage: this.tokenTracker.getSummary(),
      duration: Date.now() - this.startTime,
    }
  }

  /**
   * Apply all fixes from a prompts directory
   *
   * @param {string} promptsDir - Directory containing prompt JSON files
   * @returns {Promise<Object>} Results summary
   */
  async applyFixes(promptsDir) {
    this.startTime = Date.now()
    await this.loadRepoRules()

    const prompts = await this.loadPrompts(promptsDir)
    const results = { applied: [], validationFailed: [], failed: [] }

    this.reporter.log(`Found ${prompts.length} prompts in ${promptsDir}`)
    if (this.showProgress) {
      this.reporter.log(
        `Token tracking enabled (max: ${this.tokenTracker.maxTokens.toLocaleString()})`,
      )
    }

    for (let i = 0; i < prompts.length; i++) {
      const { file, prompt } = prompts[i]
      this.reporter.log(`\n[${i + 1}/${prompts.length}] ${file}`)

      const { status, item } = await this.processPrompt(file, prompt, promptsDir)
      results[status].push(item)

      this.displayProgress(i + 1, prompts.length)
    }

    return this._buildApplyFixesResult(prompts.length, results)
  }

  /**
   * Format a single report item
   *
   * @param {Object} item - Item to format
   * @param {string[]} extraFields - Additional fields to include
   * @returns {string} Formatted item
   */
  formatReportItem(item, extraFields = []) {
    const instruction = item.instruction.length > MAX_REPORT_INSTRUCTION_LENGTH
      ? item.instruction.slice(0, MAX_REPORT_INSTRUCTION_LENGTH) + '...'
      : item.instruction

    let text = `[${item.category}] ${item.file}\n`
    text += `  ${instruction}\n`
    text += `  Files: ${item.affectedFiles.join(', ')}\n`

    for (const field of extraFields) {
      if (item[field]) {
        const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
        text += `  ${label}: ${item[field]}\n`
      }
    }

    return text + '\n'
  }

  /**
   * Format a report section
   *
   * @param {string} title - Section title
   * @param {Array} items - Items to include
   * @param {string[]} extraFields - Additional fields per item
   * @returns {string} Formatted section or empty string
   */
  formatReportSection(title, items, extraFields = []) {
    if (!items || items.length === 0) {
      return ''
    }
    return `--- ${title} ---\n\n` + items.map((item) => this.formatReportItem(item, extraFields)).join('')
  }

  /**
   * Generate a summary report of applied and failed fixes
   *
   * @param {Object} result - Result from applyFixes
   * @returns {string} Formatted summary report
   */
  generateReport(result) {
    const divider = '='.repeat(60)
    let report = `\n${divider}\n  FIX SUMMARY REPORT\n${divider}\n\n`

    report += `Total: ${result.total} | Applied: ${result.applied} | Failed: ${result.failed}`
    if (result.validationFailed > 0) {
      report += ` | Validation Failed: ${result.validationFailed}`
    }
    report += '\n'

    if (result.duration) {
      report += `Duration: ${this.formatElapsedTime(result.duration)}\n`
    }
    if (result.tokenUsage) {
      report += `Token Usage: ${result.tokenUsage.current.toLocaleString()}/${result.tokenUsage.max.toLocaleString()} `
      report += `(${result.tokenUsage.percentage.toFixed(1)}%)\n`
    }

    // Add SDK comparison section if SDK data available
    if (result.tokenUsage && result.tokenUsage.inputTokens > 0) {
      report += `SDK Comparison:\n`
      report += `  Estimated tokens: ${result.tokenUsage.current.toLocaleString()}\n`
      report += `  Actual tokens: ${(result.tokenUsage.inputTokens + result.tokenUsage.outputTokens).toLocaleString()}\n`
      report += `  Actual cost: $${result.tokenUsage.costUsd.toFixed(4)}\n`
    }

    report += '\n'

    report += this.formatReportSection('APPLIED & VALIDATED', result.appliedItems)
    report += this.formatReportSection('VALIDATION FAILED', result.validationFailedItems, ['failedStep', 'reason'])
    report += this.formatReportSection('FAILED', result.failedItems, ['reason'])

    report += divider + '\n'
    return report
  }
}
