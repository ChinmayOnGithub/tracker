# Tracker AI Skills Registry

This file records the AI workflow layer adapted from `ChinmayOnGithub/template`.

## Source

- Repository: `ChinmayOnGithub/template`
- Source revision inspected: `1498b202868d82689bf14d91f4b1199ccaf2497e`
- Adaptation date: 2026-09-27
- Destination: `.agents/skills/`

## Precedence

Template skills provide methodology only. They never override Tracker truth.

1. `SPEC.md`
2. `docs/07-ai/AI Constitution.md`
3. `docs/02-architecture/` and `docs/08-decisions/`
4. `.agents/rules/`
5. `.agents/skills/`
6. `.agents/memory/` and task plans

## Imported skills

### Requirements and domain
- grilling
- domain-modeling
- to-spec
- to-tickets

### Repository understanding and planning
- project-analysis
- project-audit
- context-engineering
- planning-with-files
- project-memory
- orchestration

### Engineering and architecture
- system-design-first-principles
- backend-design
- api-design
- database-design
- data-modeling
- documentation-and-adrs
- why-we-do-this

### Quality and change safety
- code-review
- pr-code-review
- simplification
- refactoring
- repository-cleanup
- debugger
- test-driven-development
- define-evals

### Security, reliability and operations
- dependency-audit
- dependency-upgrade
- threat-model
- security-review
- observability-review
- deployment-review
- incident-review
- performance-optimization

### Frontend and product quality
- design-systems-frontend-architecture
- ui-visual-composition
- ux-usability-foundations
- ux-writing-content-design
- accessibility-inclusive-design
- tailwind-css
- web-quality
- seo

### Git and lifecycle
- git-workflow
- retrospective
- new-project

### Existing Tracker-native skills
These remain project-specific and are not replaced:
- tracker-core
- tracker-qa

## Adaptations

### context-engineering
Mapped the template's context hierarchy to Tracker's existing `SPEC.md`, AI Constitution, architecture documents, decisions, rules, and design system. Removed references to template-only context indexing commands.

### project-memory
Changed the precedence hierarchy to Tracker's actual documentation paths. Memory remains subordinate to specifications and approved architecture decisions.

### planning-with-files
Kept the useful persistent-planning model but removed host/plugin-specific hooks and commands. Tracker uses concise `.planning/<task-id>/` artifacts instead.

### new-project
Retained only as a controlled bootstrap aid for future reinitialization. It must preserve Tracker's existing product, domain, architecture, and design truth.

## Safety rule

Do not blindly copy future template changes into Tracker. Review new skills or updates for relevance, commands, dependencies, references, and conflicts with Tracker's existing rules before importing them.
