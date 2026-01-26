import { program } from 'commander'
import { readFile } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { createAgentRegistry } from './agents/registry.js'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { PromptGenerator } from './orchestrator/prompt-generator.js'
import { discoverFiles, readFileContent } from './utils/file-utils.js'
import { createConfig } from './models/config.js'
import { FixerLoop } from './fixer/fixer-loop.js'

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
 */
async function loadFiles(targetPath, options = {}) {
  const absolutePath = resolve(targetPath)
  const filePaths = await discoverFiles(absolutePath, {
    pattern: options.pattern || '**/*.{js,ts,jsx,tsx,mjs,cjs}',
    ignore: options.ignore || [],
  })

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
    .option('--fix', 'Enable auto-fix loop', false)
    .option('--max-fix-iterations <n>', 'Maximum fix iterations', '5')
    .option(
      '--dry-run',
      'Show what would be done without making changes',
      false,
    )
    .option('--json', 'Output results as JSON', false)
    .option('--markdown', 'Output results as markdown', false)
    .action(async (targetPath, options) => {
      try {
        // Load configuration
        const config = await loadConfig(options.config)

        // Initialize Anthropic client
        const client = new Anthropic()

        // Create agent registry with client
        const promptsDir = join(__dirname, '..', 'prompts')
        const registry = createAgentRegistry({ promptsDir, client })

        // Create orchestrator
        const orchestrator = new Orchestrator(registry, config)

        // Set up progress reporting
        if (options.verbose) {
          orchestrator.setProgressCallback(({ message }) => {
            console.log(`[progress] ${message}`)
          })
        }

        // Load files
        if (options.verbose) {
          console.log(`Loading files from ${targetPath}...`)
        }
        const files = await loadFiles(targetPath)
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
        } else if (options.mode === 'loop' || options.fix) {
          // Loop mode
          const maxIterations = parseInt(options.maxFixIterations, 10)

          if (options.fix && !options.dryRun) {
            // Full fix loop with corrections
            const fixer = new FixerLoop(orchestrator, client, {
              maxIterations,
              dryRun: options.dryRun,
            })

            if (options.verbose) {
              fixer.setProgressCallback(({ message }) => {
                console.log(`[fixer] ${message}`)
              })
            }

            aggregated = await fixer.run(files)
          } else {
            // Review-only loop
            aggregated = await orchestrator.runLoop(files, {
              maxIterations,
              parallel: options.parallel,
            })
          }
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
          const correctionText = generator.formatForCodingAgent(
            aggregated.results,
          )

          if (options.verbose) {
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

  await program.parseAsync(process.argv)
}
