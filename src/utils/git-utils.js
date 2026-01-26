import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * Check if a directory is a git repository
 *
 * @param {string} dir - Directory to check
 * @returns {boolean}
 */
export function isGitRepo(dir) {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get files changed since the last commit (staged + unstaged + untracked)
 *
 * @param {string} dir - Repository directory
 * @returns {string[]} List of changed file paths (absolute)
 */
export function getChangedFiles(dir) {
  const absoluteDir = resolve(dir)

  // Get staged changes
  const staged = execSync('git diff --cached --name-only', {
    cwd: absoluteDir,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get unstaged changes to tracked files
  const unstaged = execSync('git diff --name-only', {
    cwd: absoluteDir,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get untracked files
  const untracked = execSync('git ls-files --others --exclude-standard', {
    cwd: absoluteDir,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Combine and dedupe
  const allChanged = [...new Set([...staged, ...unstaged, ...untracked])]

  // Convert to absolute paths
  return allChanged.map((f) => resolve(absoluteDir, f))
}

/**
 * Get files changed compared to a specific ref (branch, commit, tag)
 *
 * @param {string} dir - Repository directory
 * @param {string} ref - Git ref to compare against (e.g., 'main', 'HEAD~1')
 * @returns {string[]} List of changed file paths (absolute)
 */
export function getChangedFilesSinceRef(dir, ref) {
  const absoluteDir = resolve(dir)

  const changed = execSync(`git diff --name-only ${ref}`, {
    cwd: absoluteDir,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)

  return changed.map((f) => resolve(absoluteDir, f))
}
