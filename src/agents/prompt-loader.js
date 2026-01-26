import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Loads and parses agent prompt files from markdown
 */
export class PromptLoader {
  /**
   * @param {string} promptDir - Directory containing prompt files
   */
  constructor(promptDir) {
    this.promptDir = promptDir
  }

  /**
   * Load a prompt by agent name
   *
   * @param {string} agentName - Name of the agent (without .md extension)
   * @returns {Promise<Object>} Parsed prompt sections
   */
  async load(agentName) {
    const filePath = join(this.promptDir, `${agentName}.md`)

    let content
    try {
      content = await readFile(filePath, 'utf-8')
    } catch {
      throw new Error(`Prompt file not found: ${filePath}`)
    }

    return this.parse(content)
  }

  /**
   * List available prompt files
   *
   * @returns {Promise<string[]>} List of agent names
   */
  async list() {
    const files = await readdir(this.promptDir)

    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''))
  }

  /**
   * Parse prompt content into sections
   *
   * @param {string} content - Raw prompt content
   * @returns {Object} Parsed sections
   */
  parse(content) {
    const extractSection = (tag) => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
      const match = content.match(regex)
      return match ? match[1].trim() : ''
    }

    return {
      raw: content,
      role: extractSection('role'),
      objective: extractSection('objective'),
      checklist: extractSection('checklist'),
      outputFormat: extractSection('output_format'),
    }
  }
}
