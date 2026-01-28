/**
 * Track and display token usage during operations
 * Supports both legacy character-based estimation and native SDK usage stats
 */

const DEFAULT_MAX_BUDGET_USD = 10.0
const DEFAULT_CONTEXT_WINDOW_TOKENS = 200000
// Rough approximation: average English text uses ~4 characters per token
const CHARS_PER_TOKEN = 4

export class TokenTracker {
  constructor(options = {}) {
    this.maxBudget = options.maxBudget || DEFAULT_MAX_BUDGET_USD
    this.maxTokens = options.maxTokens || DEFAULT_CONTEXT_WINDOW_TOKENS
    this.reporter = options.reporter || {
      write: (msg) => process.stdout.write(msg),
      log: (msg) => console.log(msg),
    }
    this.verbose = options.verbose || false

    // Combined usage tracking (SDK values take precedence when available)
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    }

    // Legacy token counting (for backward compatibility)
    this.currentTokens = 0
  }

  /**
   * Check if SDK mode is active (has received real cost data)
   */
  isSdkMode() {
    return this.usage.costUsd > 0 || this.usage.inputTokens > 0
  }

  /**
   * Add native SDK usage stats
   *
   * @param {Object} sdkUsage - Usage stats from SDK client
   * @param {number} [sdkUsage.inputTokens]
   * @param {number} [sdkUsage.outputTokens]
   * @param {number} [sdkUsage.cacheReadInputTokens]
   * @param {number} [sdkUsage.cacheCreationInputTokens]
   * @param {number} [sdkUsage.costUsd]
   * @param {number} [sdkUsage.durationMs]
   */
  addUsage(sdkUsage) {
    this.usage.inputTokens += sdkUsage.inputTokens || 0
    this.usage.outputTokens += sdkUsage.outputTokens || 0
    this.usage.cacheReadInputTokens += sdkUsage.cacheReadInputTokens || 0
    this.usage.cacheCreationInputTokens += sdkUsage.cacheCreationInputTokens || 0
    this.usage.costUsd += sdkUsage.costUsd || 0
    this.usage.durationMs += sdkUsage.durationMs || 0

    // Also update legacy token count for compatibility
    this.currentTokens +=
      (sdkUsage.inputTokens || 0) + (sdkUsage.outputTokens || 0)
  }

  /**
   * Estimate tokens from text (legacy: ~4 chars per token)
   *
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) {
      return 0
    }
    return Math.ceil(text.length / CHARS_PER_TOKEN)
  }

  /**
   * Add tokens to the current count (legacy)
   *
   * @param {number} tokens - Number of tokens to add
   */
  addTokens(tokens) {
    this.currentTokens += tokens
  }

  /**
   * Add text and estimate its token usage (legacy)
   *
   * @param {string} text - Text to track
   */
  addText(text) {
    const tokens = this.estimateTokens(text)
    this.addTokens(tokens)
  }

  /**
   * Get cost percentage of budget
   *
   * @returns {number} Percentage (0-100)
   */
  getCostPercentage() {
    return Math.min(100, (this.usage.costUsd / this.maxBudget) * 100)
  }

  /**
   * Get current usage percentage (legacy token-based)
   *
   * @returns {number} Percentage (0-100)
   */
  getPercentage() {
    return Math.min(100, (this.currentTokens / this.maxTokens) * 100)
  }

  /**
   * Get remaining tokens (legacy)
   *
   * @returns {number} Remaining token count
   */
  getRemaining() {
    return Math.max(0, this.maxTokens - this.currentTokens)
  }

  /**
   * Build progress bar visualization
   *
   * @param {number} percentage - Fill percentage (0-100)
   * @param {number} width - Bar width in characters
   * @returns {string} Bar characters (without brackets)
   */
  _buildBar(percentage, width) {
    const filled = Math.round((percentage / 100) * width)
    return '█'.repeat(filled) + '░'.repeat(width - filled)
  }

  /**
   * Format usage as a progress bar (legacy token-based)
   *
   * @param {number} width - Bar width in characters
   * @returns {string} Formatted progress bar
   */
  formatProgressBar(width = 20) {
    const percentage = this.getPercentage()
    const bar = this._buildBar(percentage, width)
    return `[${bar}] ${percentage.toFixed(1)}%`
  }

  /**
   * Format usage as a cost-based progress bar (SDK mode)
   *
   * @param {number} width - Bar width in characters
   * @returns {string} Formatted progress bar with cost
   */
  formatCostProgressBar(width = 20) {
    const percentage = this.getCostPercentage()
    const bar = this._buildBar(percentage, width)
    return `[${bar}] $${this.usage.costUsd.toFixed(4)} / $${this.maxBudget.toFixed(2)}`
  }

  /**
   * Format progress bar with auto-detection of mode
   *
   * @param {number} width - Bar width in characters
   * @returns {string} Formatted progress bar
   */
  formatAutoProgressBar(width = 20) {
    return this.isSdkMode() ? this.formatCostProgressBar(width) : this.formatProgressBar(width)
  }

  /**
   * Format detailed usage stats
   *
   * @returns {string} Formatted usage string
   */
  formatUsage() {
    const { inputTokens, outputTokens, cacheReadInputTokens, costUsd } =
      this.usage
    let output = `Tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`
    if (cacheReadInputTokens > 0) {
      output += ` (${cacheReadInputTokens.toLocaleString()} cached)`
    }
    output += ` | Cost: $${costUsd.toFixed(4)}`
    return output
  }

  /**
   * Format legacy usage string (token-based)
   *
   * @returns {string} Formatted legacy usage
   */
  _formatLegacyUsage() {
    const remaining = this.getRemaining()
    return `Tokens: ${this.currentTokens.toLocaleString()}/${this.maxTokens.toLocaleString()} (${remaining.toLocaleString()} remaining)`
  }

  /**
   * Format comparison between legacy estimation and SDK actual
   * Shows the value of moving to SDK tracking
   *
   * @returns {string} Formatted comparison string
   */
  formatComparison() {
    if (!this.isSdkMode()) {
      return this._formatLegacyUsage()
    }

    const legacyEstimate = this.currentTokens
    const sdkActual = this.usage.inputTokens + this.usage.outputTokens
    const estimationError = legacyEstimate - sdkActual
    const errorPercent =
      sdkActual > 0 ? ((estimationError / sdkActual) * 100).toFixed(1) : '0.0'

    return `Estimated: ${legacyEstimate.toLocaleString()} | Actual: ${sdkActual.toLocaleString()} (${estimationError >= 0 ? '+' : ''}${errorPercent}% error) | Cost: $${this.usage.costUsd.toFixed(4)}`
  }

  /**
   * Core display method shared by all display variants
   *
   * @param {Object} options
   * @param {boolean} [options.inline] - Display inline (no newline)
   * @param {boolean} [options.showBar] - Show progress bar
   * @param {'legacy'|'sdk'} mode - Display mode
   */
  _displayCore(options, mode) {
    const { inline = false, showBar = true } = options
    let output = ''

    if (showBar) {
      output += mode === 'sdk' ? this.formatCostProgressBar() : this.formatProgressBar()
      output += ' | '
    }

    output += mode === 'sdk' ? this.formatUsage() : this._formatLegacyUsage()

    if (inline) {
      this.reporter.write(`\r${output}`)
    } else {
      this.reporter.log(output)
    }
  }

  /**
   * Display current usage (legacy token-based format)
   *
   * @param {Object} options
   * @param {boolean} [options.inline] - Display inline (no newline)
   * @param {boolean} [options.showBar] - Show progress bar
   */
  display(options = {}) {
    this._displayCore(options, 'legacy')
  }

  /**
   * Display SDK usage stats (cost-based format)
   *
   * @param {Object} options
   * @param {boolean} [options.inline] - Display inline (no newline)
   * @param {boolean} [options.showBar] - Show progress bar
   */
  displaySdkUsage(options = {}) {
    this._displayCore(options, 'sdk')
  }

  /**
   * Display with auto-detection of mode
   *
   * @param {Object} options
   * @param {boolean} [options.inline] - Display inline (no newline)
   * @param {boolean} [options.showBar] - Show progress bar
   */
  displayAuto(options = {}) {
    this._displayCore(options, this.isSdkMode() ? 'sdk' : 'legacy')
  }

  /**
   * Display usage only if verbose mode is on
   */
  displayIfVerbose() {
    if (this.verbose) {
      this.display({ inline: false, showBar: true })
    }
  }

  /**
   * Reset the tracker
   */
  reset() {
    this.currentTokens = 0
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    }
  }

  /**
   * Get a summary object
   *
   * @returns {Object} Usage summary
   */
  getSummary() {
    return {
      // Native SDK stats
      ...this.usage,
      maxBudget: this.maxBudget,
      costPercentage: this.getCostPercentage(),
      // Legacy compatibility
      current: this.currentTokens,
      max: this.maxTokens,
      remaining: this.getRemaining(),
      percentage: this.getPercentage(),
      percentageRemaining: 100 - this.getPercentage(),
    }
  }
}
