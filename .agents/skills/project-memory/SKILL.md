---
name: project-memory
description: Maintain cross-session continuity, operational memory, and handoff state across chats, agents, and tool context wipes. Preserves evolving learnings without overriding architectural truth.
license: MIT
metadata:
  upstream: tasuku-9/project-memory-skill
  version: "2.0"
---

# Project Memory Skill

Adapted from `tasuku-9/project-memory-skill` for this software engineering template.

Maintain durable, cross-session continuity across chat loss, model switches, and multi-day implementations.

---

## 1. Hierarchy & Precedence Model (Critical)

> **Memory captures evolving context. Memory NEVER overrides project truth.**

Memory files must never become an uncurated secondary source of truth that conflicts with explicit project specs or decisions. Always uphold this precedence order:

1. **Level 1 (Ultimate Truth)**: `SPEC.md`, `docs/07-ai/AI Constitution.md`, `docs/02-architecture/` invariants and approved architecture decisions.
2. **Level 2 (Architectural Decisions)**: `docs/08-decisions/`, `docs/02-architecture/architecture.md`, and approved architecture documents.
3. **Level 3 (Project Defaults & Design)**: `.agents/rules/`, `docs/04-design/`, and established design-system conventions.
4. **Level 4 (Methodology)**: `.agents/skills/`.
5. **Level 5 (Evolving Memory)**: `.agents/memory/` (`CURRENT_STATE.md`, `LOGBOOK.md`, `HYPOTHESES.md`).

*If an entry in memory conflicts with an ADR or SPEC, the ADR or SPEC wins unconditionally.* To change a decision, author a new ADR or update `SPEC.md`—never quietly alter memory to override architecture.

---

## 2. Core Principles

- **Capture Broadly, Promote Narrowly**: Log raw observations, benchmark anomalies, and dead-ends in `LOGBOOK.md`. Only promote proven, hardened patterns into project documentation or ADRs.
- **Durable File Backing**: Never rely on transient chat memory or tool-internal caches. Persist memory in `.agents/memory/` within the repository.
- **Zero Friction**: Keep memory files short, scannable, and focused on operational state.

---

## 3. Memory Structure (`.agents/memory/`)

When project memory is initialized, maintain these lightweight files:

### `CURRENT_STATE.md`
The immediate session checkpoint. What were we doing when the session ended?
```markdown
# Current State

- **Active Goal**: [Short description of current feature / fix]
- **Last Verified Step**: [Tests passing, commit SHA, or verification evidence]
- **Immediate Next Step**: [Exact task to resume]
- **Current Blockers**: [None / description]
```

### `LOGBOOK.md`
Timestamped record of decisions, failed experiments, and operational insights:
```markdown
# Operational Logbook

## YYYY-MM-DD - [Title]
- **Context**: Why this investigation took place.
- **Finding / Result**: What was observed (link to error trace or benchmark).
- **Resolution**: What we learned or changed.
```

### `HYPOTHESES.md`
Active hypotheses being tested during complex debugging or architectural investigations:
```markdown
# Active Hypotheses

| ID | Hypothesis | Status | Evidence / Result |
|----|------------|--------|-------------------|
| H1 | Memory leak caused by unclosed DB connections | DISPROVEN | Connections drain properly under load |
| H2 | Cache stampede on tenant config change | CONFIRMED | Fixed with mutex lock in commit abc123 |
```

---

## 4. Workflows

### Session Handoff & Resumption
1. **Before Ending**: Update `.agents/memory/CURRENT_STATE.md` with the active goal, green baseline, and exact next step.
2. **On Resuming**: Read `CURRENT_STATE.md` first. Confirm git status matches. Do not read the entire repository.

### Logging Experiments & Gotchas
When an approach fails or a subtle platform bug is discovered:
1. Append an entry to `LOGBOOK.md` describing the failure mode and workaround.
2. Prevent future agents from repeating the same dead-end.
