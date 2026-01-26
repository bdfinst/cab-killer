import { BaseReviewAgent } from './base-agent.js'

/**
 * Review agent that uses LLM to analyze code
 */
export class LLMReviewAgent extends BaseReviewAgent {
  /**
   * @param {string} name - Agent name
   * @param {PromptLoader} promptLoader - Prompt loader instance
   * @param {Object} [client] - Anthropic client (optional, for testing)
   */
  constructor(name, promptLoader, client = null) {
    super(name)
    this.promptLoader = promptLoader
    this.client = client
    this.prompt = null
  }

  /**
   * Review files using LLM
   *
   * @param {Array<{path: string, content: string}>} files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async review(files) {
    if (!this.client) {
      throw new Error('Anthropic client not configured')
    }

    const prompt = await this.buildPrompt(files)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content[0].text
    return this.parseResponse(responseText)
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

Please analyze the code above and return your review as JSON.`
  }

  /**
   * Parse LLM response into ReviewResult
   *
   * @param {string} response - Raw LLM response
   * @returns {Object} ReviewResult
   */
  parseResponse(response) {
    // Try to extract JSON from response (may be wrapped in markdown)
    let jsonStr = response

    // Check for markdown code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      throw new Error(
        `Failed to parse LLM response as JSON: ${response.slice(0, 200)}`,
      )
    }

    // Validate and format issues
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
