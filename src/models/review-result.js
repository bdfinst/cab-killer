const VALID_STATUSES = ['pass', 'warn', 'fail']

/**
 * Creates a ReviewResult object representing the output of an agent's review
 *
 * @param {Object} options
 * @param {string} options.agentName - Name of the review agent
 * @param {string} options.status - 'pass' | 'warn' | 'fail'
 * @param {string} options.summary - Summary of the review findings
 * @param {Array} [options.issues] - Array of ReviewIssue objects
 * @returns {Object} ReviewResult object
 */
export function createReviewResult({
  agentName,
  status,
  summary,
  issues = [],
} = {}) {
  if (!agentName) {
    throw new Error('Missing required field: agentName')
  }
  if (!status) {
    throw new Error('Missing required field: status')
  }
  if (!summary) {
    throw new Error('Missing required field: summary')
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`,
    )
  }

  if (!Array.isArray(issues)) {
    throw new Error('Issues must be an array')
  }

  return {
    agentName,
    status,
    issues,
    summary,
  }
}
