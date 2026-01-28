import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TokenTracker } from '../../src/utils/token-tracker.js'

describe('TokenTracker', () => {
  describe('addUsage (SDK mode)', () => {
    it('should track SDK usage stats', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        durationMs: 500,
      })

      const summary = tracker.getSummary()
      assert.equal(summary.inputTokens, 100)
      assert.equal(summary.outputTokens, 50)
      assert.equal(summary.costUsd, 0.001)
      assert.equal(summary.durationMs, 500)
    })

    it('should accumulate multiple usage calls', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({ inputTokens: 100, costUsd: 0.001 })
      tracker.addUsage({ inputTokens: 200, costUsd: 0.002 })

      const summary = tracker.getSummary()
      assert.equal(summary.inputTokens, 300)
      assert.equal(summary.costUsd, 0.003)
    })

    it('should also update legacy currentTokens', () => {
      const tracker = new TokenTracker({ maxTokens: 1000 })
      tracker.addUsage({ inputTokens: 100, outputTokens: 50 })

      assert.equal(tracker.currentTokens, 150)
    })

    it('should track cache read tokens', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({ cacheReadInputTokens: 500 })

      const summary = tracker.getSummary()
      assert.equal(summary.cacheReadInputTokens, 500)
    })
  })

  describe('getCostPercentage', () => {
    it('should calculate cost percentage of budget', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({ costUsd: 5.0 })

      assert.equal(tracker.getCostPercentage(), 50)
    })

    it('should cap at 100%', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({ costUsd: 15.0 })

      assert.equal(tracker.getCostPercentage(), 100)
    })
  })

  describe('formatCostProgressBar', () => {
    it('should format cost-based progress bar', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({ costUsd: 5.0 })
      const bar = tracker.formatCostProgressBar()

      assert.ok(bar.includes('['))
      assert.ok(bar.includes(']'))
      assert.ok(bar.includes('$5.0000'))
      assert.ok(bar.includes('$10.00'))
    })
  })

  describe('formatUsage', () => {
    it('should format SDK usage stats', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.05,
      })

      const usage = tracker.formatUsage()
      assert.ok(usage.includes('1,000 in'))
      assert.ok(usage.includes('500 out'))
      assert.ok(usage.includes('$0.0500'))
    })

    it('should show cache hits when present', () => {
      const tracker = new TokenTracker({ maxBudget: 10.0 })
      tracker.addUsage({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 800,
        costUsd: 0.02,
      })

      const usage = tracker.formatUsage()
      assert.ok(usage.includes('800 cached'))
    })
  })

  describe('formatComparison', () => {
    it('should return legacy format when not in SDK mode', () => {
      const tracker = new TokenTracker({ maxTokens: 10000 })
      tracker.addText('a'.repeat(400)) // ~100 tokens

      const comparison = tracker.formatComparison()
      assert.ok(comparison.includes('Tokens:'))
      assert.ok(comparison.includes('remaining'))
      assert.ok(!comparison.includes('Estimated:'))
    })

    it('should return comparison format in SDK mode', () => {
      const tracker = new TokenTracker({ maxTokens: 10000 })
      tracker.addUsage({
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.05,
      })

      const comparison = tracker.formatComparison()
      assert.ok(comparison.includes('Estimated:'))
      assert.ok(comparison.includes('Actual:'))
      assert.ok(comparison.includes('Cost:'))
      assert.ok(comparison.includes('$0.0500'))
    })

    it('should show error percentage', () => {
      const tracker = new TokenTracker({ maxTokens: 10000 })
      // Add legacy estimate first
      tracker.addText('a'.repeat(4000)) // ~1000 tokens legacy estimate
      // Then add SDK usage (which overwrites currentTokens)
      tracker.addUsage({
        inputTokens: 800,
        outputTokens: 200,
        costUsd: 0.03,
      })

      const comparison = tracker.formatComparison()
      assert.ok(comparison.includes('error)'))
    })

    it('should handle zero SDK tokens gracefully', () => {
      const tracker = new TokenTracker({ maxTokens: 10000 })
      tracker.addUsage({ inputTokens: 0, outputTokens: 0, costUsd: 0.001 })

      const comparison = tracker.formatComparison()
      assert.ok(comparison.includes('0.0% error'))
    })
  })

  describe('estimateTokens', () => {
    it('should estimate tokens from text', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      const tokens = tracker.estimateTokens('Hello world!')
      assert.ok(tokens > 0)
      assert.ok(tokens < 10)
    })

    it('should handle empty text', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      const tokens = tracker.estimateTokens('')
      assert.equal(tokens, 0)
    })

    it('should handle null text', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      const tokens = tracker.estimateTokens(null)
      assert.equal(tokens, 0)
    })
  })

  describe('addTokens', () => {
    it('should add tokens to current count', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(10)
      assert.equal(tracker.currentTokens, 10)
      tracker.addTokens(5)
      assert.equal(tracker.currentTokens, 15)
    })
  })

  describe('addText', () => {
    it('should estimate and add tokens from text', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addText('Hello world!')
      assert.ok(tracker.currentTokens > 0)
    })
  })

  describe('getPercentage', () => {
    it('should calculate percentage correctly', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(25)
      assert.equal(tracker.getPercentage(), 25)
    })

    it('should cap at 100%', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(150)
      assert.equal(tracker.getPercentage(), 100)
    })

    it('should handle zero tokens', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      assert.equal(tracker.getPercentage(), 0)
    })
  })

  describe('getRemaining', () => {
    it('should calculate remaining tokens', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(25)
      assert.equal(tracker.getRemaining(), 75)
    })

    it('should not go below zero', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(150)
      assert.equal(tracker.getRemaining(), 0)
    })
  })

  describe('formatProgressBar', () => {
    it('should format progress bar with default width', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(50)
      const bar = tracker.formatProgressBar()
      assert.ok(bar.includes('['))
      assert.ok(bar.includes(']'))
      assert.ok(bar.includes('50.0%'))
    })

    it('should format progress bar with custom width', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(25)
      const bar = tracker.formatProgressBar(10)
      assert.ok(bar.includes('25.0%'))
    })

    it('should handle 0% progress', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      const bar = tracker.formatProgressBar(10)
      assert.ok(bar.includes('0.0%'))
    })

    it('should handle 100% progress', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(100)
      const bar = tracker.formatProgressBar(10)
      assert.ok(bar.includes('100.0%'))
    })
  })

  describe('getSummary', () => {
    it('should return usage summary object', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(30)
      const summary = tracker.getSummary()

      assert.equal(summary.current, 30)
      assert.equal(summary.max, 100)
      assert.equal(summary.remaining, 70)
      assert.equal(summary.percentage, 30)
      assert.equal(summary.percentageRemaining, 70)
    })
  })

  describe('reset', () => {
    it('should reset token count to zero', () => {
      const tracker = new TokenTracker({ maxTokens: 100 })
      tracker.addTokens(50)
      assert.equal(tracker.currentTokens, 50)
      tracker.reset()
      assert.equal(tracker.currentTokens, 0)
    })
  })

  describe('display', () => {
    it('should format display output', () => {
      let output = ''
      const tracker = new TokenTracker({
        maxTokens: 100,
        reporter: {
          log: (msg) => {
            output = msg
          },
        },
      })
      tracker.addTokens(30)
      tracker.display({ inline: false, showBar: true })

      assert.ok(output.includes('30'))
      assert.ok(output.includes('100'))
      assert.ok(output.includes('70 remaining'))
    })
  })
})
