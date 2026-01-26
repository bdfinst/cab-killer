/**
 * Get status emoji for a given status and format
 * @param {string} status - 'pass', 'warn', or 'fail'
 * @param {string} format - 'console' or 'markdown'
 * @returns {string} The appropriate emoji
 */
function getStatusEmoji(status, format) {
  const emojis = {
    console: { pass: '✓', warn: '!', fail: '✗' },
    markdown: { pass: '✅', warn: '⚠️', fail: '❌' },
  }
  return emojis[format]?.[status] ?? emojis[format]?.fail ?? '?'
}

/**
 * Format issue details for verbose console output
 */
function formatIssueDetails(issues) {
  let output = ''
  for (const issue of issues) {
    output += `  - [${issue.severity}] ${issue.file}:${issue.line} - ${issue.message}\n`
  }
  return output
}

/**
 * Format results for console output
 */
export function formatConsoleOutput(aggregated, verbose) {
  let output = '\n'
  output += '═'.repeat(60) + '\n'
  output += '  CODE REVIEW RESULTS\n'
  output += '═'.repeat(60) + '\n\n'

  const statusEmoji = getStatusEmoji(aggregated.overallStatus, 'console')

  output += `Status: ${statusEmoji} ${aggregated.overallStatus.toUpperCase()}\n`
  output += `Agents: ${aggregated.passed} passed, ${aggregated.warned} warned, ${aggregated.failed} failed\n`
  output += `Issues: ${aggregated.totalIssues} total\n\n`

  if (aggregated.iterations) {
    output += `Loop iterations: ${aggregated.iterations}/${aggregated.maxIterations}\n\n`
  }

  for (const result of aggregated.results) {
    const emoji = getStatusEmoji(result.status, 'console')
    output += `${emoji} ${result.agentName}: ${result.summary}\n`

    if (verbose && result.issues.length > 0) {
      output += formatIssueDetails(result.issues)
    }
  }

  output += '\n' + '═'.repeat(60) + '\n'
  return output
}

/**
 * Format results as markdown report
 */
export function formatMarkdownReport(aggregated) {
  let md = '# Code Review Report\n\n'

  const statusEmoji = getStatusEmoji(aggregated.overallStatus, 'markdown')

  md += `## Summary\n\n`
  md += `- **Status**: ${statusEmoji} ${aggregated.overallStatus.toUpperCase()}\n`
  md += `- **Agents**: ${aggregated.passed} passed, ${aggregated.warned} warned, ${aggregated.failed} failed\n`
  md += `- **Total Issues**: ${aggregated.totalIssues}\n\n`

  if (aggregated.iterations) {
    md += `- **Loop Iterations**: ${aggregated.iterations}/${aggregated.maxIterations}\n\n`
  }

  md += `## Agent Results\n\n`

  for (const result of aggregated.results) {
    const emoji = getStatusEmoji(result.status, 'markdown')
    md += `### ${emoji} ${result.agentName}\n\n`
    md += `${result.summary}\n\n`

    if (result.issues.length > 0) {
      md += `| Severity | File | Line | Message |\n`
      md += `|----------|------|------|--------|\n`
      for (const issue of result.issues) {
        md += `| ${issue.severity} | ${issue.file} | ${issue.line} | ${issue.message} |\n`
      }
      md += '\n'
    }
  }

  return md
}
