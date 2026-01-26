const VALID_SEVERITY_THRESHOLDS = ['error', 'warning', 'suggestion']

const AGENT_NAMES = [
  'test-review',
  'structure-review',
  'naming-review',
  'domain-review',
  'complexity-review',
  'claude-setup-review',
]

export const DEFAULT_AGENT_CONFIG = {
  enabled: true,
  severityThreshold: 'warning',
}

export const DEFAULT_ORCHESTRATOR_CONFIG = {
  maxLoopIterations: 5,
  failOnError: true,
  parallel: false,
}

/**
 * Creates an agent configuration with defaults
 *
 * @param {Object} options
 * @param {boolean} [options.enabled] - Whether the agent is enabled
 * @param {string} [options.severityThreshold] - Minimum severity to report
 * @returns {Object} Agent configuration
 */
export function createAgentConfig(options = {}) {
  const config = {
    ...DEFAULT_AGENT_CONFIG,
    ...options,
  }

  if (
    options.severityThreshold !== undefined &&
    !VALID_SEVERITY_THRESHOLDS.includes(options.severityThreshold)
  ) {
    throw new Error(
      `Invalid severityThreshold: ${options.severityThreshold}. Must be one of: ${VALID_SEVERITY_THRESHOLDS.join(', ')}`,
    )
  }

  return config
}

/**
 * Creates an orchestrator configuration with defaults
 *
 * @param {Object} options
 * @param {number} [options.maxLoopIterations] - Maximum iterations for loop mode
 * @param {boolean} [options.failOnError] - Whether to fail on agent errors
 * @param {boolean} [options.parallel] - Whether to run agents in parallel
 * @returns {Object} Orchestrator configuration
 */
export function createOrchestratorConfig(options = {}) {
  const config = {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    ...options,
  }

  if (options.maxLoopIterations !== undefined) {
    if (
      typeof options.maxLoopIterations !== 'number' ||
      options.maxLoopIterations < 1 ||
      !Number.isInteger(options.maxLoopIterations)
    ) {
      throw new Error('maxLoopIterations must be a positive integer')
    }
  }

  return config
}

/**
 * Creates a full configuration object with defaults for all agents and orchestrator
 *
 * @param {Object} options
 * @param {Object} [options.agents] - Per-agent configuration overrides
 * @param {Object} [options.orchestrator] - Orchestrator configuration overrides
 * @returns {Object} Full configuration
 */
export function createConfig(options = {}) {
  const agents = {}

  // Initialize all agents with defaults
  for (const agentName of AGENT_NAMES) {
    const agentOptions = options.agents?.[agentName] || {}
    agents[agentName] = createAgentConfig(agentOptions)
  }

  const orchestrator = createOrchestratorConfig(options.orchestrator || {})

  return {
    agents,
    orchestrator,
  }
}
