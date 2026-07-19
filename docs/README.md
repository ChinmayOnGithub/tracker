# Tracker Engineering Handbook

> **Start here.** This is the reading order for understanding Tracker.  
> Read top to bottom. Each document builds on the ones before it.

---

## Reading Order

| # | Document | What you learn | Time |
|---|---|---|---|
| 1 | [SPEC.md](../SPEC.md) | What Tracker *is*. Every domain concept, architectural invariant, and capability — precisely defined. | 15 min |
| 2 | [Philosophy & Vision](./01-foundation/Philosophy.md) | *Why* Tracker exists. The Time-Centric insight, the three-layer model, and the Capabilities-over-Categories paradigm. | 5 min |
| 3 | [Core Domain](./01-foundation/Core%20Domain.md) | Entity lifecycle diagrams, the Postpone state machine, and the Activity-First integration architecture. | 10 min |
| 4 | [System Architecture](./02-architecture/architecture.md) | Request flow, Event Bus, dependency direction rules, folder structure, and known architectural debt. | 10 min |
| 5 | [Patterns](./09-patterns/README.md) | Reusable implementation blueprints — Timeline, Quantifiable, Provider, Encryption, Audit. Pick the right one before building. | 5 min |
| 6 | [AI Constitution](./07-ai/AI%20Constitution.md) | Engineering laws. What must always be true. The quality gates every change must pass. | 10 min |

---

## When to read what

| You want to... | Read |
|---|---|
| Understand the project from scratch | Documents 1 → 6 in order |
| Add a new feature that appears on the Timeline | [Timeline Pattern](./09-patterns/Timeline%20Pattern.md) |
| Add a numeric measurement feature (weight, money, reps) | [Quantifiable Pattern](./09-patterns/Quantifiable%20Pattern.md) |
| Connect an external calendar (Outlook, Apple) | [Provider Pattern](./09-patterns/Provider%20Pattern.md) |
| Store sensitive encrypted files | [Secure Resource Pattern](./09-patterns/Secure%20Resource%20Pattern.md) |
| Add structured logging / audit trails | [Audit Pattern](./09-patterns/Audit%20Pattern.md) |
| Review a PR | [AI Constitution — Definition of Done](./07-ai/AI%20Constitution.md#definition-of-done) |
| Propose a major architecture change | [RFCs](./10-rfcs/README.md) |

---

## Directory Map

```
docs/
├── README.md                ← You are here
├── 01-foundation/
│   ├── Philosophy.md        ← Why Tracker exists
│   └── Core Domain.md       ← Entity lifecycles
├── 02-architecture/
│   └── architecture.md      ← System layers and request flow
├── 06-features/
│   └── Activity vs Task Logic.md
├── 07-ai/
│   └── AI Constitution.md   ← Engineering laws
├── 09-patterns/
│   ├── README.md             ← Pattern index
│   ├── Timeline Pattern.md
│   ├── Quantifiable Pattern.md
│   ├── Provider Pattern.md
│   ├── Secure Resource Pattern.md
│   └── Audit Pattern.md
└── 10-rfcs/
    └── README.md             ← RFC process + template
```

---

## One rule

> **The code explains *how*. The docs explain *why*.**

If you're documenting something the code already makes obvious, stop. If you're about to make a design decision that someone will question in six months, write it down.
