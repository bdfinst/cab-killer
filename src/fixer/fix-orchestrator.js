import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/**
 * Orchestrates applying fixes using independent Claude agents
 */
export class FixOrchestrator {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false
    this.verbose = options.verbose || false
  }

  log(message) {
    if (this.verbose) {
      console.log(message)
    }
  }

  /**
   * Load all prompt files from a directory
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
      console.log(`  Prompt: ${prompt.instruction.slice(0, 80)}...`)
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
          process.stdout.write(text)
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
   * @returns {Promise<{total: number, applied: number, skipped: number, failed: number}>}
   */
  async applyFixes(promptsDir) {
    const prompts = await this.loadPrompts(promptsDir)
    let applied = 0
    const skipped = 0
    let failed = 0

    console.log(`Found ${prompts.length} prompts in ${promptsDir}`)

    for (let i = 0; i < prompts.length; i++) {
      const { file, prompt } = prompts[i]
      console.log(`\n[${i + 1}/${prompts.length}] ${file}`)
      console.log(`  Priority: ${prompt.priority}`)
      console.log(`  Category: ${prompt.category}`)
      console.log(`  Files: ${prompt.affectedFiles.join(', ')}`)

      const result = await this.spawnAgent(prompt)

      if (result.success) {
        applied++
        console.log(`  Status: Applied`)
      } else {
        failed++
        console.log(`  Status: Failed`)
        this.log(`  Error: ${result.output.slice(0, 200)}`)
      }
    }

    return {
      total: prompts.length,
      applied,
      skipped,
      failed,
    }
  }
}
