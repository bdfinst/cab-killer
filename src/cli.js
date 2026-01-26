import { program } from 'commander'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentRegistry } from './agents/registry.js'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { PromptGenerator } from './orchestrator/prompt-generator.js'
import { loadChangedFiles, loadAllFiles } from './utils/file-utils.js'
import { loadConfig } from './utils/config-loader.js'
import {
  formatConsoleOutput,
  formatMarkdownReport,
} from './formatters/output-formatter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load and validate files for review
 */
async function loadAndValidateFiles(targetPath, options) {
  const useChangedMode = options.changed || options.since
  const scanMode = options.changed
    ? 'changed files'
    : options.since
      ? `files changed since ${options.since}`
      : 'all files'
  if (options.verbose) {
    console.log(`Loading ${scanMode} from ${targetPath}...`)
  }
  const files = useChangedMode
    ? await loadChangedFiles(targetPath, { since: options.since })
    : await loadAllFiles(targetPath)
  if (options.verbose) {
    console.log(`Found ${files.length} files`)
  }
  return files
}

/**
 * Mode handlers for different execution strategies
 */
const modeHandlers = {
  async single(orchestrator, files, _options) {
    const results = await orchestrator.runAllAgents(files)
    return orchestrator.aggregateResults(results)
  },
  async loop(orchestrator, files, options) {
    const maxIterations = parseInt(options.maxIterations, 10)
    return await orchestrator.runLoop(files, {
      maxIterations,
      parallel: options.parallel,
    })
  },
  async parallel(orchestrator, files, _options) {
    const results = await orchestrator.runAllAgentsParallel(files)
    return orchestrator.aggregateResults(results)
  },
}

/**
 * Execute review based on mode and options
 */
async function executeReviewMode(orchestrator, files, options) {
  // Single agent mode takes precedence
  if (options.agent) {
    const result = await orchestrator.runSingleAgent(options.agent, files)
    return orchestrator.aggregateResults([result])
  }

  // Determine execution mode
  const mode = options.parallel ? 'parallel' : (options.mode || 'single')
  const handler = modeHandlers[mode] || modeHandlers.single
  return handler(orchestrator, files, options)
}

/**
 * Output formatters lookup
 */
const formatters = {
  json: (aggregated) => JSON.stringify(aggregated, null, 2),
  markdown: (aggregated) => formatMarkdownReport(aggregated),
  console: (aggregated, verbose) => formatConsoleOutput(aggregated, verbose),
}

/**
 * Format and output results
 */
async function formatAndOutputResults(aggregated, options) {
  const formatType = options.json ? 'json' : options.markdown ? 'markdown' : 'console'
  const output = formatters[formatType](aggregated, options.verbose)

  if (options.output) {
    await writeFile(options.output, output, 'utf-8')
    console.log(`Results written to ${options.output}`)
  } else {
    console.log(output)
  }
}

/**
 * Generate and save correction prompts
 */
async function generateCorrectionPrompts(aggregated, options) {
  if (aggregated.totalIssues === 0 || options.fix) {
    return
  }

  const generator = new PromptGenerator()
  const prompts = generator.generate(aggregated.results)

  if (options.promptsOutput) {
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
    const correctionText = generator.formatForCodingAgent(aggregated.results)
    console.log('\n--- Correction Prompts ---\n')
    console.log(correctionText)
  }
}

/**
 * Handle the main review command
 */
async function handleReviewCommand(targetPath, options) {
  const config = await loadConfig(options.config)
  const promptsDir = join(__dirname, '..', 'prompts')
  const registry = createAgentRegistry({ promptsDir })
  const orchestrator = new Orchestrator(registry, config)

  if (options.verbose) {
    orchestrator.setProgressCallback(({ message }) => {
      console.log(`[progress] ${message}`)
    })
  }

  const files = await loadAndValidateFiles(targetPath, options)

  if (files.length === 0) {
    console.log('No files found to review.')
    process.exit(0)
  }

  const aggregated = await executeReviewMode(orchestrator, files, options)
  await formatAndOutputResults(aggregated, options)
  await generateCorrectionPrompts(aggregated, options)

  process.exit(aggregated.overallStatus === 'fail' ? 1 : 0)
}

/**
 * Handle the apply-fixes subcommand
 */
async function handleApplyFixesCommand(promptsDir, options) {
  const { FixOrchestrator } = await import('./fixer/fix-orchestrator.js')

  const orchestrator = new FixOrchestrator({
    dryRun: options.dry || false,
    verbose: options.verbose || false,
  })

  const result = await orchestrator.applyFixes(promptsDir)
  const report = orchestrator.generateReport(result)
  console.log(report)

  process.exit(result.failed > 0 ? 1 : 0)
}

/**
 * Main CLI entry point
 */
export async function main() {
  const packageJson = JSON.parse(
    await readFile(join(__dirname, '..', 'package.json'), 'utf-8'),
  )

  program
    .name('cab-killer')
    .description('Multi-agent code review system')
    .version(packageJson.version)
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
        await handleReviewCommand(targetPath, options)
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
      try {
        await handleApplyFixesCommand(promptsDir, options)
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
