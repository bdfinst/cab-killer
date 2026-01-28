import { BaseReviewAgent } from './base-agent.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Token Efficiency Review Agent
 *
 * Evaluates Claude configuration and code structure for token optimization:
 * - CLAUDE.md verbosity and structure
 * - Rules conciseness and redundancy
 * - Skills optimization
 * - Code organization for minimal context loading
 * - Documentation placement (inline vs. external)
 */
export class TokenEfficiencyReviewAgent extends BaseReviewAgent {
  constructor(config = {}) {
    super('token-efficiency');
    this.maxClaudeMdLength = config.maxClaudeMdLength || 5000;
    this.maxFileLength = config.maxFileLength || 500;
    this.maxFunctionLength = config.maxFunctionLength || 50;
  }

  async review(files) {
    const issues = [];

    // Find and review CLAUDE.md
    const claudeMdIssues = this.reviewClaudeMd(files);
    issues.push(...claudeMdIssues);

    // Review rules files
    const rulesIssues = this.reviewRules(files);
    issues.push(...rulesIssues);

    // Review skills
    const skillsIssues = this.reviewSkills(files);
    issues.push(...skillsIssues);

    // Review code structure
    const codeIssues = this.reviewCodeStructure(files);
    issues.push(...codeIssues);

    // Review documentation placement
    const docIssues = this.reviewDocumentation(files);
    issues.push(...docIssues);

    // Determine status
    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');
    const status = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';

    const summary = issues.length === 0
      ? 'No token efficiency issues found'
      : `Found ${issues.length} token efficiency issue${issues.length === 1 ? '' : 's'}`;

    return this.formatResult({ status, issues, summary });
  }

  reviewClaudeMd(files) {
    const issues = [];
    const claudeMd = files.find(f =>
      typeof f === 'string'
        ? f.endsWith('CLAUDE.md') || f.endsWith('claude.md')
        : f.path && (f.path.endsWith('CLAUDE.md') || f.path.endsWith('claude.md'))
    );

    if (!claudeMd) {
      return issues;
    }

    const filePath = typeof claudeMd === 'string' ? claudeMd : claudeMd.path;
    if (!existsSync(filePath)) {
      return issues;
    }

    const content = readFileSync(filePath, 'utf-8');

    // Check overall length
    if (content.length > this.maxClaudeMdLength) {
      issues.push(this.createIssue({
        severity: 'warning',
        file: filePath,
        line: 1,
        message: `CLAUDE.md is ${content.length} characters (>${this.maxClaudeMdLength}). Consider moving detailed examples to separate docs.`,
        suggestedFix: 'Split into CLAUDE.md (core instructions) and docs/ (detailed examples)'
      }));
    }

    // Check for verbose examples
    const codeBlockCount = (content.match(/```/g) || []).length / 2;
    if (codeBlockCount > 10) {
      issues.push(this.createIssue({
        severity: 'warning',
        file: filePath,
        line: 1,
        message: `CLAUDE.md contains ${codeBlockCount} code examples. Excessive examples increase token usage.`,
        suggestedFix: 'Keep only essential examples, move others to external documentation'
      }));
    }

    // Check for repetitive sections
    const sections = content.split(/^##\s+/m).filter(s => s.trim());
    const sectionHeaders = sections.map(s => s.split('\n')[0].toLowerCase().trim());
    const duplicates = sectionHeaders.filter((h, i) => sectionHeaders.indexOf(h) !== i);
    if (duplicates.length > 0) {
      issues.push(this.createIssue({
        severity: 'warning',
        file: filePath,
        line: 1,
        message: `Duplicate sections found: ${duplicates.join(', ')}`,
        suggestedFix: 'Consolidate duplicate sections to reduce redundancy'
      }));
    }

    // Check for overly detailed command documentation
    const commandSections = content.match(/```bash[\s\S]*?```/g) || [];
    for (const cmdBlock of commandSections) {
      const cmdLines = cmdBlock.split('\n').filter(l => l.trim() && !l.includes('```'));
      if (cmdLines.length > 20) {
        issues.push(this.createIssue({
          severity: 'suggestion',
          file: filePath,
          line: 1,
          message: 'Command documentation is very detailed. Consider linking to package.json or scripts/ instead.',
          suggestedFix: 'Replace verbose command lists with "See package.json scripts" or create a scripts/README.md'
        }));
        break;
      }
    }

    // Check for redundant architecture diagrams
    const lines = content.split('\n');
    const asciiArtLines = lines.filter(l =>
      l.includes('┌') || l.includes('│') || l.includes('└') || l.includes('▼')
    );
    if (asciiArtLines.length > 15) {
      issues.push(this.createIssue({
        severity: 'suggestion',
        file: filePath,
        line: 1,
        message: 'Large ASCII diagrams consume tokens without adding much context.',
        suggestedFix: 'Replace with concise bullet-point descriptions or link to external diagrams'
      }));
    }

    // Check for workflow instructions that should be skills
    const workflowKeywords = ['step 1', 'step 2', 'first,', 'then,', 'finally,', 'procedure:'];
    const workflowMatches = workflowKeywords.filter(kw =>
      content.toLowerCase().includes(kw)
    );
    if (workflowMatches.length > 3) {
      issues.push(this.createIssue({
        severity: 'warning',
        file: filePath,
        line: 1,
        message: 'Multi-step workflows detected in CLAUDE.md. These should be converted to skills.',
        suggestedFix: 'Extract step-by-step procedures into skill definitions in .claude/skills/'
      }));
    }

    return issues;
  }

  reviewRules(files) {
    const issues = [];
    const rulesFiles = files.filter(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && (
        path.endsWith('.clinerules') ||
        path.includes('.claude/rules/') ||
        path.endsWith('CONTRIBUTING.md')
      );
    });

    for (const rulesFile of rulesFiles) {
      const filePath = typeof rulesFile === 'string' ? rulesFile : rulesFile.path;
      if (!existsSync(filePath)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for overly verbose rules
      const ruleLines = lines.filter(l =>
        l.trim().startsWith('-') ||
        l.trim().match(/^\d+\./)
      );

      for (let i = 0; i < ruleLines.length; i++) {
        const rule = ruleLines[i];
        if (rule.length > 200) {
          const lineNum = lines.indexOf(rule) + 1;
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: lineNum,
            message: 'Rule is very verbose (>200 chars). Concise rules are more effective.',
            suggestedFix: 'Split into multiple focused rules or simplify the wording'
          }));
        }
      }

      // Check for duplicate rules
      const ruleTrimmed = ruleLines.map(r => r.replace(/^[-\d.)\s]+/, '').trim().toLowerCase());
      const seen = new Set();
      for (let i = 0; i < ruleTrimmed.length; i++) {
        if (seen.has(ruleTrimmed[i])) {
          const lineNum = lines.indexOf(ruleLines[i]) + 1;
          issues.push(this.createIssue({
            severity: 'warning',
            file: filePath,
            line: lineNum,
            message: 'Duplicate or very similar rule detected',
            suggestedFix: 'Remove redundant rule to save tokens'
          }));
        }
        seen.add(ruleTrimmed[i]);
      }

      // Check for example-heavy rules
      const exampleCount = (content.match(/example:/gi) || []).length;
      if (exampleCount > 5) {
        issues.push(this.createIssue({
          severity: 'suggestion',
          file: filePath,
          line: 1,
          message: `Rules contain ${exampleCount} examples. Examples are token-heavy.`,
          suggestedFix: 'Keep only the most illustrative examples, remove obvious ones'
        }));
      }
    }

    return issues;
  }

  reviewSkills(files) {
    const issues = [];
    const skillFiles = files.filter(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && path.includes('.claude/skills/');
    });

    // Check if common workflows are missing skills
    const hasCommitSkill = skillFiles.some(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && path.includes('commit');
    });
    const hasTestSkill = skillFiles.some(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && path.includes('test');
    });
    const hasDeploySkill = skillFiles.some(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && path.includes('deploy');
    });

    const claudeMd = files.find(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && path.endsWith('CLAUDE.md');
    });

    if (claudeMd) {
      const filePath = typeof claudeMd === 'string' ? claudeMd : claudeMd.path;
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');

        if (!hasCommitSkill && content.toLowerCase().includes('git commit')) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: 1,
            message: 'Git commit instructions in CLAUDE.md could be a skill to save tokens on repeated commits',
            suggestedFix: 'Create .claude/skills/commit.md to extract commit workflow'
          }));
        }

        if (!hasTestSkill && content.toLowerCase().includes('run test')) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: 1,
            message: 'Test instructions in CLAUDE.md could be a skill',
            suggestedFix: 'Create .claude/skills/test.md for test workflow'
          }));
        }

        if (!hasDeploySkill && content.toLowerCase().includes('deploy')) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: 1,
            message: 'Deployment instructions in CLAUDE.md could be a skill',
            suggestedFix: 'Create .claude/skills/deploy.md for deployment workflow'
          }));
        }
      }
    }

    // Review existing skills for verbosity
    for (const skillFile of skillFiles) {
      const filePath = typeof skillFile === 'string' ? skillFile : skillFile.path;
      if (!existsSync(filePath)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');

      if (content.length > 2000) {
        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: 1,
          message: `Skill definition is ${content.length} chars. Skills should be concise invocation instructions.`,
          suggestedFix: 'Remove background info and keep only action steps'
        }));
      }
    }

    return issues;
  }

  reviewCodeStructure(files) {
    const issues = [];
    const codeFiles = files.filter(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && (
        path.endsWith('.js') ||
        path.endsWith('.ts') ||
        path.endsWith('.jsx') ||
        path.endsWith('.tsx')
      );
    });

    for (const file of codeFiles) {
      const filePath = typeof file === 'string' ? file : file.path;
      if (!existsSync(filePath)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check file length
      if (lines.length > this.maxFileLength) {
        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: 1,
          message: `File is ${lines.length} lines (>${this.maxFileLength}). Large files require more context tokens.`,
          suggestedFix: 'Split into smaller, focused modules'
        }));
      }

      // Check for long functions
      const functions = this.extractFunctions(content);
      for (const func of functions) {
        if (func.lineCount > this.maxFunctionLength) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: func.startLine,
            message: `Function '${func.name}' is ${func.lineCount} lines. Long functions require more context.`,
            suggestedFix: 'Extract helper functions or split into smaller units'
          }));
        }
      }

      // Check for deeply nested code
      const maxIndent = Math.max(...lines.map(l => (l.match(/^\s*/)[0].length / 2)));
      if (maxIndent > 5) {
        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: 1,
          message: `Deep nesting detected (${maxIndent} levels). Flat code is more token-efficient.`,
          suggestedFix: 'Extract nested logic into separate functions or use early returns'
        }));
      }

      // Check for repeated code patterns
      const duplicateBlocks = this.findDuplicateBlocks(lines);
      if (duplicateBlocks.length > 0) {
        for (const dup of duplicateBlocks.slice(0, 3)) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: dup.line,
            message: `Duplicate code block detected (~${dup.lines} lines). Repetition increases context size.`,
            suggestedFix: 'Extract into a shared function or utility'
          }));
        }
      }
    }

    return issues;
  }

  reviewDocumentation(files) {
    const issues = [];
    const codeFiles = files.filter(f => {
      const path = typeof f === 'string' ? f : f.path;
      return path && (
        path.endsWith('.js') ||
        path.endsWith('.ts') ||
        path.endsWith('.jsx') ||
        path.endsWith('.tsx')
      );
    });

    for (const file of codeFiles) {
      const filePath = typeof file === 'string' ? file : file.path;
      if (!existsSync(filePath)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for verbose JSDoc comments
      const jsdocBlocks = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
      for (const block of jsdocBlocks) {
        const blockLines = block.split('\n').length;
        if (blockLines > 15) {
          const lineNum = content.substring(0, content.indexOf(block)).split('\n').length;
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: lineNum,
            message: `JSDoc comment is ${blockLines} lines. Verbose inline docs increase token load.`,
            suggestedFix: 'Move detailed documentation to external .md files, keep only essential info'
          }));
        }
      }

      // Check for tutorial-style comments
      const tutorialKeywords = ['example:', 'for example', 'note:', 'important:', 'explanation:'];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        const hasKeyword = tutorialKeywords.some(kw => line.includes(kw));
        if (hasKeyword && (line.includes('//') || line.includes('*'))) {
          issues.push(this.createIssue({
            severity: 'suggestion',
            file: filePath,
            line: i + 1,
            message: 'Tutorial-style comments belong in external documentation, not source code',
            suggestedFix: 'Move to docs/ folder and link in README if needed'
          }));
          break;
        }
      }

      // Check for commented-out code
      const commentedCodeLines = lines.filter(l => {
        const trimmed = l.trim();
        return trimmed.startsWith('//') &&
               (trimmed.includes('function') ||
                trimmed.includes('const') ||
                trimmed.includes('if (') ||
                trimmed.includes('return'));
      });

      if (commentedCodeLines.length > 5) {
        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: 1,
          message: `${commentedCodeLines.length} lines of commented-out code detected. Dead code wastes tokens.`,
          suggestedFix: 'Remove commented code or move to git history'
        }));
      }
    }

    return issues;
  }

  extractFunctions(content) {
    const functions = [];
    const lines = content.split('\n');
    const functionRegex = /^\s*(async\s+)?function\s+(\w+)|^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|^\s*(\w+)\s*\([^)]*\)\s*\{/;

    let currentFunction = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(functionRegex);

      if (match && !currentFunction) {
        const name = match[2] || match[3] || match[4] || 'anonymous';
        currentFunction = {
          name,
          startLine: i + 1,
          lineCount: 0
        };
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      } else if (currentFunction) {
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        currentFunction.lineCount++;

        if (braceCount === 0) {
          functions.push(currentFunction);
          currentFunction = null;
        }
      }
    }

    return functions;
  }

  findDuplicateBlocks(lines, minBlockSize = 5) {
    const duplicates = [];
    const blockMap = new Map();

    for (let i = 0; i < lines.length - minBlockSize; i++) {
      const block = lines.slice(i, i + minBlockSize)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && !l.startsWith('*'))
        .join('\n');

      if (block.length < 50) {
        continue;
      }

      if (blockMap.has(block)) {
        duplicates.push({
          line: i + 1,
          lines: minBlockSize,
          originalLine: blockMap.get(block)
        });
      } else {
        blockMap.set(block, i + 1);
      }
    }

    return duplicates;
  }
}

export default TokenEfficiencyReviewAgent;
