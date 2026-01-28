import { query } from '@anthropic-ai/claude-agent-sdk'

const DEFAULT_TIMEOUT_MS = 300000 // 5 minutes

/**
 * SDK client wrapper for Claude Agent SDK
 * Provides a consistent interface for querying Claude with usage tracking
 */
export class SDKClient {
  /**
   * @param {Object} options
   * @param {string} [options.model] - Model to use (default: claude-sonnet-4-5)
   * @param {string} [options.workingDirectory] - Working directory for file operations
   * @param {number} [options.timeout] - Request timeout in ms (default: 300000)
   */
  constructor(options = {}) {
    this.model = options.model || 'claude-sonnet-4-5'
    this.workingDirectory = options.workingDirectory || process.cwd()
    this.timeout = options.timeout || DEFAULT_TIMEOUT_MS
    this.totalUsage = this.createEmptyUsage()
  }

  /**
   * Create empty usage object
   */
  createEmptyUsage() {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    }
  }

  /**
   * Extract usage stats from SDK result message
   */
  extractUsage(resultEvent) {
    return {
      inputTokens: resultEvent.usage?.input_tokens || 0,
      outputTokens: resultEvent.usage?.output_tokens || 0,
      cacheReadInputTokens: resultEvent.usage?.cache_read_input_tokens || 0,
      cacheCreationInputTokens: resultEvent.usage?.cache_creation_input_tokens || 0,
      costUsd: resultEvent.total_cost_usd || 0,
      durationMs: resultEvent.duration_ms || 0,
    }
  }

  /**
   * Accumulate usage into total
   */
  accumulateUsage(usage) {
    for (const key of Object.keys(usage)) {
      this.totalUsage[key] += usage[key]
    }
  }

  /**
   * Extract text from assistant message content blocks
   */
  extractText(content) {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }

  /**
   * Send a prompt to Claude and get a response
   *
   * @param {string} prompt - The prompt to send
   * @param {Object} [options] - Additional options
   * @param {string[]} [options.allowedTools] - Tools the agent can use
   * @param {string} [options.permissionMode] - Permission mode (default, acceptEdits, bypassPermissions)
   * @param {string} [options.systemPrompt] - System prompt to prepend
   * @param {number} [options.timeout] - Request timeout in ms (overrides constructor default)
   * @returns {Promise<{result: string, usage: Object}>}
   */
  async chat(prompt, options = {}) {
    const response = query({
      prompt,
      options: {
        model: this.model,
        cwd: this.workingDirectory,
        timeout: options.timeout || this.timeout,
        allowedTools: options.allowedTools || ['Read', 'Glob', 'Grep'],
        permissionMode: options.permissionMode || 'bypassPermissions',
        systemPrompt: options.systemPrompt,
        ...options,
      },
    })

    let result = ''
    let usage = null

    for await (const message of response) {
      if (message.type === 'assistant' && message.message?.content) {
        result += this.extractText(message.message.content)
      }

      if (message.type === 'result' && message.subtype === 'success') {
        usage = this.extractUsage(message)
        this.accumulateUsage(usage)
        result = message.result || result
      }
    }

    return { result, usage }
  }

  /**
   * Get aggregated usage statistics
   *
   * @returns {Object} Total usage stats
   */
  getUsage() {
    return { ...this.totalUsage }
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.totalUsage = this.createEmptyUsage()
  }
}
