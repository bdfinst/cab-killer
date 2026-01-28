import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SDKClient } from '../../src/sdk/client.js'

describe('SDKClient', () => {
  describe('constructor', () => {
    it('should use default model if not specified', () => {
      const client = new SDKClient()
      assert.strictEqual(client.model, 'claude-sonnet-4-5')
    })

    it('should accept custom model', () => {
      const client = new SDKClient({ model: 'claude-opus-4' })
      assert.strictEqual(client.model, 'claude-opus-4')
    })

    it('should use cwd as default working directory', () => {
      const client = new SDKClient()
      assert.strictEqual(client.workingDirectory, process.cwd())
    })

    it('should initialize usage tracking to zero', () => {
      const client = new SDKClient()
      const usage = client.getUsage()
      assert.strictEqual(usage.inputTokens, 0)
      assert.strictEqual(usage.outputTokens, 0)
      assert.strictEqual(usage.costUsd, 0)
    })

    it('should use default timeout of 5 minutes', () => {
      const client = new SDKClient()
      assert.strictEqual(client.timeout, 300000)
    })

    it('should accept custom timeout', () => {
      const client = new SDKClient({ timeout: 600000 })
      assert.strictEqual(client.timeout, 600000)
    })
  })

  describe('getUsage', () => {
    it('should return a copy of usage stats', () => {
      const client = new SDKClient()
      const usage1 = client.getUsage()
      const usage2 = client.getUsage()
      assert.notStrictEqual(usage1, usage2)
      assert.deepStrictEqual(usage1, usage2)
    })
  })

  describe('resetUsage', () => {
    it('should reset all usage counters to zero', () => {
      const client = new SDKClient()
      // Manually set some values
      client.totalUsage.inputTokens = 100
      client.totalUsage.costUsd = 0.5

      client.resetUsage()

      const usage = client.getUsage()
      assert.strictEqual(usage.inputTokens, 0)
      assert.strictEqual(usage.outputTokens, 0)
      assert.strictEqual(usage.costUsd, 0)
    })
  })
})
