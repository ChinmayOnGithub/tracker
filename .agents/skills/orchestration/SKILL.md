---
name: orchestration
description: Use when starting an agent session that may delegate investigation, implementation, or review work across multiple subagents or models.
---

# Orchestrate Models

Keep one coordinator in the main loop for product judgment, UX/UI, architecture, API and implementation design, integration, verification, and final review. Delegate bounded executor work through the active runtime's real capabilities.

## Discover The Runtime

1. Inspect the available delegation schema before dispatching.
2. Identify native subagents, concurrency limits, and any explicit model selector.
3. Treat that schema as ground truth. Never invent a model field, agent type, or background surface.
4. When model selection is unavailable, use inherited/default subagents and report the model as inherited or unknown.

## Portable Roles

### Coordinator

Owns requirements, design, task boundaries, integration, conflict resolution, verification, and the final answer. Executors may gather evidence; the coordinator decides.

### Routine executor

Use for reconnaissance, mechanical edits, focused tests, and implementation from a clear specification.

### Deep executor

Use for ambiguous debugging, cross-boundary or high-risk implementation, and a failed routine attempt. It still does not take design ownership from the coordinator.

## Runtime Adapters

- **Codex:** Prefer GPT-5.6 Sol as coordinator, Luna as routine executor, and Terra as deep executor when those explicit selectors are available. In-app subagents may inherit the current model; report that honestly. Use `codex exec -m ...` only when CLI delegation is appropriate and authorized.
- **Claude Code:** Use the main session as coordinator and native subagents as executors. Select a configured model only when the active subagent surface exposes that option; otherwise report inherited or unknown.
- **Other agents:** Map the three roles to the closest native subagent and model-selection capabilities. If no subagent surface exists, work inline instead of simulating delegation.

## Dispatch Contract

Every executor receives exact scope, exclusions, evidence or files to return, and verification. Parallelize only independent slices with non-overlapping write ownership. Keep tentative findings out of neutral evidence packets used for independent review.

The coordinator inspects actual outputs and diffs, reruns relevant checks, integrates the result, and reports every delegation with role, selected or inherited model, scope, and routing reason.

## Red Flags

- Invented selector or model identity
- Calling an inherited model explicitly selected
- Executor-owned product or architecture decisions
- Overlapping writes
- Unverified summaries or test claims
- Delegation when inline work is safer or smaller
