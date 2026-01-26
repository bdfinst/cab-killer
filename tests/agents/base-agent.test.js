import { describe, it } from 'node:test'
import assert from 'node:assert'
import { BaseReviewAgent } from '../../src/agents/base-agent.js'

describe('BaseReviewAgent', () => {
  it('should be constructable with a name', () => {
    const agent = new BaseReviewAgent('test-agent')

    assert.strictEqual(agent.name, 'test-agent')
  })

  it('should have a review method that throws by default', async () => {
    const agent = new BaseReviewAgent('test-agent')

    await assert.rejects(async () => agent.review([]), /must be implemented/)
  })

  it('should format result with agent name', () => {
    const agent = new BaseReviewAgent('test-agent')

    const result = agent.formatResult({
      status: 'pass',
      issues: [],
      summary: 'All good',
    })

    assert.strictEqual(result.agentName, 'test-agent')
    assert.strictEqual(result.status, 'pass')
    assert.deepStrictEqual(result.issues, [])
    assert.strictEqual(result.summary, 'All good')
  })

  it('should create issue with helper method', () => {
    const agent = new BaseReviewAgent('test-agent')

    const issue = agent.createIssue({
      severity: 'warning',
      file: 'test.js',
      line: 10,
      message: 'Test issue',
    })

    assert.strictEqual(issue.severity, 'warning')
    assert.strictEqual(issue.file, 'test.js')
    assert.strictEqual(issue.line, 10)
    assert.strictEqual(issue.message, 'Test issue')
  })
})
