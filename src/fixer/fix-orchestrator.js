import { readFile, readdir, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  loadRepositoryRules,
  formatRulesForPrompt,
} from '../utils/repo-rules-loader.js'
import { runTests, runBuild, runLint } from '../utils/test-runner.js'
import { TokenTracker } from '../utils/token-tracker.js'

/**
 * Orchestrates applying fixes using independent Claude agents
 */
export class FixOrchestrator {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false
    this.verbose = options.verbose || false
    this.showProgress = options.showProgress !== false
    this.runTests = options.runTests !== false
    this.runBuild = options.runBuild !== false
    this.runLint = options.runLint !== false
    this.repoPath = options.repoPath || process.cwd()
    this.reporter = options.reporter || {
      log: (msg) => console.log(msg),
      write: (msg) => process.stdout.write(msg),
    }
    this.repoRules = null
    this.tokenTracker = new TokenTracker({
      maxTokens: 200000,
      verbose: this.verbose,
      reporter: this.reporter,
    })
    this.startTime = null
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

    // Look for common error patterns
    const errorPatterns = [
      /error:\s*(.+)/i,
      /failed:\s*(.+)/i,
      /cannot\s+(.+)/i,
      /unable to\s+(.+)/i,
      /permission denied/i,
      /file not found/i,
      /no such file/i,
    ]

    for (const pattern of errorPatterns) {
      const match = output.match(pattern)
      if (match) {
        return match[0].slice(0, 200)
      }
    }

    // If no pattern matched, return first meaningful line (up to 200 chars)
    const lines = output.trim().split('\n').filter((l) => l.trim())
    if (lines.length > 0) {
      const firstLine = lines[0].trim()
      return firstLine.length > 200 ? firstLine.slice(0, 197) + '...' : firstLine
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
    if (!this.repoRules) {
      const rules = await loadRepositoryRules(this.repoPath)
      this.repoRules = formatRulesForPrompt(rules)
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

    if (this.repoRules) {
      fixPrompt += `\n${this.repoRules}`
    }

    fixPrompt += `

Instructions:
1. Read the affected file(s)
2. Make the minimal fix required following the repository rules and conventions
3. Do not change anything else
4. Ensure your changes follow all coding standards and conventions listed above

Apply the fix now.`

    // Track token usage for the prompt
    this.tokenTracker.addText(fixPrompt)

    return fixPrompt
  }

  /**
   * Run validation checks (lint, build, tests) after a fix
   *
   * @returns {Promise<{success: boolean, output: string, failedStep: string|null}>}
   */
  async runValidation() {
    const results = {
      success: true,
      output: '',
      failedStep: null,
    }

    if (this.runLint) {
      this.log('  Running lint...')
      const lintResult = await runLint(this.repoPath, { timeout: 60000 })
      results.output += `\nLint: ${lintResult.success ? 'PASS' : 'FAIL'}\n${lintResult.output}`
      if (!lintResult.success) {
        results.success = false
        results.failedStep = 'lint'
        return results
      }
    }

    if (this.runBuild) {
      this.log('  Running build...')
      const buildResult = await runBuild(this.repoPath, { timeout: 120000 })
      results.output += `\nBuild: ${buildResult.success ? 'PASS' : 'FAIL'}\n${buildResult.output}`
      if (!buildResult.success) {
        results.success = false
        results.failedStep = 'build'
        return results
      }
    }

    if (this.runTests) {
      this.log('  Running tests...')
      const testResult = await runTests(this.repoPath, { timeout: 180000 })
      results.output += `\nTests: ${testResult.success ? 'PASS' : 'FAIL'}\n${testResult.output}`
      if (!testResult.success) {
        results.success = false
        results.failedStep = 'tests'
        return results
      }
    }

    return results
  }

  /**
   * Spawn an independent Claude agent to apply a fix
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

    return new Promise((resolve) => {
      // Use claude without --print so it can make file edits
      // Pass prompt via -p flag for non-interactive mode
      // Use --model sonnet for faster, cheaper fixes
      const claude = spawn(
        'claude',
        [
          '-p',
          fixPrompt,
          '--model',
          'sonnet',
          '--allowedTools',
          'Read,Edit,Write',
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
          cwd: this.repoPath,
        },
      )

      let stdout = ''
      let stderr = ''

      claude.stdout.on('data', (data) => {
        const text = data.toString()
        stdout += text
        if (this.verbose) {
          this.reporter.write(text)
        }
      })

      claude.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      claude.on('close', async (code) => {
        // Track response tokens
        this.tokenTracker.addText(stdout)

        if (code !== 0) {
          resolve({
            success: false,
            output: stderr || stdout,
            validationFailed: false,
          })
          return
        }

        // Fix was applied, now run validation
        const validation = await this.runValidation()

        resolve({
          success: validation.success,
          output: stdout + validation.output,
          validationFailed: !validation.success,
          failedStep: validation.failedStep,
        })
      })

      claude.on('error', (err) => {
        resolve({
          success: false,
          output: `Failed to spawn Claude: ${err.message}`,
          validationFailed: false,
        })
      })
    })
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
   * Apply all fixes from a prompts directory
   *
   * @param {string} promptsDir - Directory containing prompt JSON files
   * @returns {Promise<{total: number, applied: number, failed: number, validationFailed: number, appliedItems: Array, failedItems: Array, validationFailedItems: Array, tokenUsage: Object, duration: number}>}
   */
  async applyFixes(promptsDir) {
    this.startTime = Date.now()

    // Load repository rules once at the start
    await this.loadRepoRules()

    const prompts = await this.loadPrompts(promptsDir)
    let applied = 0
    let failed = 0
    let validationFailed = 0
    const appliedItems = []
    const failedItems = []
    const validationFailedItems = []

    this.reporter.log(`Found ${prompts.length} prompts in ${promptsDir}`)
    if (this.showProgress) {
      this.reporter.log(
        `Token tracking enabled (max: ${this.tokenTracker.maxTokens.toLocaleString()})`,
      )
    }

    for (let i = 0; i < prompts.length; i++) {
      const { file, prompt } = prompts[i]
      this.reporter.log(`\n[${i + 1}/${prompts.length}] ${file}`)
      this.reporter.log(`  Priority: ${prompt.priority}`)
      this.reporter.log(`  Category: ${prompt.category}`)
      this.reporter.log(`  Files: ${prompt.affectedFiles.join(', ')}`)

      const result = await this.spawnAgent(prompt)

      if (result.success) {
        applied++
        this.reporter.log(`  Status: Applied & Validated`)
        appliedItems.push({
          file,
          category: prompt.category,
          instruction: prompt.instruction,
          affectedFiles: prompt.affectedFiles,
        })
        if (!this.dryRun) {
          await this.markComplete(promptsDir, file)
        }
      } else if (result.validationFailed) {
        validationFailed++
        this.reporter.log(`  Status: Applied but validation failed`)
        this.reporter.log(`  Failed step: ${result.failedStep}`)
        const errorMsg = this.extractErrorMessage(result.output)
        this.reporter.log(`  Details: ${errorMsg}`)
        validationFailedItems.push({
          file,
          category: prompt.category,
          instruction: prompt.instruction,
          affectedFiles: prompt.affectedFiles,
          failedStep: result.failedStep,
          reason: errorMsg,
        })
      } else {
        failed++
        const errorMsg = this.extractErrorMessage(result.output)
        this.reporter.log(`  Status: Failed`)
        this.reporter.log(`  Reason: ${errorMsg}`)
        failedItems.push({
          file,
          category: prompt.category,
          instruction: prompt.instruction,
          affectedFiles: prompt.affectedFiles,
          reason: errorMsg,
        })
      }

      // Show progress after each fix
      this.displayProgress(i + 1, prompts.length)
    }

    const duration = Date.now() - this.startTime

    return {
      total: prompts.length,
      applied,
      failed,
      validationFailed,
      appliedItems,
      failedItems,
      validationFailedItems,
      tokenUsage: this.tokenTracker.getSummary(),
      duration,
    }
  }

  /**
   * Generate a summary report of applied and failed fixes
   *
   * @param {Object} result - Result from applyFixes
   * @returns {string} Formatted summary report
   */
  generateReport(result) {
    let report = '\n' + '='.repeat(60) + '\n'
    report += '  FIX SUMMARY REPORT\n'
    report += '='.repeat(60) + '\n\n'

    report += `Total: ${result.total} | Applied: ${result.applied} | Failed: ${result.failed}`
    if (result.validationFailed > 0) {
      report += ` | Validation Failed: ${result.validationFailed}`
    }
    report += '\n'

    // Add duration and token usage
    if (result.duration) {
      report += `Duration: ${this.formatElapsedTime(result.duration)}\n`
    }
    if (result.tokenUsage) {
      report += `Token Usage: ${result.tokenUsage.current.toLocaleString()}/${result.tokenUsage.max.toLocaleString()} `
      report += `(${result.tokenUsage.percentage.toFixed(1)}%)\n`
    }
    report += '\n'

    if (result.appliedItems.length > 0) {
      report += '--- APPLIED & VALIDATED ---\n\n'
      for (const item of result.appliedItems) {
        report += `[${item.category}] ${item.file}\n`
        report += `  ${item.instruction.slice(0, 100)}${item.instruction.length > 100 ? '...' : ''}\n`
        report += `  Files: ${item.affectedFiles.join(', ')}\n\n`
      }
    }

    if (result.validationFailedItems && result.validationFailedItems.length > 0) {
      report += '--- VALIDATION FAILED ---\n\n'
      for (const item of result.validationFailedItems) {
        report += `[${item.category}] ${item.file}\n`
        report += `  ${item.instruction.slice(0, 100)}${item.instruction.length > 100 ? '...' : ''}\n`
        report += `  Files: ${item.affectedFiles.join(', ')}\n`
        report += `  Failed step: ${item.failedStep}\n`
        report += `  Reason: ${item.reason}\n\n`
      }
    }

    if (result.failedItems.length > 0) {
      report += '--- FAILED ---\n\n'
      for (const item of result.failedItems) {
        report += `[${item.category}] ${item.file}\n`
        report += `  ${item.instruction.slice(0, 100)}${item.instruction.length > 100 ? '...' : ''}\n`
        report += `  Files: ${item.affectedFiles.join(', ')}\n`
        report += `  Reason: ${item.reason}\n\n`
      }
    }

    report += '='.repeat(60) + '\n'

    return report
  }
}
