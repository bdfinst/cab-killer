import { BaseReviewAgent } from './base-agent.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Functional Programming Review Agent
 *
 * Detects mutation patterns in code that should be purely functional:
 * - let usage where const should be used
 * - Variable reassignments
 * - Array mutations (push, pop, shift, unshift, splice, reverse, sort)
 * - Object mutations on function parameters
 * - Direct property assignments on external state
 */
export class FPReviewAgent extends BaseReviewAgent {
  constructor(config = {}) {
    super('fp-review');
    this.allowedMutablePrefixes = config.allowedMutablePrefixes || ['mut', 'mutable', '_'];
    this.strictMode = config.strictMode !== false;
  }

  async review(files) {
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

      // Analyze let vs const usage
      const letIssues = this.analyzeLetUsage(lines, filePath);
      issues.push(...letIssues);

      // Detect array mutations
      const arrayMutationIssues = this.analyzeArrayMutations(lines, filePath);
      issues.push(...arrayMutationIssues);

      // Detect object mutations on parameters
      const paramMutationIssues = this.analyzeParameterMutations(content, lines, filePath);
      issues.push(...paramMutationIssues);

      // Detect reassignments
      const reassignmentIssues = this.analyzeReassignments(content, lines, filePath);
      issues.push(...reassignmentIssues);

      // Detect global/external state mutations
      const stateMutationIssues = this.analyzeStateMutations(content, lines, filePath);
      issues.push(...stateMutationIssues);
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');
    const status = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';

    const summary = issues.length === 0
      ? 'No functional programming violations found'
      : `Found ${issues.length} mutation/FP issue${issues.length === 1 ? '' : 's'}`;

    return this.formatResult({ status, issues, summary });
  }

  /**
   * Analyze let declarations that could be const
   */
  analyzeLetUsage(lines, filePath) {
    const issues = [];
    const letDeclarations = [];

    // First pass: find all let declarations
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const letMatch = line.match(/\blet\s+(\w+)\s*(?:=|;|,)/g);

      if (letMatch) {
        for (const match of letMatch) {
          const varMatch = match.match(/\blet\s+(\w+)/);
          if (varMatch) {
            const varName = varMatch[1];

            // Skip if variable name indicates intentional mutability
            if (this.isAllowedMutable(varName)) {
              continue;
            }

            letDeclarations.push({
              name: varName,
              line: i + 1,
              isReassigned: false
            });
          }
        }
      }
    }

    // Second pass: check if let variables are actually reassigned
    const content = lines.join('\n');
    for (const decl of letDeclarations) {
      // Look for reassignment patterns: varName = (not ==, ===, or part of let/const/var declaration)
      // Use word boundary and check for assignment operators
      const reassignPattern = new RegExp(
        `(?:^|[^\\w])${decl.name}\\s*(?:\\+\\+|--|[+\\-*/|&^%]?=(?!=))`,
        'gm'
      );

      const matches = content.match(reassignPattern) || [];

      // Count how many times the variable is assigned (excluding the let declaration line)
      // The let declaration has the form "let varName =" which we need to exclude
      const letDeclPattern = new RegExp(`\\blet\\s+${decl.name}\\s*=`);
      const hasLetDecl = letDeclPattern.test(content);

      // If there's only the let declaration assignment and no other reassignments, flag it
      const reassignmentCount = hasLetDecl ? matches.length - 1 : matches.length;

      if (reassignmentCount === 0) {
        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: decl.line,
          message: `Variable '${decl.name}' declared with 'let' but never reassigned. Use 'const' instead.`,
          suggestedFix: `Change 'let ${decl.name}' to 'const ${decl.name}'`
        }));
      }
    }

    return issues;
  }

  /**
   * Detect mutating array methods
   */
  analyzeArrayMutations(lines, filePath) {
    const issues = [];
    const mutatingMethods = [
      'push',
      'pop',
      'shift',
      'unshift',
      'splice',
      'reverse',
      'sort',
      'fill',
      'copyWithin'
    ];

    const mutatingPattern = new RegExp(
      `\\.(${mutatingMethods.join('|')})\\s*\\(`,
      'g'
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = [...line.matchAll(mutatingPattern)];

      for (const match of matches) {
        const method = match[1];

        // Check if it's on a spread or new array (allowed)
        const beforeMatch = line.substring(0, match.index);
        if (beforeMatch.includes('[...') || beforeMatch.includes('Array.from')) {
          continue;
        }

        // For sort/reverse, check if it's on a spread copy
        if ((method === 'sort' || method === 'reverse') && beforeMatch.match(/\[\s*\.\.\..*\]\s*$/)) {
          continue;
        }

        // Extract the variable being mutated
        const varMatch = beforeMatch.match(/(\w+)\s*$/);
        const varName = varMatch ? varMatch[1] : 'array';

        // Skip if variable name indicates intentional mutability
        if (this.isAllowedMutable(varName)) {
          continue;
        }

        issues.push(this.createIssue({
          severity: 'warning',
          file: filePath,
          line: i + 1,
          message: `Mutating method '${method}()' used on '${varName}'. This modifies the array in place.`,
          suggestedFix: this.getSuggestedFix(method, varName)
        }));
      }
    }

    return issues;
  }

  /**
   * Detect mutations on function parameters
   */
  analyzeParameterMutations(content, lines, filePath) {
    const issues = [];

    // Find all function parameters
    const functionPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function)?)\s*\(([^)]*)\)|(?:\(([^)]*)\)|(\w+))\s*=>/g;
    const params = new Set();

    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const paramStr = match[1] || match[2] || match[3] || '';
      const paramNames = paramStr
        .split(',')
        .map(p => p.trim().replace(/[=:].*/s, '').replace(/^\.\.\./, '').replace(/[{}[\]]/g, '').trim())
        .filter(p => p && !p.includes(' '));

      paramNames.forEach(p => params.add(p));
    }

    // Check for mutations on parameters
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const param of params) {
        if (!param || param.length < 2) {
          continue;
        }

        // Skip params that aren't valid identifiers (could be destructuring artifacts)
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param)) {
          continue;
        }

        // Check for direct property assignment: param.prop = value
        const propAssignPattern = new RegExp(`\\b${param}\\s*\\.\\s*\\w+\\s*=(?!=)`, 'g');
        if (propAssignPattern.test(line)) {
          // Skip if it's a common pattern like this.prop or self.prop
          if (param === 'this' || param === 'self') {
            continue;
          }

          issues.push(this.createIssue({
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Mutating parameter '${param}' by assigning to its property. This violates immutability.`,
            suggestedFix: `Create a new object: { ...${param}, property: newValue }`
          }));
        }

        // Check for bracket assignment: param[key] = value
        const bracketAssignPattern = new RegExp(`\\b${param}\\s*\\[.*\\]\\s*=(?!=)`, 'g');
        if (bracketAssignPattern.test(line)) {
          issues.push(this.createIssue({
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Mutating parameter '${param}' via bracket assignment. This modifies the original object.`,
            suggestedFix: `Create a new object/array instead of mutating`
          }));
        }

        // Check for delete on parameter properties
        const deletePattern = new RegExp(`\\bdelete\\s+${param}\\s*[.\\[]`, 'g');
        if (deletePattern.test(line)) {
          issues.push(this.createIssue({
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Using 'delete' on parameter '${param}' mutates the original object.`,
            suggestedFix: `Destructure to omit the property: const { propToRemove, ...rest } = ${param}`
          }));
        }
      }
    }

    return issues;
  }

  /**
   * Detect variable reassignments (compound assignments, increment, decrement)
   */
  analyzeReassignments(content, lines, filePath) {
    const issues = [];

    // Find all const declarations to avoid false positives
    const constVars = new Set();
    const constPattern = /\bconst\s+(\w+)/g;
    let match;
    while ((match = constPattern.exec(content)) !== null) {
      constVars.add(match[1]);
    }

    // Check for increment/decrement on non-loop variables
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip for loop headers
      if (line.match(/^\s*for\s*\(/)) {
        continue;
      }

      // Detect increment/decrement
      const incDecPattern = /(\w+)\s*(\+\+|--)/g;
      let incMatch;
      while ((incMatch = incDecPattern.exec(line)) !== null) {
        const varName = incMatch[1];

        // Skip if it's a const (will error anyway) or allowed mutable
        if (constVars.has(varName) || this.isAllowedMutable(varName)) {
          continue;
        }

        // Skip common loop counter names when inside loops
        if (['i', 'j', 'k', 'n', 'idx', 'index', 'count', 'counter'].includes(varName)) {
          continue;
        }

        issues.push(this.createIssue({
          severity: 'suggestion',
          file: filePath,
          line: i + 1,
          message: `Variable '${varName}' is mutated with ${incMatch[2]}. Consider using immutable patterns.`,
          suggestedFix: `Use 'const ${varName}New = ${varName} + 1' or functional approach`
        }));
      }
    }

    return issues;
  }

  /**
   * Detect mutations of external/global state
   */
  analyzeStateMutations(content, lines, filePath) {
    const issues = [];

    // Check for mutations of common global objects
    const globalPatterns = [
      { pattern: /\bwindow\s*\.\s*\w+\s*=(?!=)/g, name: 'window' },
      { pattern: /\bglobal\s*\.\s*\w+\s*=(?!=)/g, name: 'global' },
      { pattern: /\bglobalThis\s*\.\s*\w+\s*=(?!=)/g, name: 'globalThis' },
      { pattern: /\bprocess\.env\s*\.\s*\w+\s*=(?!=)/g, name: 'process.env' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, name } of globalPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          issues.push(this.createIssue({
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Mutating global state '${name}'. This creates side effects and breaks functional purity.`,
            suggestedFix: 'Use module-level state or dependency injection instead'
          }));
        }
      }
    }

    // Check for Object.assign to first argument being a variable (mutation)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const objectAssignMatch = line.match(/Object\.assign\s*\(\s*(\w+)\s*,/);
      if (objectAssignMatch) {
        const target = objectAssignMatch[1];
        // Skip if target is an empty object literal
        if (target !== '{}' && !this.isAllowedMutable(target)) {
          issues.push(this.createIssue({
            severity: 'warning',
            file: filePath,
            line: i + 1,
            message: `Object.assign mutates '${target}' in place.`,
            suggestedFix: `Use Object.assign({}, ${target}, ...) or spread: { ...${target}, ... }`
          }));
        }
      }
    }

    return issues;
  }

  /**
   * Check if variable name indicates intentional mutability
   */
  isAllowedMutable(varName) {
    if (!varName) {
      return false;
    }
    const lowerName = varName.toLowerCase();
    return this.allowedMutablePrefixes.some(prefix =>
      lowerName.startsWith(prefix.toLowerCase())
    );
  }

  /**
   * Get suggested fix for mutating array methods
   */
  getSuggestedFix(method, varName) {
    const fixes = {
      push: `Use spread: [...${varName}, newItem]`,
      pop: `Use slice: ${varName}.slice(0, -1) (get last with ${varName}.at(-1))`,
      shift: `Use slice: ${varName}.slice(1) (get first with ${varName}[0])`,
      unshift: `Use spread: [newItem, ...${varName}]`,
      splice: `Use slice and spread: [...${varName}.slice(0, i), ...${varName}.slice(j)]`,
      reverse: `Use spread then reverse: [...${varName}].reverse() or toReversed()`,
      sort: `Use spread then sort: [...${varName}].sort() or toSorted()`,
      fill: `Use map: ${varName}.map(() => value)`,
      copyWithin: `Use slice and spread to create a new array`
    };

    return fixes[method] || `Create a new array instead of mutating`;
  }
}

export default FPReviewAgent;
