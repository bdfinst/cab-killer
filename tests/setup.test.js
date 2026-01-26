import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

function loadPackageJson() {
  const pkgPath = join(__dirname, '..', 'package.json')
  return JSON.parse(readFileSync(pkgPath, 'utf-8'))
}

describe('Project Setup', () => {
  it('should have ES modules enabled', () => {
    const packageJson = loadPackageJson()
    assert.strictEqual(packageJson.type, 'module')
  })

  it('should have required dependencies', () => {
    const packageJson = loadPackageJson()
    const dependencies = packageJson.dependencies

    assert.ok(dependencies['commander'], 'Missing commander')
    assert.ok(dependencies['glob'], 'Missing glob')
  })

  it('should have npm scripts configured', () => {
    const packageJson = loadPackageJson()
    const scripts = packageJson.scripts

    assert.ok(scripts.start, 'Missing start script')
    assert.ok(scripts.test, 'Missing test script')
    assert.ok(scripts.lint, 'Missing lint script')
  })
})

describe('Smoke Tests', () => {
  it('should successfully import main entry point', async () => {
    const mainModule = await import('../src/index.js')
    assert.ok(mainModule, 'Main entry point should be importable')
  })

  it('should successfully import CLI module', async () => {
    const cliModule = await import('../src/cli.js')
    assert.ok(cliModule.main, 'CLI module should export main function')
  })

  it('should run help command successfully', () => {
    const result = execSync('node src/index.js --help', {
      cwd: projectRoot,
      encoding: 'utf-8'
    })
    assert.ok(result.includes('Usage'), 'Help output should include usage info')
  })
})
