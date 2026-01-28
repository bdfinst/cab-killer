import { BaseReviewAgent } from './base-agent.js'
import { extractJsonFromResponse } from '../utils/json-extractor.js'

/**
 * Review agent that uses Claude Agent SDK for code review
 */
export class ClaudeCodeAgent extends BaseReviewAgent {
  /**
   * @param {string} name - Agent name
   * @param {PromptLoader} promptLoader - Prompt loader instance
   * @param {SDKClient} [sdkClient] - SDK client instance (required for review)
   */
  constructor(name, promptLoader, sdkClient = null) {
    super(name)
    this.promptLoader = promptLoader
    this.sdkClient = sdkClient
    this.prompt = null
  }

  /**
   * Review files using Claude Agent SDK
   *
   * @param {Array<{path: string, content: string}>} files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async review(files) {
    if (!this.sdkClient) {
      throw new Error('SDKClient is required for review operations')
    }

    const prompt = await this.buildPrompt(files)
    const { result } = await this.sdkClient.chat(prompt, {
      allowedTools: ['Read', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
    })
    return this.parseResponse(result)
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
