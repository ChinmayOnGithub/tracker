# Patterns Index

> **Why this directory exists**: Without reusable patterns, every new feature invents its own architecture. With patterns, a developer (or AI) picks an established blueprint and follows it. Features become compositions of known building blocks, not unique snowflakes.

---

## Which pattern do I use?

| I'm building... | Use this pattern |
|---|---|
| A feature that appears on the Today Timeline | [`PAT-001` Timeline Pattern](./Timeline%20Pattern.md) |
| A feature with numeric measurements (weight, money, reps, distance) | [`PAT-002` Quantifiable Pattern](./Quantifiable%20Pattern.md) |
| A connection to an external calendar or data source | [`PAT-003` Provider Pattern](./Provider%20Pattern.md) |
| A feature that stores encrypted files or secrets | [`PAT-004` Secure Resource Pattern](./Secure%20Resource%20Pattern.md) |
| Structured logging and audit trails for a module | [`PAT-005` Audit Pattern](./Audit%20Pattern.md) |

---

## Pattern Composition

Most features use multiple patterns together. Here's what the existing modules use:

| Module | Patterns |
|---|---|
| Habits | `PAT-001` Timeline + `PAT-005` Audit |
| Journal | `PAT-001` Timeline + `PAT-005` Audit |
| Weight | `PAT-001` Timeline + `PAT-002` Quantifiable + `PAT-005` Audit |
| Secure Vault | `PAT-004` Secure Resource + `PAT-005` Audit |
| Google Calendar | `PAT-001` Timeline + `PAT-003` Provider |

---

## Adding a new pattern

If you're about to build something that doesn't fit any existing pattern, and you believe it will be reused by future modules, create a new pattern file in this directory.

A pattern document must contain:
1. **Intent** — what problem it solves
2. **Problem** — why the naive approach fails
3. **Solution** — the structural approach, with diagrams
4. **Implementation** — concrete code showing the happy path
5. **Rules** — invariants that must hold
6. **See Also** — cross-references to SPEC.md, Constitution, and related patterns
