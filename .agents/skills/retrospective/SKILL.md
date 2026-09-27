---
name: retrospective
description: Conduct structured post-milestone retrospectives and after-action reviews (AAR). Use after major features, significant failures, long projects, or major architectural changes to extract actionable workflow improvements and prevent recurring mistakes.
license: MIT
metadata:
  upstream: neurofoo/agent-skills
---

# Retrospective & After-Action Review Skill

Adapted from the `aar` and `retro` capabilities in `neurofoo/agent-skills`.

Use this workflow to conduct blameless, structured reviews after major project milestones:
- Completion of a major feature or epic
- Following a significant operational or architectural failure
- At the end of a multi-week project or release cycle
- After major architectural refactoring

**When NOT to use**: Do not run retrospectives after trivial tasks or day-to-day bug fixes.

---

## Retrospective Protocol

### 1. Context & Scope
- **Milestone / Event**: What feature, project, or release are we reviewing?
- **Timeline**: Period covered (start date to completion date).
- **Core Intent**: What was the primary objective?

---

### 2. The 4-Question After-Action Review (AAR)

#### 1. What was expected?
- What were the original goals and acceptance criteria in `SPEC.md`?
- What was the planned timeline, architecture, or resource budget?
- What key assumptions were made upfront?

#### 2. What actually happened?
- What is the factual sequence of events and final deliverable state?
- What unexpected roadblocks, technical debt, or drift occurred?
- Gap comparison:
  | Expected | Actual Outcome | Gap (+ / -) |
  |----------|----------------|-------------|
  | [Planned behavior/timeline] | [Actual outcome] | [Variance] |

#### 3. Why was there a difference?
- Root causes: analyze system dynamics, communication gaps, or tooling hurdles.
- Distinguish between **Internal factors** (estimation errors, untested assumptions) and **External factors** (upstream API changes, requirement shifts).

#### 4. What do we do next?
- What worked well that must be sustained?
- What failed or created friction that must be eliminated?

---

### 3. Actionable Outcomes (Start / Stop / Continue)

Translate analysis into concrete, behavior-focused changes:

| Action Type | Specific Practice | Why | Implementation / Target |
|-------------|-------------------|-----|-------------------------|
| **START** | [New practice to adopt] | [Problem it solves] | [Where to apply] |
| **STOP** | [Harmful or noisy practice to eliminate] | [Risk or friction it caused] | [Immediate deprecation] |
| **CONTINUE** | [Proven pattern that delivered high value] | [Why it succeeded] | [Protect as a convention] |

---

## 4. Archiving Learnings

1. If the retrospective produced new domain insights or operational lessons, append them to `.agents/memory/LOGBOOK.md`.
2. If it revealed a flawed convention, update `.agents/rules/` or propose an ADR.
3. Keep the retrospective factual, blameless, and concise.
