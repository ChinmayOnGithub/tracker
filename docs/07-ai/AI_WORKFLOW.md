# Tracker AI Engineering Workflow

Use this workflow as the default path for substantial AI-assisted engineering work.

```
User Goal
   |
   v
Understand current Tracker state
   |  project-analysis / project-memory / context-engineering
   v
Clarify requirements and domain
   |  grilling / domain-modeling / to-spec
   v
Architecture and acceptance boundaries
   |  system-design / api / backend / database / data-modeling
   |  define-evals
   v
Plan
   |  planning-with-files / to-tickets
   v
Implement using Tracker patterns
   |
   v
Verify
   |  test-driven-development / debugger / web-quality
   v
Review
   |  code-review / security-review / project-audit
   v
Release decision
   |  deployment-review / git-workflow
   v
Document and retain learnings
   |  documentation-and-adrs / retrospective / project-memory
```

## Context rule

Load only the skills and project documents required by the active task. Never load the entire skill portfolio just because it exists.

## Tracker-specific rule

Generic skills are procedures. Tracker's SPEC, AI Constitution, architecture, decisions, rules, and existing implementation patterns are the authority.

## Verification rule

Do not claim completion without concrete verification evidence. Prefer targeted tests first, then typecheck, lint, and build when the change warrants them.
