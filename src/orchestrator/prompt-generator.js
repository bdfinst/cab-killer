import { createCorrectionPrompt } from '../models/correction-prompt.js'

const SEVERITY_TO_PRIORITY = {
  error: 'high',
  warning: 'medium',
  suggestion: 'low',
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

/**
 * Convert a single issue to a correction prompt
 *
 * @param {Object} issue - ReviewIssue
 * @param {string} category - Agent name/category
 * @returns {Object} CorrectionPrompt
 */
export function issueToPrompt(issue, category) {
  const priority = SEVERITY_TO_PRIORITY[issue.severity] || 'medium'

  let instruction = `Fix: ${issue.message}`
  if (issue.suggestedFix) {
    instruction += ` (Suggested: ${issue.suggestedFix})`
  }

  return createCorrectionPrompt({
    priority,
    category,
    instruction,
    context: `Line ${issue.line} in ${issue.file}`,
    affectedFiles: [issue.file],
  })
}

/**
 * Group issues by file
 *
 * @param {Array} issues - Array of ReviewIssues
 * @returns {Object} Map of file path to issues
 */
export function groupIssuesByFile(issues) {
  const grouped = {}

  for (const issue of issues) {
    if (!grouped[issue.file]) {
      grouped[issue.file] = []
    }
    grouped[issue.file].push(issue)
  }

  return grouped
}

/**
 * Sort prompts by priority (high first)
 *
 * @param {Array} prompts - Array of CorrectionPrompts
 * @returns {Array} Sorted prompts
 */
export function prioritizePrompts(prompts) {
  return [...prompts].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  )
}

/**
 * Generates correction prompts from review results
 */
export class PromptGenerator {
  /**
   * Generate correction prompts from review results
   *
   * @param {Array} results - Array of ReviewResults
   * @returns {Array} Array of CorrectionPrompts
   */
  generate(results) {
    const prompts = []

    for (const result of results) {
      for (const issue of result.issues) {
        prompts.push(issueToPrompt(issue, result.agentName))
      }
    }

    return prioritizePrompts(prompts)
  }

  /**
   * Format prompts as text for a coding agent
   *
   * @param {Array} results - Array of ReviewResults
   * @returns {string} Formatted prompt text
   */
  formatForCodingAgent(results) {
    const prompts = this.generate(results)

    if (prompts.length === 0) {
      return 'No issues found. All reviews passed.'
    }

    const grouped = {}
    for (const prompt of prompts) {
      for (const file of prompt.affectedFiles) {
        if (!grouped[file]) {
          grouped[file] = []
        }
        grouped[file].push(prompt)
      }
    }

    let output = '# Code Review Corrections Required\n\n'

    for (const [file, filePrompts] of Object.entries(grouped)) {
      output += `## ${file}\n\n`

      for (const prompt of filePrompts) {
        const priorityEmoji =
          prompt.priority === 'high'
            ? '[HIGH]'
            : prompt.priority === 'medium'
              ? '[MEDIUM]'
              : '[LOW]'
        output += `- ${priorityEmoji} ${prompt.instruction}\n`
        if (prompt.context) {
          output += `  - Context: ${prompt.context}\n`
        }
      }

      output += '\n'
    }

    return output.trim()
  }
}
