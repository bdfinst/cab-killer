import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createReviewIssue } from '../../src/models/review-issue.js'

describe('createReviewIssue', () => {
  it('should create a review issue with all required fields', () => {
    const issue = createReviewIssue({
      severity: 'error',
      file: 'src/utils/parser.js',
      line: 42,
      message: 'Function lacks test coverage',
    })

    assert.strictEqual(issue.severity, 'error')
    assert.strictEqual(issue.file, 'src/utils/parser.js')
    assert.strictEqual(issue.line, 42)
    assert.strictEqual(issue.message, 'Function lacks test coverage')
    assert.strictEqual(issue.suggestedFix, null)
  })

  it('should create a review issue with optional suggestedFix', () => {
    const issue = createReviewIssue({
      severity: 'warning',
      file: 'src/index.js',
      line: 10,
      message: 'Unused variable',
      suggestedFix: 'Remove the unused variable or prefix with underscore',
    })

    assert.strictEqual(issue.severity, 'warning')
    assert.strictEqual(
      issue.suggestedFix,
      'Remove the unused variable or prefix with underscore',
    )
  })

  it('should accept valid severity levels', () => {
    const severities = ['error', 'warning', 'suggestion']

    for (const severity of severities) {
      const issue = createReviewIssue({
        severity,
        file: 'test.js',
        line: 1,
        message: 'Test message',
      })
      assert.strictEqual(issue.severity, severity)
    }
  })

  it('should throw error for invalid severity', () => {
    assert.throws(
      () =>
        createReviewIssue({
          severity: 'critical',
          file: 'test.js',
          line: 1,
          message: 'Test',
        }),
      /Invalid severity/,
    )
  })

  it('should throw error for missing required fields', () => {
    assert.throws(() => createReviewIssue({}), /Missing required field/)

    assert.throws(
      () => createReviewIssue({ severity: 'error' }),
      /Missing required field/,
    )

    assert.throws(
      () => createReviewIssue({ severity: 'error', file: 'test.js' }),
      /Missing required field/,
    )

    assert.throws(
      () => createReviewIssue({ severity: 'error', file: 'test.js', line: 1 }),
      /Missing required field/,
    )
  })

  it('should throw error for invalid line number', () => {
    assert.throws(
      () =>
        createReviewIssue({
          severity: 'error',
          file: 'test.js',
          line: -1,
          message: 'Test',
        }),
      /Invalid line number/,
    )

    assert.throws(
      () =>
        createReviewIssue({
          severity: 'error',
          file: 'test.js',
          line: 'abc',
          message: 'Test',
        }),
      /Invalid line number/,
    )
  })
})
