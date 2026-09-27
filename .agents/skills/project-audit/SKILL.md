---
name: project-audit
description: Systematically audit repository architecture, code duplication, security vulnerabilities, dead code, and invariant violations.
---

# Project Audit Skill

Use this workflow to perform comprehensive, evidence-based codebase health audits across any tech stack.

## 1. Audit Dimensions
When conducting an audit, evaluate across these 6 core pillars:
1. **Architecture & Invariants**: Are state mutations respecting defined system layer boundaries? Are documented invariants in `SPEC.md, docs/07-ai/AI Constitution.md, and docs/02-architecture/` consistently upheld?
2. **Code Cleanliness & Duplication**: Identify copy-pasted domain logic, dead code paths, circular imports, and uncohesive files that violate single responsibility.
3. **Security & Data Isolation**: Verify tenant/user boundary enforcement, input validation at external boundaries, secret isolation, and defensive error handling.
4. **Performance & Resource Utilization**: Detect unindexed lookups, memory/resource leaks, blocking synchronous operations in async paths, and wasteful bundle or runtime allocations.
5. **Testing & Eval Health**: Check test determinism, coverage of critical business invariants, regression test presence, and executable behavioral evaluation suites.
6. **Interface & Contract Adherence**: For frontends/CLIs/APIs, verify design token adherence, consistent error/success envelopes, and complete empty/error state handling.

## 2. Severity Classification
- **CRITICAL**: Immediate security exploit, data corruption/loss risk, or invariant violation.
- **HIGH**: Performance degradation, broken auth/tenant check, or untested critical mutation.
- **MEDIUM**: Code duplication, missing fallback/empty state, or interface inconsistency.
- **LOW**: Minor documentation drift or formatting inconsistency.

## 3. Evidence-First Rule
Never report an audit finding without citing exact file paths, line numbers, and a concrete reproduction or failure scenario.
