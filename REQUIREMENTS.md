# Project Requirements

## Original Instructions

We are building a set of agents and an agent orchestrator to independently review code written by a coding agent. It should review the quality and effectiveness of test, code structure, naming clarity, domain separation, and code complexity. The result of each agent's review should be turned into a prompt to be addressed by the coding agent. The orchestrator should enable one review at a time or the ability to run in a loop until review comments are corrected.

## Technical Constraints

- Use vanilla JS (no TypeScript)

## Additional Agents

- There should also be an agent that reviews the project's Claude setup and suggests improvements to the content and structure of the CLAUDE.md as well as any rule or skill definitions.
