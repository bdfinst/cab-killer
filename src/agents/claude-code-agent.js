import { BaseReviewAgent } from './base-agent.js'
import { spawn } from 'node:child_process'

/**
 * Review agent that uses Claude Code CLI instead of API
 */
export class ClaudeCodeAgent extends BaseReviewAgent {
  /**
   * @param {string} name - Agent name
   * @param {PromptLoader} promptLoader - Prompt loader instance
   */
  constructor(name, promptLoader) {
    super(name)
    this.promptLoader = promptLoader
    this.prompt = null
  }

  /**
   * Review files using Claude Code CLI
   *
   * @param {Array<{path: string, content: string}>} files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async review(files) {
    const prompt = await this.buildPrompt(files)
    const response = await this.callClaudeCode(prompt)
    return this.parseResponse(response)
  }

  /**
   * Call Claude Code CLI with prompt
   *
   * @param {string} prompt - The prompt to send
   * @returns {Promise<string>} Response text
   */
  async callClaudeCode(prompt) {
    return new Promise((resolve, reject) => {
      // Use --print for non-interactive mode, pipe prompt via stdin
      const claude = spawn('claude', ['--print'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''

      claude.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      claude.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(
            new Error(`Claude Code failed (code ${code}): ${stderr || stdout}`),
          )
        }
      })

      claude.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude Code: ${err.message}`))
      })

      // Write prompt to stdin and close
      claude.stdin.write(prompt)
      claude.stdin.end()
    })
  }

  /**
   * Build the full prompt with code context
   *
   * @param {Array<{path: string, content: string}>} files - Files to include
   * @returns {Promise<string>} Full prompt
   */
  async buildPrompt(files) {
    if (!this.prompt) {
      this.prompt = await this.promptLoader.load(this.name)
    }

    const filesContext = files
      .map(
        (f) => `## File: ${f.path}

\`\`\`
${f.content}
\`\`\``,
      )
      .join('\n\n')

    return `${this.prompt.role}

## Objective
${this.prompt.objective}

## Checklist
${this.prompt.checklist}

## Code to Review

${filesContext}

## Output Format
${this.prompt.outputFormat}

Please analyze the code above and return your review as JSON only, no other text.`
  }

  /**
   * Parse response into ReviewResult
   *
   * @param {string} response - Raw response
   * @returns {Object} ReviewResult
   */
  parseResponse(response) {
    let jsonStr = response

    // Check for markdown code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    // Try to find JSON object in response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

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
