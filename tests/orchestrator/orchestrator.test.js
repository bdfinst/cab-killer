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

class TrackingAgent extends BaseReviewAgent {
  constructor(name, executionLog) {
    super(name)
    this.executionLog = executionLog
  }

  async review() {
    this.executionLog.push({ agent: this.name, event: 'start' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    this.executionLog.push({ agent: this.name, event: 'end' })
    return this.formatResult({
      status: 'pass',
      issues: [],
      summary: 'Done',
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
    const executionLog = []
    registry.register(new TrackingAgent('track-1', executionLog))
    registry.register(new TrackingAgent('track-2', executionLog))
    registry.register(new TrackingAgent('track-3', executionLog))
    const orchestrator = new Orchestrator(registry)

    const results = await orchestrator.runAllAgentsParallel([])

    assert.strictEqual(results.length, 3)
    // Verify parallel execution: all agents should start before any agent ends
    // by checking the order of events in the log (not timing-dependent)
    const firstEndIndex = executionLog.findIndex((e) => e.event === 'end')
    const startsBeforeFirstEnd = executionLog.slice(0, firstEndIndex).filter((e) => e.event === 'start')
    assert.strictEqual(
      startsBeforeFirstEnd.length,
      3,
      'All agents should start before any agent completes (parallel execution)',
    )
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

  it('should report final state when issues persist through all iterations in runLoop', async () => {
    registry.register(new FailingAgent('always-fails'))
    const orchestrator = new Orchestrator(registry)

    const result = await orchestrator.runLoop([], { maxIterations: 3 })

    assert.strictEqual(result.iterations, 3)
    assert.strictEqual(result.maxIterations, 3)
    assert.strictEqual(result.overallStatus, 'fail')
    assert.strictEqual(result.totalIssues, 1)
    assert.strictEqual(result.failed, 1)
  })

  it('should set and invoke progress callback via setProgressCallback', async () => {
    const progressMessages = []
    const callback = (progress) => progressMessages.push(progress)

    registry.register(new PassingAgent('progress-agent'))
    const orchestrator = new Orchestrator(registry)
    orchestrator.setProgressCallback(callback)

    await orchestrator.runSingleAgent('progress-agent', [])

    assert.strictEqual(progressMessages.length, 2)
    assert.strictEqual(progressMessages[0].message, 'Running progress-agent...')
    assert.strictEqual(progressMessages[0].agent, 'progress-agent')
    assert.strictEqual(progressMessages[1].message, 'progress-agent complete')
    assert.strictEqual(progressMessages[1].agent, 'progress-agent')
    assert.strictEqual(progressMessages[1].status, 'pass')
  })

  it('should invoke progress callback with correct messages during runAllAgentsParallel', async () => {
    const progressMessages = []
    const callback = (progress) => progressMessages.push(progress)

    registry.register(new PassingAgent('parallel-1'))
    registry.register(new PassingAgent('parallel-2'))
    const orchestrator = new Orchestrator(registry)
    orchestrator.setProgressCallback(callback)

    await orchestrator.runAllAgentsParallel([])

    assert.strictEqual(progressMessages.length, 2)
    assert.strictEqual(progressMessages[0].message, 'Running 2 agents in parallel...')
    assert.strictEqual(progressMessages[1].message, 'All agents complete')
  })

  it('should invoke progress callback during runLoop iterations', async () => {
    const progressMessages = []
    const callback = (progress) => progressMessages.push(progress)

    registry.register(new FailingAgent('loop-agent'))
    const orchestrator = new Orchestrator(registry)
    orchestrator.setProgressCallback(callback)

    await orchestrator.runLoop([], { maxIterations: 2 })

    // Should have messages for: iteration 1, running agent, agent complete, issues found,
    // iteration 2, running agent, agent complete, issues found
    const iterationMessages = progressMessages.filter((p) => p.message.includes('Loop iteration'))
    assert.strictEqual(iterationMessages.length, 2)
    assert.strictEqual(iterationMessages[0].message, 'Loop iteration 1/2')
    assert.strictEqual(iterationMessages[1].message, 'Loop iteration 2/2')
  })

  it('should not throw when reportProgress is called without callback set', async () => {
    registry.register(new PassingAgent('no-callback-agent'))
    const orchestrator = new Orchestrator(registry)

    // Should not throw even without callback
    await assert.doesNotReject(async () => {
      await orchestrator.runSingleAgent('no-callback-agent', [])
    })
  })
})
