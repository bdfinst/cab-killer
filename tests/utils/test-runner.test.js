import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectScripts, runScript } from '../../src/utils/test-runner.js'

describe('test-runner', () => {
  describe('detectScripts', () => {
    it('should detect test, build, and lint scripts', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const packageJson = {
        name: 'test-project',
        scripts: {
          test: 'node --test',
          build: 'tsc',
          lint: 'eslint .',
        },
      }
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(packageJson),
      )

      const scripts = await detectScripts(tempDir)

      assert.equal(scripts.test, 'node --test')
      assert.equal(scripts.build, 'tsc')
      assert.equal(scripts.lint, 'eslint .')

      await rm(tempDir, { recursive: true })
    })

    it('should return null for missing scripts', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const packageJson = {
        name: 'test-project',
        scripts: {},
      }
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(packageJson),
      )

      const scripts = await detectScripts(tempDir)

      assert.equal(scripts.test, null)
      assert.equal(scripts.build, null)
      assert.equal(scripts.lint, null)

      await rm(tempDir, { recursive: true })
    })

    it('should handle missing package.json', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))

      const scripts = await detectScripts(tempDir)

      assert.equal(scripts.test, null)
      assert.equal(scripts.build, null)
      assert.equal(scripts.lint, null)

      await rm(tempDir, { recursive: true })
    })
  })

  describe('runScript', () => {
    it('should run a valid script', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const packageJson = {
        name: 'test-project',
        scripts: {
          hello: 'echo "Hello, World!"',
        },
      }
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(packageJson),
      )

      const result = await runScript(tempDir, 'hello', { timeout: 5000 })

      assert.equal(result.success, true)
      assert.equal(result.exitCode, 0)
      assert.ok(result.output.includes('Hello, World!'))

      await rm(tempDir, { recursive: true })
    })

    it('should handle failing script', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const packageJson = {
        name: 'test-project',
        scripts: {
          fail: 'exit 1',
        },
      }
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(packageJson),
      )

      const result = await runScript(tempDir, 'fail', { timeout: 5000 })

      assert.equal(result.success, false)
      assert.equal(result.exitCode, 1)

      await rm(tempDir, { recursive: true })
    })
  })
})
