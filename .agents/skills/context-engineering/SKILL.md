---
name: context-engineering
description: Structure, audit, align, and progressively load AI agent context. Enforces strict context boundaries, task-specific loading, and prevents context pollution across AGENTS.md, rules, skills, documentation, memory, and plans.
---

# Context Engineering Skill

Adapted from the context engineering methodology in `fending/context-engineering` for this universal template repository.

## Core Principle: Progressive Disclosure

> **Do not read every document by default.**
> Never inject the entire repository or all documentation files into an agent session. Context is precious; over-filling leads to hallucination, instruction drift, and high latency.

Load only what is strictly necessary for the active task.

---

## 1. Context Hierarchy & Interaction

Understand how the distinct context layers interact and their strict precedence:

```text
Layer 1: Navigation Core (Always Loaded)
  └── AGENTS.md & `docs/07-ai/AI Constitution.md`
        ↓
Layer 2: Permanent Rules (Task-Invariant Standards)
  └── .agents/rules/ (engineering, product, security, voice)
        ↓
Layer 3: On-Demand Skills (Task-Triggered Procedures)
  └── .agents/skills/<skill-name>/SKILL.md (loaded ONLY when triggered)
        ↓
Layer 4: Project Truth & Documentation (Read As Needed)
  └── SPEC.md, `docs/02-architecture/`, and `docs/08-decisions/`
        ↓
Layer 5: Persistent State (Multi-Step / Cross-Session)
  └── Plans (.scratch/ or task_plan.md) and Project Memory (.agents/memory/)
```

### Source of Truth Precedence
1. **SPEC.md & INVARIANTS.md**: Non-negotiable product scope and system invariants.
2. **Personal Defaults**: `.agents/rules/` and existing Tracker design documentation.
3. **Project Architecture**: `docs/02-architecture/` and `docs/08-decisions/`.
4. **Skills**: Reusable methodology. Skills never override project truth.
5. **Memory & Plans**: Evolving state records. They must never contradict explicit project decisions.

---

## 2. Context Structure & Boundaries

1. **Lightweight Navigation Layer**: Keep root instruction files (`AGENTS.md`) under 60 lines. They should provide concise routing pointers, not comprehensive manuals.
2. **Modular Rules**: Isolate permanent standards into `.agents/rules/`. Universal rules must not contain stack-specific assumptions (e.g., no database requirements in universal rules).
3. **On-Demand Skills**: Encapsulate procedural expertise in `.agents/skills/<name>/SKILL.md`. Never load multiple competing skills for the same task.
4. **Progressive File Loading**: When working on a feature, read the relevant module interfaces and specs. Do not read unrelated domain services or entire subtrees.

---

## 3. Context Auditing Protocol

Audit context health periodically or after major architecture changes:

1. **Token Footprint Audit**:
   - Run `npm run audit-context` (or `node .agents/scripts/audit-context.mjs`).
   - Verify that always-loaded files remain lightweight (<60 lines).
   - Ensure individual skills remain focused (under 5,000 words).
2. **Completeness vs Over-Engineering**:
   - *Under-documented*: Complex multi-tier system with zero directory map or architectural boundaries.
   - *Over-engineered*: Deep cascading config files for a small 5-file utility.
3. **Contradiction Scan**:
   - Check if rules contradict between root files, local rules, and default preferences.
   - Ensure the hierarchy of truth is maintained.

---

## 4. Context Alignment (Anti-Drift)

Verify that instruction files reflect the actual codebase:
1. **Package References**: Do mentioned packages match `package.json`, `Cargo.toml`, or `pyproject.toml`?
2. **Scripts & Commands**: Do documented commands match `package.json` scripts or Makefile targets?
3. **File Paths**: Are referenced directories and files present on disk?
4. **Skill Relevance**: Remove or archive skills for technologies not present in the current project type.

---

## 5. Task-Specific Loading Rules

Before loading any file into context, ask:
1. *Does the active task require this file?*
2. *Is this information already captured in the immediate task prompt or active ticket?*
3. *Can a question be resolved with grep or symbol lookup instead of reading whole files?*

If the answer is no, do not load the file.


## 6. Context Index and Retrieval

For repositories that need task-specific retrieval, use the local context layer:

1. Run `npm run context:index` after project initialization or structural changes.
2. Use `npm run context:build -- --task="..."` to build a bounded task context.
3. Prefer cached item summaries and exact source pointers over full-file loading.
4. Treat `.agents/context/index.json` and `items.json` as generated local cache, never as project truth.
5. Source hashes determine when cached items are stale.
6. Keep the context order deterministic and stop when the configured budget is reached.

The retrieval layer must remain deterministic. Do not add embeddings or a vector database until keyword, symbol, path, and dependency retrieval has been shown insufficient.
