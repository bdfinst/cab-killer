/**
 * Orchestrates review agent execution
 */
export class Orchestrator {
  /**
   * @param {AgentRegistry} registry - Agent registry
   * @param {Object} [config] - Configuration
   */
  constructor(registry, config = {}) {
    this.registry = registry
    this.config = config
    this.onProgress = null
  }

  /**
   * Set progress callback
   *
   * @param {Function} callback - Called with progress updates
   */
  setProgressCallback(callback) {
    this.onProgress = callback
  }

  /**
   * Report progress
   *
   * @param {string} message - Progress message
   * @param {Object} [data] - Additional data
   */
  reportProgress(message, data = {}) {
    if (this.onProgress) {
      this.onProgress({ message, ...data })
    }
  }

  /**
   * Get list of enabled agent names
   *
   * @returns {string[]}
   */
  getEnabledAgents() {
    const allAgents = this.registry.list()

    if (!this.config.agents) {
      return allAgents
    }

    return allAgents.filter((name) => {
      const agentConfig = this.config.agents[name]
      return !agentConfig || agentConfig.enabled !== false
    })
  }

  /**
   * Run a single agent
   *
   * @param {string} agentName - Name of agent to run
   * @param {Array} files - Files to review
   * @returns {Promise<Object>} ReviewResult
   */
  async runSingleAgent(agentName, files) {
    const agent = this.registry.get(agentName)

    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`)
    }

    this.reportProgress(`Running ${agentName}...`, { agent: agentName })
    const result = await agent.review(files)
    this.reportProgress(`${agentName} complete`, {
      agent: agentName,
      status: result.status,
    })

    return result
  }

  /**
   * Run all enabled agents sequentially
   *
   * @param {Array} files - Files to review
   * @returns {Promise<Array>} Array of ReviewResults
   */
  async runAllAgents(files) {
    const agents = this.getEnabledAgents()
    const results = []

    for (const agentName of agents) {
      const result = await this.runSingleAgent(agentName, files)
      results.push(result)
    }

    return results
  }

  /**
   * Run all enabled agents in parallel
   *
   * @param {Array} files - Files to review
   * @returns {Promise<Array>} Array of ReviewResults
   */
  async runAllAgentsParallel(files) {
    const agents = this.getEnabledAgents()

    this.reportProgress(`Running ${agents.length} agents in parallel...`)

    const promises = agents.map((agentName) => {
      const agent = this.registry.get(agentName)
      return agent.review(files)
    })

    const results = await Promise.all(promises)

    this.reportProgress('All agents complete')

    return results
  }

  /**
   * Aggregate results from multiple agents
   *
   * @param {Array} results - Array of ReviewResults
   * @returns {Object} Aggregated summary
   */
  aggregateResults(results) {
    const totalAgents = results.length
    const passed = results.filter((r) => r.status === 'pass').length
    const warned = results.filter((r) => r.status === 'warn').length
    const failed = results.filter((r) => r.status === 'fail').length
    const totalIssues = results.reduce(
      (sum, r) => sum + (r.issues?.length || 0),
      0,
    )

    let overallStatus = 'pass'
    if (failed > 0) {
      overallStatus = 'fail'
    } else if (warned > 0) {
      overallStatus = 'warn'
    }

    return {
      totalAgents,
      passed,
      warned,
      failed,
      totalIssues,
      overallStatus,
      results,
    }
  }

  /**
   * Check if all results are passing
   *
   * @param {Array} results - Array of ReviewResults
   * @returns {boolean}
   */
  isAllPassing(results) {
    return results.every((r) => r.status === 'pass')
  }

  /**
   * Run in loop mode until all pass or max iterations reached
   *
   * @param {Array} files - Files to review
   * @param {Object} options
   * @param {number} [options.maxIterations] - Maximum iterations
   * @param {boolean} [options.parallel] - Run agents in parallel
   * @returns {Promise<Object>} Final aggregated results
   */
  async runLoop(files, options = {}) {
    const {
      maxIterations = this.config.orchestrator?.maxLoopIterations || 5,
      parallel = false,
    } = options

    let iteration = 0
    let results

    while (iteration < maxIterations) {
      iteration++
      this.reportProgress(`Loop iteration ${iteration}/${maxIterations}`)

      results = parallel
        ? await this.runAllAgentsParallel(files)
        : await this.runAllAgents(files)

      if (this.isAllPassing(results)) {
        this.reportProgress('All agents passing, loop complete')
        break
      }

      this.reportProgress(`Issues found, continuing loop...`, {
        iteration,
        issues: results.reduce((sum, r) => sum + (r.issues?.length || 0), 0),
      })
    }

    return {
      ...this.aggregateResults(results),
      iterations: iteration,
      maxIterations,
    }
  }
}
