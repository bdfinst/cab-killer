import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TokenTracker } from '../../src/utils/token-tracker.js'

describe('TokenTracker', () => {
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
