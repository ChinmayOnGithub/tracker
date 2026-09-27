---
name: debugger
description: Hypothesis-driven debugging skill for diagnosing issues in the codebase. Use when the user reports a bug, unexpected behavior, error, or issue they cannot understand. Triggers on phrases like "debug", "why is this happening", "not working", "investigate", "figure out why", "bug", "issue", "problem", "error", or any description of unexpected application behavior.
license: MIT
compatibility: Requires a centralized logger with agent-prefixed logging support and .agent.debug.log file output capability.
metadata:
  author: AIGIS Solutions
  version: "1.0.0"
  created: "2026-01-19"
---

# Debugger

Systematic hypothesis-driven debugging using instrumented logging with `[Agent]` prefix.

## Workflow

### Phase 1: Understand the Problem

1. Ask clarifying questions if the problem description is vague
2. Identify affected areas of code (components, services, hooks, etc.)
3. Read relevant source files to understand the flow

### Phase 2: Generate Hypotheses

Generate **at least 3 hypotheses** for the root cause. Format:

```
## Hypotheses

### H1: [Short title]
**Likelihood**: High/Medium/Low
**Reasoning**: [Why this could be the cause]
**Code path**: [Files and functions involved]
**What to verify**: [What evidence would confirm/reject]

### H2: [Short title]
...

### H3: [Short title]
...
```

### Phase 3: Instrument with Debug Statements

Insert debug statements using the centralized logger with `[Agent]` prefix:

```typescript
import { logger } from '@/utils/logger';

// Create an agent logger for debugging
const agentLogger = logger.agent('Debugger');

// Use in the code to trace execution
agentLogger.debug('Entering function X', { param1, param2 });
agentLogger.info('State at checkpoint', { state });
agentLogger.warn('Unexpected condition', { condition });
```

**Instrumentation guidelines:**
- Add logs at function entry/exit points relevant to hypotheses
- Log state values that could reveal the issue
- Log conditional branch decisions
- Use descriptive messages that reference the hypothesis being tested
- Example: `agentLogger.debug('[H1] Checking if user is authenticated', { isAuth });`

### Phase 4: Clear Logs and Request Reproduction

After instrumenting, clear the agent debug log:

```bash
echo "" > .agent.debug.log
```

Then ask the user:

> I've added debug instrumentation to test the hypotheses. Please reproduce the issue now.
> Once you've reproduced it, let me know and I'll analyze the logs.

### Phase 5: Analyze Evidence

Read the `.agent.debug.log` file and analyze:

```bash
cat .agent.debug.log
```

For each hypothesis, determine:
- **CONFIRMED**: Evidence clearly supports this as the cause
- **REJECTED**: Evidence contradicts this hypothesis
- **INCONCLUSIVE**: Need more data

### Phase 6: Iterate or Resolve

**If a hypothesis is confirmed:**
1. Explain the root cause to the user
2. Propose a fix
3. Clean up debug statements after the fix is applied

**If all hypotheses are rejected:**
1. Formulate new hypotheses based on the evidence gathered
2. Add new instrumentation
3. Clear logs and ask user to reproduce again
4. Repeat until root cause is found

## Agent Logger Usage

The centralized logger at `@/utils/logger` supports agent-prefixed logging:

```typescript
import { logger } from '@/utils/logger';

// Method 1: Create a named agent logger
const agentLogger = logger.agent('Debugger');
agentLogger.debug('message');  // Output: [Agent:Debugger] message

// Method 2: Use prefix directly in message
logger.debug('[Agent] message');  // Output: [Agent] message
```

All `[Agent]` prefixed logs are automatically captured to `.agent.debug.log` when running with `npm run start:emulator`.

## Important Notes

- Always clean up debug statements after debugging is complete
- Keep instrumentation minimal but sufficient to test hypotheses
- If reproduction requires specific user actions, provide clear steps
- The `.agent.debug.log` file only captures logs when running via `npm run start:emulator`
