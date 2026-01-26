import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { constants } from 'node:fs'

/**
 * Locations to check for repository rules and guidelines
 */
const RULES_FILES = [
  'CLAUDE.md',
  '.clinerules',
  '.claude/rules/index.md',
  'CONTRIBUTING.md',
  'README.md',
]

/**
 * Check if a file exists
 *
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Load content from a rules file
 *
 * @param {string} repoPath - Repository root path
 * @param {string} filename - Filename to load
 * @returns {Promise<{filename: string, content: string}|null>}
 */
async function loadRulesFile(repoPath, filename) {
  const filePath = join(repoPath, filename)
  const exists = await fileExists(filePath)

  if (!exists) {
    return null
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    return { filename, content }
  } catch {
    return null
  }
}

/**
 * Load all available repository rules and guidelines
 *
 * @param {string} repoPath - Repository root path
 * @returns {Promise<Array<{filename: string, content: string}>>}
 */
export async function loadRepositoryRules(repoPath) {
  const rules = []

  for (const filename of RULES_FILES) {
    const ruleFile = await loadRulesFile(repoPath, filename)
    if (ruleFile) {
      rules.push(ruleFile)
    }
  }

  return rules
}

/**
 * Format repository rules for inclusion in agent prompts
 *
 * @param {Array<{filename: string, content: string}>} rules - Loaded rules
 * @returns {string} Formatted rules text
 */
export function formatRulesForPrompt(rules) {
  if (rules.length === 0) {
    return ''
  }

  let formatted = '\n## Repository Rules and Guidelines\n\n'
  formatted +=
    'Follow these rules and conventions from the target repository:\n\n'

  for (const rule of rules) {
    formatted += `### ${rule.filename}\n\n`
    formatted += '```\n'
    formatted += rule.content
    formatted += '\n```\n\n'
  }

  return formatted
}
