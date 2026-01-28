import { ClaudeCodeAgent } from './claude-code-agent.js'
import { PromptLoader } from './prompt-loader.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_PROMPTS_DIR = join(__dirname, '..', '..', 'prompts')

const DEFAULT_AGENTS = [
  'test-review',
  'structure-review',
  'naming-review',
  'domain-review',
  'complexity-review',
  'claude-setup-review',
]

/**
 * Registry for managing review agents
 */
export class AgentRegistry {
  constructor() {
    this.agents = new Map()
  }

  /**
   * Register an agent
   *
   * @param {BaseReviewAgent} agent - Agent to register
   */
  register(agent) {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent "${agent.name}" is already registered`)
    }
    this.agents.set(agent.name, agent)
  }

  /**
   * Get an agent by name
   *
   * @param {string} name - Agent name
   * @returns {BaseReviewAgent|undefined}
   */
  get(name) {
    return this.agents.get(name)
  }

  /**
   * Check if an agent is registered
   *
   * @param {string} name - Agent name
   * @returns {boolean}
   */
  has(name) {
    return this.agents.has(name)
  }

  /**
   * List all registered agent names
   *
   * @returns {string[]}
   */
  list() {
    return Array.from(this.agents.keys())
  }

  /**
   * Unregister an agent
   *
   * @param {string} name - Agent name
   */
  unregister(name) {
    this.agents.delete(name)
  }
}

/**
 * Create a registry with default agents
 *
 * @param {Object} [options]
 * @param {string} [options.promptsDir] - Directory containing prompts
 * @param {SDKClient} [options.sdkClient] - SDK client to inject into agents
 * @returns {AgentRegistry}
 */
export function createAgentRegistry(options = {}) {
  const { promptsDir = DEFAULT_PROMPTS_DIR, sdkClient = null } = options

  const registry = new AgentRegistry()
  const loader = new PromptLoader(promptsDir)

  for (const agentName of DEFAULT_AGENTS) {
    const agent = new ClaudeCodeAgent(agentName, loader, sdkClient)
    registry.register(agent)
  }

  return registry
}
