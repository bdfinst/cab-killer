const VALID_PRIORITIES = ['high', 'medium', 'low']

/**
 * Creates a CorrectionPrompt object for instructing a coding agent to fix issues
 *
 * @param {Object} options
 * @param {string} options.priority - 'high' | 'medium' | 'low'
 * @param {string} options.category - Category of the correction (e.g., 'test-quality', 'naming')
 * @param {string} options.instruction - What the coding agent should do
 * @param {string} [options.context] - Additional context about the issue
 * @param {Array<string>} [options.affectedFiles] - List of files that need modification
 * @returns {Object} CorrectionPrompt object
 */
export function createCorrectionPrompt({
  priority,
  category,
  instruction,
  context = null,
  affectedFiles = [],
} = {}) {
  if (!priority) {
    throw new Error('Missing required field: priority')
  }
  if (!category) {
    throw new Error('Missing required field: category')
  }
  if (!instruction) {
    throw new Error('Missing required field: instruction')
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(
      `Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
    )
  }

  if (!Array.isArray(affectedFiles)) {
    throw new Error('affectedFiles must be an array')
  }

  return {
    priority,
    category,
    instruction,
    context,
    affectedFiles,
  }
}
