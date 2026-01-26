import { createReviewResult } from '../models/review-result.js'
import { createReviewIssue } from '../models/review-issue.js'

/**
 * Base class for all review agents
 */
export class BaseReviewAgent {
  /**
   * @param {string} name - Agent name
   */
  constructor(name) {
    this.name = name
  }

  /**
   * Review files and return results
   * Must be implemented by subclasses
   *
   * @param {Array<{path: string, content: string}>} _files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async review(_files) {
    throw new Error('review() must be implemented by subclass')
  }

  /**
   * Format a result object with this agent's name
   *
   * @param {Object} options
   * @param {string} options.status - 'pass' | 'warn' | 'fail'
   * @param {Array} options.issues - Array of issues
   * @param {string} options.summary - Summary message
   * @returns {Object} ReviewResult
   */
  formatResult({ status, issues, summary }) {
    return createReviewResult({
      agentName: this.name,
      status,
      issues,
      summary,
    })
  }

  /**
   * Create an issue object
   *
   * @param {Object} options - Issue options
   * @returns {Object} ReviewIssue
   */
  createIssue(options) {
    return createReviewIssue(options)
  }
}
