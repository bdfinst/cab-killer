import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  createAgentConfig,
  createOrchestratorConfig,
  createConfig,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from '../../src/models/config.js'

describe('createAgentConfig', () => {
  it('should return default config when no options provided', () => {
    const config = createAgentConfig()

    assert.strictEqual(config.enabled, true)
    assert.strictEqual(config.severityThreshold, 'warning')
  })

  it('should override defaults with provided options', () => {
    const config = createAgentConfig({
      enabled: false,
      severityThreshold: 'error',
    })

    assert.strictEqual(config.enabled, false)
    assert.strictEqual(config.severityThreshold, 'error')
  })

  it('should accept valid severity thresholds', () => {
    const thresholds = ['error', 'warning', 'suggestion']

    for (const severityThreshold of thresholds) {
      const config = createAgentConfig({ severityThreshold })
      assert.strictEqual(config.severityThreshold, severityThreshold)
    }
  })

  it('should throw error for invalid severity threshold', () => {
    assert.throws(
      () => createAgentConfig({ severityThreshold: 'critical' }),
      /Invalid severityThreshold/,
    )
  })

  it('should allow custom options', () => {
    const config = createAgentConfig({
      maxComplexity: 10,
      customRule: 'value',
    })

    assert.strictEqual(config.maxComplexity, 10)
    assert.strictEqual(config.customRule, 'value')
  })
})

describe('createOrchestratorConfig', () => {
  it('should return default config when no options provided', () => {
    const config = createOrchestratorConfig()

    assert.strictEqual(config.maxLoopIterations, 5)
    assert.strictEqual(config.failOnError, true)
    assert.strictEqual(config.parallel, false)
  })

  it('should override defaults with provided options', () => {
    const config = createOrchestratorConfig({
      maxLoopIterations: 10,
      failOnError: false,
      parallel: true,
    })

    assert.strictEqual(config.maxLoopIterations, 10)
    assert.strictEqual(config.failOnError, false)
    assert.strictEqual(config.parallel, true)
  })

  it('should throw error for invalid maxLoopIterations', () => {
    assert.throws(
      () => createOrchestratorConfig({ maxLoopIterations: 0 }),
      /maxLoopIterations must be a positive integer/,
    )

    assert.throws(
      () => createOrchestratorConfig({ maxLoopIterations: -1 }),
      /maxLoopIterations must be a positive integer/,
    )

    assert.throws(
      () => createOrchestratorConfig({ maxLoopIterations: 'five' }),
      /maxLoopIterations must be a positive integer/,
    )
  })
})

describe('createConfig', () => {
  it('should return full default config when no options provided', () => {
    const config = createConfig()

    assert.deepStrictEqual(config.agents, {
      'test-review': DEFAULT_AGENT_CONFIG,
      'structure-review': DEFAULT_AGENT_CONFIG,
      'naming-review': DEFAULT_AGENT_CONFIG,
      'domain-review': DEFAULT_AGENT_CONFIG,
      'complexity-review': DEFAULT_AGENT_CONFIG,
      'claude-setup-review': DEFAULT_AGENT_CONFIG,
    })
    assert.deepStrictEqual(config.orchestrator, DEFAULT_ORCHESTRATOR_CONFIG)
  })

  it('should merge agent configs with defaults', () => {
    const config = createConfig({
      agents: {
        'test-review': { enabled: false },
        'complexity-review': { severityThreshold: 'error', maxComplexity: 15 },
      },
    })

    assert.strictEqual(config.agents['test-review'].enabled, false)
    assert.strictEqual(
      config.agents['test-review'].severityThreshold,
      'warning',
    )

    assert.strictEqual(config.agents['complexity-review'].enabled, true)
    assert.strictEqual(
      config.agents['complexity-review'].severityThreshold,
      'error',
    )
    assert.strictEqual(config.agents['complexity-review'].maxComplexity, 15)

    // Other agents should have defaults
    assert.strictEqual(config.agents['naming-review'].enabled, true)
  })

  it('should merge orchestrator config with defaults', () => {
    const config = createConfig({
      orchestrator: {
        maxLoopIterations: 3,
      },
    })

    assert.strictEqual(config.orchestrator.maxLoopIterations, 3)
    assert.strictEqual(config.orchestrator.failOnError, true)
    assert.strictEqual(config.orchestrator.parallel, false)
  })
})
