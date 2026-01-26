import { readFile, readdir, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/**
 * Orchestrates applying fixes using independent Claude agents
 */
export class FixOrchestrator {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false
    this.verbose = options.verbose || false
    this.reporter = options.reporter || {
      log: (msg) => console.log(msg),
      write: (msg) => process.stdout.write(msg),
    }
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
   * Build a prompt string for Claude to fix an issue
   *
   * @param {Object} prompt - CorrectionPrompt object
   * @returns {string}
   */
  buildFixPrompt(prompt) {
    return `Fix this code issue:

**Issue:** ${prompt.instruction}
**Location:** ${prompt.context}
**Files:** ${prompt.affectedFiles.join(', ')}

Instructions:
1. Read the affected file(s)
2. Make the minimal fix required
3. Do not change anything else

Apply the fix now.`
  }

  /**
   * Spawn an independent Claude agent to apply a fix
   *
   * @param {Object} prompt - CorrectionPrompt object
   * @returns {Promise<{success: boolean, output: string}>}
   */
  async spawnAgent(prompt) {
    const fixPrompt = this.buildFixPrompt(prompt)

    if (this.dryRun) {
      this.reporter.log(`  Prompt: ${prompt.instruction.slice(0, 80)}...`)
      return { success: true, output: '[dry-run]' }
    }

    return new Promise((resolve) => {
      // Use claude without --print so it can make file edits
      // Pass prompt via -p flag for non-interactive mode
      const claude = spawn('claude', ['-p', fixPrompt, '--allowedTools', 'Read,Edit,Write'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

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

      claude.on('close', (code) => {
        resolve({
          success: code === 0,
          output: code === 0 ? stdout : stderr || stdout,
        })
      })

      claude.on('error', (err) => {
        resolve({
          success: false,
          output: `Failed to spawn Claude: ${err.message}`,
        })
      })
    })
  }

  /**
   * Apply all fixes from a prompts directory
   *
   * @param {string} promptsDir - Directory containing prompt JSON files
   * @returns {Promise<{total: number, applied: number, failed: number, appliedItems: Array, failedItems: Array}>}
   */
  async applyFixes(promptsDir) {
    const prompts = await this.loadPrompts(promptsDir)
    let applied = 0
    let failed = 0
    const appliedItems = []
    const failedItems = []

    this.reporter.log(`Found ${prompts.length} prompts in ${promptsDir}`)

    for (let i = 0; i < prompts.length; i++) {
      const { file, prompt } = prompts[i]
      this.reporter.log(`\n[${i + 1}/${prompts.length}] ${file}`)
      this.reporter.log(`  Priority: ${prompt.priority}`)
      this.reporter.log(`  Category: ${prompt.category}`)
      this.reporter.log(`  Files: ${prompt.affectedFiles.join(', ')}`)

      const result = await this.spawnAgent(prompt)

      if (result.success) {
        applied++
        this.reporter.log(`  Status: Applied`)
        appliedItems.push({
          file,
          category: prompt.category,
          instruction: prompt.instruction,
          affectedFiles: prompt.affectedFiles,
        })
        if (!this.dryRun) {
          await this.markComplete(promptsDir, file)
        }
      } else {
        failed++
        // Extract a meaningful error message from the output
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
    }

    return {
      total: prompts.length,
      applied,
      failed,
      appliedItems,
      failedItems,
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

    report += `Total: ${result.total} | Applied: ${result.applied} | Failed: ${result.failed}\n\n`

    if (result.appliedItems.length > 0) {
      report += '--- APPLIED ---\n\n'
      for (const item of result.appliedItems) {
        report += `[${item.category}] ${item.file}\n`
        report += `  ${item.instruction.slice(0, 100)}${item.instruction.length > 100 ? '...' : ''}\n`
        report += `  Files: ${item.affectedFiles.join(', ')}\n\n`
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
