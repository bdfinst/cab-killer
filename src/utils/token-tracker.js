/**
 * Track and display token usage during operations
 */
export class TokenTracker {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 200000 // Default context window
    this.currentTokens = 0
    this.reporter = options.reporter || {
      write: (msg) => process.stdout.write(msg),
      log: (msg) => console.log(msg),
    }
    this.verbose = options.verbose || false
  }

  /**
   * Estimate tokens from text (rough approximation: ~4 chars per token)
   *
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) {
      return 0
    }
    return Math.ceil(text.length / 4)
  }

  /**
   * Add tokens to the current count
   *
   * @param {number} tokens - Number of tokens to add
   */
  addTokens(tokens) {
    this.currentTokens += tokens
  }

  /**
   * Add text and estimate its token usage
   *
   * @param {string} text - Text to track
   */
  addText(text) {
    const tokens = this.estimateTokens(text)
    this.addTokens(tokens)
  }

  /**
   * Get current usage percentage
   *
   * @returns {number} Percentage (0-100)
   */
  getPercentage() {
    return Math.min(100, (this.currentTokens / this.maxTokens) * 100)
  }

  /**
   * Get remaining tokens
   *
   * @returns {number} Remaining token count
   */
  getRemaining() {
    return Math.max(0, this.maxTokens - this.currentTokens)
  }

  /**
   * Format usage as a progress bar
   *
   * @param {number} width - Bar width in characters
   * @returns {string} Formatted progress bar
   */
  formatProgressBar(width = 20) {
    const percentage = this.getPercentage()
    const filled = Math.round((percentage / 100) * width)
    const empty = width - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    return `[${bar}] ${percentage.toFixed(1)}%`
  }

  /**
   * Display current usage
   *
   * @param {Object} options
   * @param {boolean} [options.inline] - Display inline (no newline)
   * @param {boolean} [options.showBar] - Show progress bar
   */
  display(options = {}) {
    const { inline = false, showBar = true } = options
    const remaining = this.getRemaining()

    let output = ''

    if (showBar) {
      output += this.formatProgressBar()
      output += ' | '
    }

    output += `Tokens: ${this.currentTokens.toLocaleString()}/${this.maxTokens.toLocaleString()}`
    output += ` (${remaining.toLocaleString()} remaining)`

    if (inline) {
      this.reporter.write(`\r${output}`)
    } else {
      this.reporter.log(output)
    }
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
  }

  /**
   * Get a summary object
   *
   * @returns {Object} Usage summary
   */
  getSummary() {
    return {
      current: this.currentTokens,
      max: this.maxTokens,
      remaining: this.getRemaining(),
      percentage: this.getPercentage(),
      percentageRemaining: 100 - this.getPercentage(),
    }
  }
}
