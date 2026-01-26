/**
 * Manages the fix loop that iteratively applies corrections
 */
export class FixerLoop {
  /**
   * @param {Orchestrator} orchestrator - The orchestrator instance
   * @param {Object} client - Anthropic client
   * @param {Object} options
   * @param {number} [options.maxIterations] - Maximum fix iterations
   * @param {boolean} [options.dryRun] - If true, show changes without applying
   */
  constructor(orchestrator, client, options = {}) {
    this.orchestrator = orchestrator
    this.client = client
    this.maxIterations = options.maxIterations || 5
    this.dryRun = options.dryRun || false
    this.onProgress = null
  }

  /**
   * Set progress callback
   *
   * @param {Function} callback
   */
  setProgressCallback(callback) {
    this.onProgress = callback
  }

  /**
   * Report progress
   *
   * @param {string} message
   * @param {Object} [data]
   */
  reportProgress(message, data = {}) {
    if (this.onProgress) {
      this.onProgress({ message, ...data })
    }
  }

  /**
   * Run the fix loop
   *
   * @param {Array} files - Initial files
   * @returns {Promise<Object>} Final aggregated results
   */
  async run(files) {
    let currentFiles = files
    let iteration = 0
    let lastIssueCount = Infinity
    let results

    while (iteration < this.maxIterations) {
      iteration++
      this.reportProgress(`Fix iteration ${iteration}/${this.maxIterations}`)

      // Run review
      results = await this.orchestrator.runAllAgentsParallel(currentFiles)

      // Check if all passing
      if (this.orchestrator.isAllPassing(results)) {
        this.reportProgress('All agents passing, fix loop complete')
        break
      }

      // Count current issues
      const currentIssueCount = results.reduce(
        (sum, r) => sum + (r.issues?.length || 0),
        0,
      )

      // Check for progress
      if (currentIssueCount >= lastIssueCount) {
        this.reportProgress(
          `No progress made (${currentIssueCount} issues remain), stopping`,
        )
        break
      }

      lastIssueCount = currentIssueCount
      this.reportProgress(`Found ${currentIssueCount} issues, generating fixes`)

      if (this.dryRun) {
        this.reportProgress('Dry run mode, skipping actual fixes')
        continue
      }

      // Generate and apply fixes
      const fixedFiles = await this.invokeCodingAgent(results, currentFiles)
      currentFiles = fixedFiles
    }

    const aggregated = this.orchestrator.aggregateResults(results)
    return {
      ...aggregated,
      iterations: iteration,
      maxIterations: this.maxIterations,
    }
  }

  /**
   * Invoke the coding agent to fix issues
   *
   * @param {Array} results - Review results with issues
   * @param {Array} files - Current file contents
   * @returns {Promise<Array>} Updated files
   */
  async invokeCodingAgent(results, files) {
    // Build prompt for fixing
    const issuesByFile = this.groupIssuesByFile(results)
    const prompt = this.buildFixPrompt(issuesByFile, files)

    this.reportProgress('Invoking coding agent for fixes...')

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content[0].text

    // Parse the response to extract fixed files
    return this.parseFixResponse(responseText, files)
  }

  /**
   * Group all issues by file
   *
   * @param {Array} results - Review results
   * @returns {Object} Map of file to issues
   */
  groupIssuesByFile(results) {
    const grouped = {}

    for (const result of results) {
      for (const issue of result.issues || []) {
        if (!grouped[issue.file]) {
          grouped[issue.file] = []
        }
        grouped[issue.file].push({
          ...issue,
          agent: result.agentName,
        })
      }
    }

    return grouped
  }

  /**
   * Build the prompt for fixing issues
   *
   * @param {Object} issuesByFile - Issues grouped by file
   * @param {Array} files - Current file contents
   * @returns {string} Fix prompt
   */
  buildFixPrompt(issuesByFile, files) {
    let prompt = `You are a code fixer. Fix the following issues in the code.
Return the complete fixed file contents in this format:

\`\`\`file:path/to/file.js
// fixed content here
\`\`\`

For each file that needs changes, include the complete file with fixes applied.

## Issues to Fix

`

    for (const [file, issues] of Object.entries(issuesByFile)) {
      prompt += `### ${file}\n\n`
      for (const issue of issues) {
        prompt += `- [${issue.agent}] Line ${issue.line}: ${issue.message}`
        if (issue.suggestedFix) {
          prompt += ` (Suggestion: ${issue.suggestedFix})`
        }
        prompt += '\n'
      }
      prompt += '\n'
    }

    prompt += `## Current File Contents\n\n`

    const relevantFiles = files.filter((f) => issuesByFile[f.path])
    for (const file of relevantFiles) {
      prompt += `### ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\`\n\n`
    }

    return prompt
  }

  /**
   * Parse the fix response and update files
   *
   * @param {string} response - LLM response
   * @param {Array} files - Original files
   * @returns {Array} Updated files
   */
  parseFixResponse(response, files) {
    const fileMap = new Map(files.map((f) => [f.path, f.content]))

    // Extract file blocks from response
    const fileBlockRegex = /```file:([^\n]+)\n([\s\S]*?)```/g
    let match

    while ((match = fileBlockRegex.exec(response)) !== null) {
      const filePath = match[1].trim()
      const content = match[2]
      fileMap.set(filePath, content)
    }

    return files.map((f) => ({
      path: f.path,
      content: fileMap.get(f.path),
    }))
  }

  /**
   * Verify fixes by re-running review
   *
   * @param {Array} files - Fixed files
   * @returns {Promise<Object>} Verification results
   */
  async verifyFixes(files) {
    this.reportProgress('Verifying fixes...')
    const results = await this.orchestrator.runAllAgentsParallel(files)
    return this.orchestrator.aggregateResults(results)
  }
}
