---
name: pr-code-review
description: Use when the user asks to review a pull request, PR URL or number, current or named branch, commit range, Git diff, or work-in-progress changes.
---

# PR Code Review

Perform a read-only, multi-agent review of one change set. Accept a GitHub PR URL or number, a branch, an explicit base/head pair, a Git range, or the current branch.

Default to reviewing committed changes and reporting results in the current agent session. Include staged, unstaged, or untracked work only when the user explicitly requests it. Post a GitHub review or comment only when the target is a PR and the user explicitly asks to publish it. Never modify the working tree, fix findings, push, approve, request changes, merge, close, or otherwise mutate the review target unless the user separately authorizes that action.

## Runtime capability

This workflow requires a real independent-subagent surface. Inspect the active runtime's delegation schema and concurrency limit before resolving the target. Use native subagents and real model selectors only when exposed; otherwise report models as inherited or unknown.

One available subagent is sufficient: run specialist and validator roles sequentially in waves. If no independent subagent is available, report `BLOCKED` and explain that an ordinary inline review is possible only outside this skill's independence contract. Never simulate multiple independent reviewers in one context.

## Resolve the review target

Resolve one stable base/head pair, or an explicit WIP-only `HEAD` anchor, before gathering evidence or dispatching specialists:

- **Pull request URL or number**: Resolve repository, PR metadata, base SHA, and head SHA with `gh pr view`.
- **Explicit base and head**: Verify both refs and compare their merge-base with `git diff <base>...<head>`.
- **Explicit Git range**: Preserve the user's two-dot or three-dot semantics after verifying every ref. Prefer three-dot for branch review because it isolates changes since divergence.
- **Explicit WIP-only request**: Anchor the review at the current `HEAD`, set the committed comparison diff to empty by definition, and collect only the requested staged, unstaged, and untracked evidence. Do not ask for a base branch or include committed branch changes.
- **Named or current branch without a base**: When a matching GitHub remote is available, first check whether the branch has an associated PR with `gh pr view`; if so, use the PR target and its base. Otherwise, inspect the repository's default branch, upstream configuration, and likely long-lived bases only to suggest choices. Ask the user which branch to compare against; never silently assume `main`, `master`, `develop`, or an upstream tracking branch.

For every committed target, verify that the resolved base and head SHAs exist in the review checkout and record their merge-base. For a base/head pair or inferred branch comparison, use `git diff <base>...<head>` and `git log <base>..<head> --oneline`. For an explicit Git range, use the exact operator the user supplied for the diff; never rewrite `A..B` to `A...B`. For PR targets, treat the GitHub PR diff as authoritative, reproduce it from the resolved base/head SHAs in the matching checkout, and confirm the changed-file set agrees before dispatch. For a WIP-only target, verify `HEAD` and record it as the anchor without manufacturing a base or merge-base.

If the user explicitly requests uncommitted work, append staged and unstaged diffs plus each untracked text file's contents as a clearly marked supplemental evidence set. Record only metadata for binary untracked files. State that this portion has no stable head SHA and cannot be published as GitHub line comments. Stop with the exact reason only when the complete requested change set is empty: no committed diff and, when requested, no staged, unstaged, or untracked evidence.

## Workflow

1. Confirm the required independent-subagent capability, then resolve the review target using the rules above: a stable base/head pair for committed targets or a `HEAD` anchor for WIP-only targets.
2. For PR targets, confirm the local repository matches the PR remote. If it does not, locate an existing matching checkout. If none exists and history analysis requires one, clone the repository read-only into a temporary directory. Do not alter the user's current branch or working tree.
3. For PR targets only, check eligibility with a lightweight subagent. Skip closed, draft, automated, obviously trivial, or already-reviewed PRs unless the user explicitly requests a rerun. State the exact skip reason. For non-PR targets, skip this gate and record that PR eligibility does not apply.
4. Discover the originating issue, PRD, or specification from available PR text, branch names, commit messages, linked issue references, user-provided paths, and repository documents. Record the authoritative source and its acceptance criteria. If no formal source exists, use only the user's explicit stated intent and note the gap; do not invent requirements.
5. Build a neutral evidence packet. For committed targets, include the target kind, base/head refs and SHAs, merge-base, committed diff, changed-file list, and commit list. For WIP-only targets, include the `HEAD` anchor, explicitly empty committed diff and commit list, and the requested staged, unstaged, and untracked evidence. For every target, include the originating specification and acceptance criteria, relevant instruction-file paths, and any available prior reviews/comments. Include repository-root instruction files and the nearest applicable `AGENTS.md` or `CLAUDE.md` files for every changed path. Do not include tentative findings in this packet.
6. Dispatch the six specialist reviews below to independent subagents. Use separate agents with minimal task-local context. Run them in parallel up to the available concurrency limit and in waves when necessary. Do not let one specialist see another specialist's conclusions.
7. Merge, deduplicate, and normalize the candidate findings. Reject anything outside changed lines unless the changed code directly causes the problem.
8. Validate every remaining actionable candidate with an independent confidence subagent. Validators receive the review-target evidence, one candidate finding, and the rubric below; they must verify the claim from primary evidence rather than trust the specialist. Keep advisory design signals separate from actionable findings.
9. Keep only actionable findings scoring at least 80. Before reporting, refresh the target head SHA and repeat PR eligibility when applicable. If the committed head or explicitly included working-tree evidence changed, refresh the evidence and revalidate affected findings.
10. Report Correctness, Spec, and Design Signals separately. Order actionable findings by severity, then confidence. If none survive, say that no high-confidence issues were found and briefly name the lenses checked.

## Specialist subagents

Dispatch all six roles:

1. **Standards and design signals**: Read every applicable `AGENTS.md` and `CLAUDE.md`. Flag only concrete standards violations introduced by the change set, quoting or precisely citing the controlling instruction. Also inspect for this Fowler smell baseline: Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, and Refused Bequest. Treat generic smells as advisory judgement calls, not defects. Documented repository standards override this baseline; when a repository rule makes a smell a concrete violation, return it as an actionable standards finding instead of an advisory design signal.
2. **Correctness**: Inspect the diff and the minimum surrounding code needed to identify material runtime, data, security, concurrency, state, or edge-case bugs. Avoid style feedback and speculative improvements.
3. **Spec fidelity**: Compare the implementation with the originating issue, PRD, specification, and acceptance criteria. Identify missing, partial, incorrect, or unrequested behavior. Cite the exact requirement and show the observable mismatch; do not infer unstated requirements.
4. **History and blame**: Inspect `git blame`, relevant commits, and surrounding history for changed code. Identify regressions or violated invariants supported by historical evidence.
5. **Prior pull requests**: When a GitHub remote is available, find previous PRs that modified the same files or behavior and check their review discussions for applicable constraints. Otherwise, skip this lens and record the verification gap.
6. **Code contracts**: Read comments, tests, types, schemas, ADRs directly referenced by changed code, and nearby invariants. Verify that the change preserves those contracts.

Each specialist must return zero or more candidates with:

- concise problem statement;
- severity: `P0`, `P1`, `P2`, or `P3`;
- exact changed file and line range;
- concrete failure scenario;
- primary evidence and source link;
- why the issue was introduced by this change set;
- review lens that found it.

Classify each candidate as `correctness`, `spec`, or `design-signal`, and as `actionable` or `advisory`. Actionable candidates include all fields above. Advisory design signals instead include the named smell, exact changed location, evidence, the maintenance tradeoff, and why the signal is worth noting in this change set; they must not use `P0`-`P3` severity or be phrased as required changes.

## Confidence validation

Give validators this rubric verbatim:

- **0**: False positive, unsupported, pre-existing, or contradicted by evidence.
- **25**: Plausible but unverified; may be stylistic or speculative.
- **50**: Real but minor, rare, or insufficiently important relative to the change set.
- **75**: Highly likely and important, but one material uncertainty remains.
- **100**: Direct evidence proves a frequent or deterministic material failure, or proves a specific instruction violation.

Require validators to check that the issue is introduced by the review target, reachable in practice, not already prevented elsewhere, and located on changed lines. Filter actionable scores below 80. Do not score advisory design signals as defects.

## False positives to reject

- Pre-existing issues not caused or exposed by the change set.
- Intentional behavior that matches the review target's stated purpose.
- Formatting, lint, type, compiler, or test failures those tools will report directly.
- General requests for more tests, documentation, refactoring, or hardening without a concrete bug.
- Style preferences not explicitly required by applicable instructions.
- Theoretical security or performance concerns without a reachable failure path.
- Issues silenced by an intentional and justified local directive.
- Duplicate symptoms of the same root cause.

Do not run builds, linters, typechecks, or test suites as part of this review unless the user asks. Static review should not claim those gates pass.

## Output

Use three sections in this order: **Correctness**, **Spec**, and **Design Signals**. Lead each of the first two sections with actionable findings. For each actionable finding provide:

```text
[P1] Short imperative title — 90 confidence
Why this fails in practice, including the triggering scenario.
Changed-line link: full-SHA GitHub URL when available; otherwise an absolute local file link.
Evidence: applicable instruction, history, prior PR, comment, test, type, schema, or code contract.
```

In **Design Signals**, list any validated actionable repository-standards violations first using the actionable format. Then provide advisory smells with the smell name, location, concrete evidence, and maintenance tradeoff. Clearly label them advisory. Do not let advisory design signals displace, inflate, or change the severity of correctness or spec findings.

When a GitHub remote exists, use full commit SHAs in GitHub blob links and tight line ranges with at least one line of surrounding context. Without a GitHub remote, use clickable absolute local file links with line numbers. For explicitly included uncommitted changes, use local file links and label them unstable. After findings, add a compact review-coverage note and explicitly state any unavailable PR metadata, previous-PR context, specification source, or publication capability.

When the target is a PR and the user explicitly requests publication, post one concise PR comment containing only the surviving findings. Recheck the head SHA immediately before posting. If no finding survives, do not post unless the user explicitly asked for a no-findings comment. For non-PR targets, report in the current session and explain that GitHub publication requires a PR.
