import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createReviewResult } from '../../src/models/review-result.js'
import { createReviewIssue } from '../../src/models/review-issue.js'

describe('createReviewResult', () => {
  it('should create a review result with all required fields', () => {
    const result = createReviewResult({
      agentName: 'test-review',
      status: 'pass',
      summary: 'All tests look good',
    })

    assert.strictEqual(result.agentName, 'test-review')
    assert.strictEqual(result.status, 'pass')
    assert.strictEqual(result.summary, 'All tests look good')
    assert.deepStrictEqual(result.issues, [])
  })

  it('should create a review result with issues', () => {
    const issues = [
      createReviewIssue({
        severity: 'error',
        file: 'src/parser.js',
        line: 10,
        message: 'Missing error handling',
      }),
      createReviewIssue({
        severity: 'warning',
        file: 'src/parser.js',
        line: 25,
        message: 'Complex function',
        suggestedFix: 'Consider breaking into smaller functions',
      }),
    ]

    const result = createReviewResult({
      agentName: 'complexity-review',
      status: 'fail',
      issues,
      summary: 'Found 2 issues',
    })

    assert.strictEqual(result.agentName, 'complexity-review')
    assert.strictEqual(result.status, 'fail')
    assert.strictEqual(result.issues.length, 2)
    assert.strictEqual(result.summary, 'Found 2 issues')
  })

  it('should accept valid status values', () => {
    const statuses = ['pass', 'warn', 'fail']

    for (const status of statuses) {
      const result = createReviewResult({
        agentName: 'test-agent',
        status,
        summary: 'Test summary',
      })
      assert.strictEqual(result.status, status)
    }
  })

  it('should throw error for invalid status', () => {
    assert.throws(
      () =>
        createReviewResult({
          agentName: 'test-agent',
          status: 'unknown',
          summary: 'Test',
        }),
      /Invalid status/,
    )
  })

  it('should throw error for missing required fields', () => {
    assert.throws(() => createReviewResult({}), /Missing required field/)

    assert.throws(
      () => createReviewResult({ agentName: 'test' }),
      /Missing required field/,
    )

    assert.throws(
      () => createReviewResult({ agentName: 'test', status: 'pass' }),
      /Missing required field/,
    )
  })

  it('should throw error for invalid issues array', () => {
    assert.throws(
      () =>
        createReviewResult({
          agentName: 'test',
          status: 'pass',
          summary: 'Test',
          issues: 'not an array',
        }),
      /Issues must be an array/,
    )
  })
})
