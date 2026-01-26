import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  PromptGenerator,
  issueToPrompt,
  groupIssuesByFile,
  prioritizePrompts,
} from '../../src/orchestrator/prompt-generator.js'
import { createReviewIssue } from '../../src/models/review-issue.js'

describe('PromptGenerator', () => {
  describe('issueToPrompt', () => {
    it('should convert an issue to a correction prompt', () => {
      const issue = createReviewIssue({
        severity: 'error',
        file: 'src/parser.js',
        line: 42,
        message: 'Function lacks error handling',
        suggestedFix: 'Add try-catch block',
      })

      const prompt = issueToPrompt(issue, 'structure-review')

      assert.strictEqual(prompt.priority, 'high')
      assert.strictEqual(prompt.category, 'structure-review')
      assert.ok(prompt.instruction.includes('error handling'))
      assert.deepStrictEqual(prompt.affectedFiles, ['src/parser.js'])
    })

    it('should map severity to priority', () => {
      const errorIssue = createReviewIssue({
        severity: 'error',
        file: 'test.js',
        line: 1,
        message: 'Error',
      })
      const warningIssue = createReviewIssue({
        severity: 'warning',
        file: 'test.js',
        line: 1,
        message: 'Warning',
      })
      const suggestionIssue = createReviewIssue({
        severity: 'suggestion',
        file: 'test.js',
        line: 1,
        message: 'Suggestion',
      })

      assert.strictEqual(issueToPrompt(errorIssue, 'test').priority, 'high')
      assert.strictEqual(issueToPrompt(warningIssue, 'test').priority, 'medium')
      assert.strictEqual(issueToPrompt(suggestionIssue, 'test').priority, 'low')
    })
  })

  describe('groupIssuesByFile', () => {
    it('should group issues by file', () => {
      const issues = [
        createReviewIssue({
          severity: 'error',
          file: 'src/a.js',
          line: 1,
          message: 'Issue 1',
        }),
        createReviewIssue({
          severity: 'warning',
          file: 'src/b.js',
          line: 2,
          message: 'Issue 2',
        }),
        createReviewIssue({
          severity: 'error',
          file: 'src/a.js',
          line: 10,
          message: 'Issue 3',
        }),
      ]

      const grouped = groupIssuesByFile(issues)

      assert.strictEqual(grouped['src/a.js'].length, 2)
      assert.strictEqual(grouped['src/b.js'].length, 1)
    })
  })

  describe('prioritizePrompts', () => {
    it('should sort prompts by priority (high first)', () => {
      const prompts = [
        { priority: 'low', instruction: 'Low' },
        { priority: 'high', instruction: 'High' },
        { priority: 'medium', instruction: 'Medium' },
      ]

      const sorted = prioritizePrompts(prompts)

      assert.strictEqual(sorted[0].priority, 'high')
      assert.strictEqual(sorted[1].priority, 'medium')
      assert.strictEqual(sorted[2].priority, 'low')
    })
  })

  describe('PromptGenerator class', () => {
    it('should generate prompts from review results', () => {
      const generator = new PromptGenerator()

      const results = [
        {
          agentName: 'test-review',
          status: 'fail',
          issues: [
            createReviewIssue({
              severity: 'error',
              file: 'src/index.js',
              line: 10,
              message: 'Missing test coverage',
            }),
          ],
          summary: 'Found issues',
        },
      ]

      const prompts = generator.generate(results)

      assert.ok(prompts.length > 0)
      assert.strictEqual(prompts[0].category, 'test-review')
    })

    it('should format prompts for coding agent', () => {
      const generator = new PromptGenerator()

      const results = [
        {
          agentName: 'naming-review',
          status: 'warn',
          issues: [
            createReviewIssue({
              severity: 'warning',
              file: 'src/utils.js',
              line: 5,
              message: 'Variable name not descriptive',
              suggestedFix: 'Rename x to itemCount',
            }),
          ],
          summary: 'Naming issues found',
        },
      ]

      const output = generator.formatForCodingAgent(results)

      assert.ok(output.includes('src/utils.js'))
      assert.ok(output.includes('Variable name not descriptive'))
    })

    it('should return no issues message when results array is empty', () => {
      const generator = new PromptGenerator()

      const output = generator.formatForCodingAgent([])

      assert.strictEqual(output, 'No issues found. All reviews passed.')
    })
  })
})
