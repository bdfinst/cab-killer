import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  AgentRegistry,
  createAgentRegistry,
} from '../../src/agents/registry.js'
import { BaseReviewAgent } from '../../src/agents/base-agent.js'

class MockAgent extends BaseReviewAgent {
  async review() {
    return this.formatResult({
      status: 'pass',
      issues: [],
      summary: 'Mock review complete',
    })
  }
}

describe('AgentRegistry', () => {
  let registry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  it('should register an agent', () => {
    const agent = new MockAgent('mock-agent')
    registry.register(agent)

    assert.strictEqual(registry.has('mock-agent'), true)
  })

  it('should get a registered agent', () => {
    const agent = new MockAgent('mock-agent')
    registry.register(agent)

    const retrieved = registry.get('mock-agent')

    assert.strictEqual(retrieved, agent)
  })

  it('should return undefined for unregistered agent', () => {
    const retrieved = registry.get('nonexistent')

    assert.strictEqual(retrieved, undefined)
  })

  it('should list all registered agent names', () => {
    registry.register(new MockAgent('agent-1'))
    registry.register(new MockAgent('agent-2'))
    registry.register(new MockAgent('agent-3'))

    const names = registry.list()

    assert.deepStrictEqual(names.sort(), ['agent-1', 'agent-2', 'agent-3'])
  })

  it('should throw when registering duplicate agent name', () => {
    registry.register(new MockAgent('mock-agent'))

    assert.throws(
      () => registry.register(new MockAgent('mock-agent')),
      /already registered/,
    )
  })

  it('should unregister an agent', () => {
    registry.register(new MockAgent('mock-agent'))
    registry.unregister('mock-agent')

    assert.strictEqual(registry.has('mock-agent'), false)
  })
})

describe('createAgentRegistry', () => {
  it('should create a registry with default agents', () => {
    const registry = createAgentRegistry()

    const names = registry.list()
    assert.ok(names.includes('test-review'))
    assert.ok(names.includes('structure-review'))
    assert.ok(names.includes('naming-review'))
    assert.ok(names.includes('domain-review'))
    assert.ok(names.includes('complexity-review'))
    assert.ok(names.includes('claude-setup-review'))
  })

  it('should create agents that can perform reviews', async () => {
    const registry = createAgentRegistry()
    const agent = registry.get('complexity-review')

    // Provide a simple code sample for the agent to review
    const files = [
      {
        path: 'example.js',
        content: 'function add(a, b) { return a + b; }',
      },
    ]

    const result = await agent.review(files)

    assert.strictEqual(result.agentName, 'complexity-review')
    assert.ok(['pass', 'warn', 'fail'].includes(result.status))
    assert.ok(Array.isArray(result.issues))
    assert.ok(typeof result.summary === 'string')
  })
})
