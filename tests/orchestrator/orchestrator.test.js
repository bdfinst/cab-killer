import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Orchestrator } from '../../src/orchestrator/orchestrator.js'
import { BaseReviewAgent } from '../../src/agents/base-agent.js'
import { AgentRegistry } from '../../src/agents/registry.js'

class PassingAgent extends BaseReviewAgent {
  async review() {
    return this.formatResult({
      status: 'pass',
      issues: [],
      summary: 'All good',
    })
  }
}

class FailingAgent extends BaseReviewAgent {
  async review() {
    return this.formatResult({
      status: 'fail',
      issues: [
        this.createIssue({
          severity: 'error',
          file: 'test.js',
          line: 1,
          message: 'Test error',
        }),
      ],
      summary: 'Found issues',
    })
  }
}

class SlowAgent extends BaseReviewAgent {
  constructor(name, delay) {
    super(name)
    this.delay = delay
  }

  async review() {
    await new Promise((resolve) => setTimeout(resolve, this.delay))
    return this.formatResult({
      status: 'pass',
      issues: [],
      summary: 'Done after delay',
    })
  }
}

describe('Orchestrator', () => {
  let registry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  it('should run a single agent', async () => {
    registry.register(new PassingAgent('test-agent'))
    const orchestrator = new Orchestrator(registry)

    const result = await orchestrator.runSingleAgent('test-agent', [])

    assert.strictEqual(result.agentName, 'test-agent')
    assert.strictEqual(result.status, 'pass')
  })

  it('should throw for unknown agent', async () => {
    const orchestrator = new Orchestrator(registry)

    await assert.rejects(
      async () => orchestrator.runSingleAgent('nonexistent', []),
      /Agent not found/,
    )
  })

  it('should run all agents sequentially', async () => {
    registry.register(new PassingAgent('agent-1'))
    registry.register(new FailingAgent('agent-2'))
    const orchestrator = new Orchestrator(registry)

    const results = await orchestrator.runAllAgents([])

    assert.strictEqual(results.length, 2)
    assert.ok(results.some((r) => r.agentName === 'agent-1'))
    assert.ok(results.some((r) => r.agentName === 'agent-2'))
  })

  it('should run all agents in parallel', async () => {
    registry.register(new SlowAgent('slow-1', 50))
    registry.register(new SlowAgent('slow-2', 50))
    registry.register(new SlowAgent('slow-3', 50))
    const orchestrator = new Orchestrator(registry)

    const start = Date.now()
    const results = await orchestrator.runAllAgentsParallel([])
    const duration = Date.now() - start

    assert.strictEqual(results.length, 3)
    // Should complete in ~50ms, not ~150ms (parallel vs sequential)
    assert.ok(duration < 120, `Expected <120ms but took ${duration}ms`)
  })

  it('should aggregate results correctly', () => {
    const orchestrator = new Orchestrator(registry)

    const results = [
      {
        agentName: 'agent-1',
        status: 'pass',
        issues: [],
        summary: 'Good',
      },
      {
        agentName: 'agent-2',
        status: 'fail',
        issues: [
          { severity: 'error', file: 'test.js', line: 1, message: 'Bad' },
        ],
        summary: 'Bad',
      },
    ]

    const aggregated = orchestrator.aggregateResults(results)

    assert.strictEqual(aggregated.totalAgents, 2)
    assert.strictEqual(aggregated.passed, 1)
    assert.strictEqual(aggregated.failed, 1)
    assert.strictEqual(aggregated.totalIssues, 1)
    assert.strictEqual(aggregated.overallStatus, 'fail')
  })

  it('should detect all passing for loop termination', () => {
    const orchestrator = new Orchestrator(registry)

    const passingResults = [
      { status: 'pass', issues: [] },
      { status: 'pass', issues: [] },
    ]

    const failingResults = [
      { status: 'pass', issues: [] },
      { status: 'fail', issues: [{}] },
    ]

    assert.strictEqual(orchestrator.isAllPassing(passingResults), true)
    assert.strictEqual(orchestrator.isAllPassing(failingResults), false)
  })

  it('should filter enabled agents based on config', async () => {
    registry.register(new PassingAgent('enabled-agent'))
    registry.register(new PassingAgent('disabled-agent'))

    const config = {
      agents: {
        'enabled-agent': { enabled: true },
        'disabled-agent': { enabled: false },
      },
    }

    const orchestrator = new Orchestrator(registry, config)
    const results = await orchestrator.runAllAgents([])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].agentName, 'enabled-agent')
  })
})
