---
name: planning-with-files
description: Use for multi-step Tracker work that needs persistent planning, research findings, progress tracking, or reliable session handoff.
---

# Planning With Files

Use lightweight files as durable working memory for tasks that span multiple implementation or investigation steps.

## When to use

Use this skill for:
- 5+ meaningful tool operations
- repository audits
- large feature work
- cross-module debugging
- research-backed architecture changes
- work likely to continue in another session

Do not create planning files for a trivial one-file change.

## Files

Create a task-specific directory under `.planning/<task-id>/`:

- `task_plan.md`: goal, phases, decisions, blockers, next step
- `findings.md`: evidence, discoveries, failed approaches, relevant paths
- `progress.md`: chronological implementation and verification log

Never overwrite an existing plan when resuming.

## Workflow

1. Inspect the current branch and relevant project truth.
2. Create or resume the task plan before substantial implementation.
3. After important discoveries, record them in `findings.md`.
4. After each implementation phase, update `progress.md` and the single next step in `task_plan.md`.
5. Record failed approaches so they are not repeated.
6. Before ending a session, record exact verification status and remaining work.

## Context discipline

Planning files are working memory, not project truth. They never override:
1. `SPEC.md`
2. `docs/07-ai/AI Constitution.md`
3. architecture and approved decisions under `docs/02-architecture/` and `docs/08-decisions/`
4. permanent rules under `.agents/rules/`

Keep planning artifacts concise and task-specific.