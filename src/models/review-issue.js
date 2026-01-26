const VALID_SEVERITIES = ['error', 'warning', 'suggestion']

/**
 * Creates a ReviewIssue object representing a single issue found during review
 *
 * @param {Object} options
 * @param {string} options.severity - 'error' | 'warning' | 'suggestion'
 * @param {string} options.file - File path where the issue was found
 * @param {number} options.line - Line number of the issue
 * @param {string} options.message - Description of the issue
 * @param {string} [options.suggestedFix] - Optional suggestion for fixing the issue
 * @returns {Object} ReviewIssue object
 */
export function createReviewIssue({
  severity,
  file,
  line,
  message,
  suggestedFix = null,
} = {}) {
  if (!severity) {
    throw new Error('Missing required field: severity')
  }
  if (!file) {
    throw new Error('Missing required field: file')
  }
  if (line === undefined || line === null) {
    throw new Error('Missing required field: line')
  }
  if (!message) {
    throw new Error('Missing required field: message')
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(
      `Invalid severity: ${severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
    )
  }

  if (typeof line !== 'number' || line < 0 || !Number.isInteger(line)) {
    throw new Error('Invalid line number: must be a non-negative integer')
  }

  return {
    severity,
    file,
    line,
    message,
    suggestedFix,
  }
}
