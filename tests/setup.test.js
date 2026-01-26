import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadPackageJson() {
  const pkgPath = join(__dirname, '..', 'package.json')
  return JSON.parse(readFileSync(pkgPath, 'utf-8'))
}

describe('Project Setup', () => {
  it('should have ES modules enabled', () => {
    const pkg = loadPackageJson()
    assert.strictEqual(pkg.type, 'module')
  })

  it('should have required dependencies', () => {
    const pkg = loadPackageJson()
    const deps = pkg.dependencies

    assert.ok(deps['@anthropic-ai/sdk'], 'Missing @anthropic-ai/sdk')
    assert.ok(deps['commander'], 'Missing commander')
    assert.ok(deps['glob'], 'Missing glob')
  })

  it('should have npm scripts configured', () => {
    const pkg = loadPackageJson()
    const scripts = pkg.scripts

    assert.ok(scripts.start, 'Missing start script')
    assert.ok(scripts.test, 'Missing test script')
    assert.ok(scripts.lint, 'Missing lint script')
  })
})
