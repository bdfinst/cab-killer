import { program } from 'commander'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentRegistry } from './agents/registry.js'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { PromptGenerator } from './orchestrator/prompt-generator.js'
import {
  discoverFiles,
  readFileContent,
  filterByExtension,
} from './utils/file-utils.js'
import {
  isGitRepo,
  getChangedFiles,
  getChangedFilesSinceRef,
} from './utils/git-utils.js'
import { createConfig } from './models/config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load configuration from file
 */
async function loadConfig(configPath) {
  if (!configPath) {
    return createConfig()
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const userConfig = JSON.parse(content)
    return createConfig(userConfig)
  } catch (error) {
    console.error(
      `Warning: Could not load config from ${configPath}:`,
      error.message,
    )
    return createConfig()
  }
}

/**
 * Load files from target path
 *
 * @param {string} targetPath - Path to scan
 * @param {Object} options
 * @param {string} [options.pattern] - Glob pattern for files
 * @param {string[]} [options.ignore] - Patterns to ignore
 * @param {boolean} [options.changedOnly] - Only include files changed since last commit
 * @param {string} [options.since] - Git ref to compare against (for changed files)
 */
async function loadFiles(targetPath, options = {}) {
  const absolutePath = resolve(targetPath)
  let filePaths

  if (options.changedOnly || options.since) {
    // Git diff mode - only changed files
    if (!isGitRepo(absolutePath)) {
      throw new Error('--changed requires a git repository')
    }

    if (options.since) {
      filePaths = getChangedFilesSinceRef(absolutePath, options.since)
    } else {
      filePaths = getChangedFiles(absolutePath)
    }

    // Filter to only code files
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']
    filePaths = filterByExtension(filePaths, codeExtensions)
  } else {
    // Full scan mode
    filePaths = await discoverFiles(absolutePath, {
      pattern: options.pattern || '**/*.{js,ts,jsx,tsx,mjs,cjs}',
      ignore: options.ignore || [],
    })
  }

  const files = []
  for (const filePath of filePaths) {
    const content = await readFileContent(filePath)
    if (content !== null) {
      files.push({
        path: filePath.replace(absolutePath + '/', ''),
        content,
      })
    }
  }

  return files
}

/**
 * Format results for console output
 */
function formatConsoleOutput(aggregated, verbose) {
  let output = '\n'
  output += '═'.repeat(60) + '\n'
  output += '  CODE REVIEW RESULTS\n'
  output += '═'.repeat(60) + '\n\n'

  const statusEmoji =
    aggregated.overallStatus === 'pass'
      ? '✓'
      : aggregated.overallStatus === 'warn'
        ? '!'
        : '✗'

  output += `Status: ${statusEmoji} ${aggregated.overallStatus.toUpperCase()}\n`
  output += `Agents: ${aggregated.passed} passed, ${aggregated.warned} warned, ${aggregated.failed} failed\n`
  output += `Issues: ${aggregated.totalIssues} total\n\n`

  if (aggregated.iterations) {
    output += `Loop iterations: ${aggregated.iterations}/${aggregated.maxIterations}\n\n`
  }

  for (const result of aggregated.results) {
    const emoji =
      result.status === 'pass' ? '✓' : result.status === 'warn' ? '!' : '✗'
    output += `${emoji} ${result.agentName}: ${result.summary}\n`

    if (verbose && result.issues.length > 0) {
      for (const issue of result.issues) {
        output += `  - [${issue.severity}] ${issue.file}:${issue.line} - ${issue.message}\n`
      }
    }
  }

  output += '\n' + '═'.repeat(60) + '\n'
  return output
}

/**
 * Format results as markdown report
 */
function formatMarkdownReport(aggregated) {
  let md = '# Code Review Report\n\n'

  const statusEmoji =
    aggregated.overallStatus === 'pass'
      ? '✅'
      : aggregated.overallStatus === 'warn'
        ? '⚠️'
        : '❌'

  md += `## Summary\n\n`
  md += `- **Status**: ${statusEmoji} ${aggregated.overallStatus.toUpperCase()}\n`
  md += `- **Agents**: ${aggregated.passed} passed, ${aggregated.warned} warned, ${aggregated.failed} failed\n`
  md += `- **Total Issues**: ${aggregated.totalIssues}\n\n`

  if (aggregated.iterations) {
    md += `- **Loop Iterations**: ${aggregated.iterations}/${aggregated.maxIterations}\n\n`
  }

  md += `## Agent Results\n\n`

  for (const result of aggregated.results) {
    const emoji =
      result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
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

/**
 * Main CLI entry point
 */
export async function main() {
  const pkg = JSON.parse(
    await readFile(join(__dirname, '..', 'package.json'), 'utf-8'),
  )

  program
    .name('cab-killer')
    .description('Multi-agent code review system')
    .version(pkg.version)
    .argument('[path]', 'Path to code directory to review', '.')
    .option('-a, --agent <name>', 'Run a specific agent only')
    .option('-m, --mode <mode>', 'Execution mode: single, all, loop', 'all')
    .option('-p, --parallel', 'Run agents in parallel', false)
    .option('-o, --output <file>', 'Output results to file')
    .option('-c, --config <file>', 'Path to config file')
    .option('-v, --verbose', 'Show detailed output', false)
    .option('--max-iterations <n>', 'Maximum loop iterations', '5')
    .option('--json', 'Output results as JSON', false)
    .option('--markdown', 'Output results as markdown', false)
    .option(
      '--prompts-output <dir>',
      'Save correction prompts to directory (one file per prompt) for independent agents',
    )
    .option(
      '--changed',
      'Only review files changed since last commit (requires git)',
      false,
    )
    .option(
      '--since <ref>',
      'Only review files changed since git ref (e.g., main, HEAD~3)',
    )
    .action(async (targetPath, options) => {
      try {
        // Load configuration
        const config = await loadConfig(options.config)

        // Create agent registry (uses Claude Code CLI)
        const promptsDir = join(__dirname, '..', 'prompts')
        const registry = createAgentRegistry({ promptsDir })

        // Create orchestrator
        const orchestrator = new Orchestrator(registry, config)

        // Set up progress reporting
        if (options.verbose) {
          orchestrator.setProgressCallback(({ message }) => {
            console.log(`[progress] ${message}`)
          })
        }

        // Load files
        const scanMode = options.changed
          ? 'changed files'
          : options.since
            ? `files changed since ${options.since}`
            : 'all files'
        if (options.verbose) {
          console.log(`Loading ${scanMode} from ${targetPath}...`)
        }
        const files = await loadFiles(targetPath, {
          changedOnly: options.changed,
          since: options.since,
        })
        if (options.verbose) {
          console.log(`Found ${files.length} files`)
        }

        if (files.length === 0) {
          console.log('No files found to review.')
          process.exit(0)
        }

        let aggregated

        // Execute based on mode
        if (options.agent) {
          // Single agent mode
          const result = await orchestrator.runSingleAgent(options.agent, files)
          aggregated = orchestrator.aggregateResults([result])
        } else if (options.mode === 'loop') {
          // Loop mode - review until no issues or max iterations
          const maxIterations = parseInt(options.maxIterations, 10)
          aggregated = await orchestrator.runLoop(files, {
            maxIterations,
            parallel: options.parallel,
          })
        } else if (options.parallel) {
          // Parallel mode
          const results = await orchestrator.runAllAgentsParallel(files)
          aggregated = orchestrator.aggregateResults(results)
        } else {
          // Sequential mode (default)
          const results = await orchestrator.runAllAgents(files)
          aggregated = orchestrator.aggregateResults(results)
        }

        // Format output
        let output
        if (options.json) {
          output = JSON.stringify(aggregated, null, 2)
        } else if (options.markdown) {
          output = formatMarkdownReport(aggregated)
        } else {
          output = formatConsoleOutput(aggregated, options.verbose)
        }

        // Write output
        if (options.output) {
          await writeFile(options.output, output, 'utf-8')
          console.log(`Results written to ${options.output}`)
        } else {
          console.log(output)
        }

        // Generate correction prompts if there are issues
        if (aggregated.totalIssues > 0 && !options.fix) {
          const generator = new PromptGenerator()
          const prompts = generator.generate(aggregated.results)

          if (options.promptsOutput) {
            // Save each prompt as a separate file for independent agents
            await mkdir(options.promptsOutput, { recursive: true })

            for (let i = 0; i < prompts.length; i++) {
              const prompt = prompts[i]
              const filename = `${String(i + 1).padStart(3, '0')}-${prompt.category}.json`
              const filepath = join(options.promptsOutput, filename)
              await writeFile(filepath, JSON.stringify(prompt, null, 2), 'utf-8')
            }

            console.log(
              `${prompts.length} correction prompts written to ${options.promptsOutput}/`,
            )
          }

          if (options.verbose) {
            const correctionText = generator.formatForCodingAgent(
              aggregated.results,
            )
            console.log('\n--- Correction Prompts ---\n')
            console.log(correctionText)
          }
        }

        // Exit with appropriate code
        process.exit(aggregated.overallStatus === 'fail' ? 1 : 0)
      } catch (error) {
        console.error('Error:', error.message)
        if (options.verbose) {
          console.error(error.stack)
        }
        process.exit(1)
      }
    })

  // Subcommand to apply fixes from saved prompts
  program
    .command('apply-fixes')
    .description('Apply fixes from saved prompts using independent Claude agents')
    .argument('<prompts-dir>', 'Directory containing prompt JSON files')
    .option('-v, --verbose', 'Show detailed output')
    .option('-d, --dry', 'Show prompts without applying fixes')
    .action(async (promptsDir, options) => {
      const { FixOrchestrator } = await import('./fixer/fix-orchestrator.js')

      try {
        const orchestrator = new FixOrchestrator({
          dryRun: options.dry || false,
          verbose: options.verbose || false,
        })

        const result = await orchestrator.applyFixes(promptsDir)

        console.log('\n' + '='.repeat(60))
        console.log(`  Total prompts: ${result.total}`)
        console.log(`  Applied: ${result.applied}`)
        console.log(`  Skipped: ${result.skipped}`)
        console.log(`  Failed: ${result.failed}`)
        console.log('='.repeat(60))

        process.exit(result.failed > 0 ? 1 : 0)
      } catch (error) {
        console.error('Error:', error.message)
        if (options.verbose) {
          console.error(error.stack)
        }
        process.exit(1)
      }
    })

  await program.parseAsync(process.argv)
}
