import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { FixerLoop } from '../../src/fixer/fixer-loop.js'
import { Orchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentRegistry } from '../../src/agents/registry.js'
import { BaseReviewAgent } from '../../src/agents/base-agent.js'

// Mock agent that fails first, then passes
class ImprovingAgent extends BaseReviewAgent {
  constructor(name) {
    super(name)
    this.callCount = 0
  }

  async review() {
    this.callCount++
    if (this.callCount === 1) {
      return this.formatResult({
        status: 'fail',
        issues: [
          this.createIssue({
            severity: 'error',
            file: 'test.js',
            line: 1,
            message: 'Issue to fix',
          }),
        ],
        summary: 'Found issues',
      })
    }
    return this.formatResult({
      status: 'pass',
      issues: [],
      summary: 'All fixed',
    })
  }
}

// Mock agent that always fails (no progress)
class StubbornAgent extends BaseReviewAgent {
  async review() {
    return this.formatResult({
      status: 'fail',
      issues: [
        this.createIssue({
          severity: 'error',
          file: 'test.js',
          line: 1,
          message: 'Unfixable issue',
        }),
      ],
      summary: 'Still broken',
    })
  }
}

describe('FixerLoop', () => {
  let registry
  let orchestrator
  let mockClient

  beforeEach(() => {
    registry = new AgentRegistry()
    mockClient = {
      messages: {
        create: async () => ({
          content: [{ text: '```file:test.js\n// fixed\n```' }],
        }),
      },
    }
  })

  it('should stop when all agents pass', async () => {
    registry.register(new ImprovingAgent('improving'))
    orchestrator = new Orchestrator(registry)

    const fixer = new FixerLoop(orchestrator, mockClient, {
      maxIterations: 5,
    })

    const files = [{ path: 'test.js', content: '// original' }]
    const result = await fixer.run(files)

    assert.strictEqual(result.overallStatus, 'pass')
    assert.ok(result.iterations <= 5)
  })

  it('should stop when max iterations reached', async () => {
    registry.register(new StubbornAgent('stubborn'))
    orchestrator = new Orchestrator(registry)

    const fixer = new FixerLoop(orchestrator, mockClient, {
      maxIterations: 2,
    })

    const files = [{ path: 'test.js', content: '// original' }]
    const result = await fixer.run(files)

    // Should stop due to no progress, not max iterations
    assert.ok(result.iterations <= 2)
  })

  it('should stop when no progress is made', async () => {
    registry.register(new StubbornAgent('stubborn'))
    orchestrator = new Orchestrator(registry)

    const fixer = new FixerLoop(orchestrator, mockClient, {
      maxIterations: 10,
    })

    const files = [{ path: 'test.js', content: '// original' }]
    const result = await fixer.run(files)

    // Should stop early due to no progress
    assert.strictEqual(result.iterations, 2)
  })

  it('should group issues by file', () => {
    orchestrator = new Orchestrator(registry)
    const fixer = new FixerLoop(orchestrator, mockClient)

    const results = [
      {
        agentName: 'agent-1',
        issues: [
          { file: 'a.js', line: 1, message: 'Issue 1' },
          { file: 'b.js', line: 2, message: 'Issue 2' },
        ],
      },
      {
        agentName: 'agent-2',
        issues: [{ file: 'a.js', line: 5, message: 'Issue 3' }],
      },
    ]

    const grouped = fixer.groupIssuesByFile(results)

    assert.strictEqual(grouped['a.js'].length, 2)
    assert.strictEqual(grouped['b.js'].length, 1)
  })

  it('should parse fix response correctly', () => {
    orchestrator = new Orchestrator(registry)
    const fixer = new FixerLoop(orchestrator, mockClient)

    const response = `Here are the fixes:

\`\`\`file:src/index.js
const fixed = true
\`\`\`

\`\`\`file:src/utils.js
export function fixed() {}
\`\`\`
`

    const files = [
      { path: 'src/index.js', content: 'original' },
      { path: 'src/utils.js', content: 'original' },
      { path: 'src/other.js', content: 'unchanged' },
    ]

    const updated = fixer.parseFixResponse(response, files)

    assert.strictEqual(
      updated.find((f) => f.path === 'src/index.js').content,
      'const fixed = true\n',
    )
    assert.strictEqual(
      updated.find((f) => f.path === 'src/utils.js').content,
      'export function fixed() {}\n',
    )
    assert.strictEqual(
      updated.find((f) => f.path === 'src/other.js').content,
      'unchanged',
    )
  })

  it('should respect dry run mode', async () => {
    registry.register(new StubbornAgent('stubborn'))
    orchestrator = new Orchestrator(registry)

    let invokeCalled = false
    const fixer = new FixerLoop(orchestrator, mockClient, {
      maxIterations: 3,
      dryRun: true,
    })

    // Override to track if called
    const originalInvoke = fixer.invokeCodingAgent.bind(fixer)
    fixer.invokeCodingAgent = async (...args) => {
      invokeCalled = true
      return originalInvoke(...args)
    }

    const files = [{ path: 'test.js', content: '// original' }]
    await fixer.run(files)

    assert.strictEqual(invokeCalled, false)
  })
})
