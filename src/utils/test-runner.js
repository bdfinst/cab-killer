import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileExists } from './repo-rules-loader.js'

/**
 * Detect the package manager used in the repository
 *
 * @param {string} repoPath - Repository root path
 * @returns {Promise<string>} Package manager name (npm, yarn, pnpm, or bun)
 */
async function detectPackageManager(repoPath) {
  const lockFiles = {
    'package-lock.json': 'npm',
    'yarn.lock': 'yarn',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lockb': 'bun',
  }

  for (const [lockFile, pm] of Object.entries(lockFiles)) {
    const exists = await fileExists(join(repoPath, lockFile))
    if (exists) {
      return pm
    }
  }

  return 'npm'
}

/**
 * Load and parse package.json scripts
 *
 * @param {string} repoPath - Repository root path
 * @returns {Promise<Object|null>} Package.json scripts object or null
 */
async function loadPackageScripts(repoPath) {
  try {
    const pkgPath = join(repoPath, 'package.json')
    const content = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)
    return pkg.scripts || {}
  } catch {
    return null
  }
}

/**
 * Determine test and build commands from package.json
 *
 * @param {string} repoPath - Repository root path
 * @returns {Promise<{test: string|null, build: string|null, lint: string|null}>}
 */
export async function detectScripts(repoPath) {
  const scripts = await loadPackageScripts(repoPath)

  if (!scripts) {
    return { test: null, build: null, lint: null }
  }

  return {
    test: scripts.test || null,
    build: scripts.build || null,
    lint: scripts.lint || null,
  }
}

/**
 * Run a package script
 *
 * @param {string} repoPath - Repository root path
 * @param {string} scriptName - Script name (e.g., 'test', 'build')
 * @param {Object} options
 * @param {number} [options.timeout] - Timeout in ms (default: 5 minutes)
 * @returns {Promise<{success: boolean, output: string, exitCode: number}>}
 */
export async function runScript(repoPath, scriptName, options = {}) {
  const { timeout = 300000 } = options
  const packageManager = await detectPackageManager(repoPath)

  return new Promise((resolve) => {
    const proc = spawn(packageManager, ['run', scriptName], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout + stderr,
        exitCode: code || 0,
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: `Failed to run script: ${err.message}`,
        exitCode: 1,
      })
    })
  })
}

/**
 * Run tests in the repository
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<{success: boolean, output: string, exitCode: number}>}
 */
export async function runTests(repoPath, options = {}) {
  const scripts = await detectScripts(repoPath)

  if (!scripts.test) {
    return {
      success: true,
      output: 'No test script found in package.json',
      exitCode: 0,
    }
  }

  return runScript(repoPath, 'test', options)
}

/**
 * Run build in the repository
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<{success: boolean, output: string, exitCode: number}>}
 */
export async function runBuild(repoPath, options = {}) {
  const scripts = await detectScripts(repoPath)

  if (!scripts.build) {
    return {
      success: true,
      output: 'No build script found in package.json',
      exitCode: 0,
    }
  }

  return runScript(repoPath, 'build', options)
}

/**
 * Run lint in the repository
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<{success: boolean, output: string, exitCode: number}>}
 */
export async function runLint(repoPath, options = {}) {
  const scripts = await detectScripts(repoPath)

  if (!scripts.lint) {
    return {
      success: true,
      output: 'No lint script found in package.json',
      exitCode: 0,
    }
  }

  return runScript(repoPath, 'lint', options)
}

/**
 * Check if a file exists (re-exported for convenience)
 *
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
export { fileExists } from './repo-rules-loader.js'
