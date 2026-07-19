# Request for Comments (RFCs)

> **Why RFCs exist**: Major architectural changes should be thought through *before* code is written. An RFC forces you to articulate the problem, evaluate alternatives, and get feedback — before investing hours in implementation that might need to be redesigned.

---

## When to write an RFC

Write an RFC when:
- Adding a new database table or changing the schema in a non-trivial way
- Introducing a new module or external integration
- Changing the mutation flow, Event Bus contract, or provider interface
- Making a breaking change to an existing API surface
- Any change that affects more than 3 files and introduces a new concept

Do **not** write an RFC for:
- Bug fixes
- UI styling changes
- Adding a field to an existing form
- Performance optimizations that don't change the architecture

---

## RFC Status Lifecycle

```
DRAFT → REVIEW → ACCEPTED → IMPLEMENTED → CLOSED
                     ↘ REJECTED
```

---

## Template

Copy the block below into a new file named `RFC-NNN-short-title.md`.

```markdown
# RFC-NNN: [Title]

**Status**: DRAFT  
**Author**: [name]  
**Date**: [YYYY-MM-DD]  
**Relates to**: [SPEC.md §X, LAW-XX, PAT-XXX]

## Problem

What problem are we solving? Why can't we solve it within the existing architecture?

## Proposal

What are we going to build? Include diagrams if helpful.

## Alternatives Considered

What other approaches did we evaluate? Why were they rejected?

## Impact

- **Schema changes**: [yes/no — describe]
- **New dependencies**: [yes/no — list]
- **Breaking changes**: [yes/no — describe]
- **Affected modules**: [list]
- **New patterns introduced**: [yes/no — describe]

## Migration Plan

If this changes existing behavior, how do we get from here to there?

## Open Questions

What hasn't been decided yet?
```

---

## Existing RFCs

*None yet. This directory is ready for the first RFC when it's needed.*
