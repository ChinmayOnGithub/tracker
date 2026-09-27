---
name: define-evals
description: Define evals from an approved design spec before writing implementation plans. Triggers on "define evals", "write evals for this spec", "eval plan", or spec-to-planning transitions. Works for any AI system.
license: Apache-2.0
metadata:
  author: savitharaghunathan
  version: "0.3.0"
---

# Define Evals From Spec

Turn an approved design spec into a concrete eval plan — eval tasks, graders, problem sets, and pass criteria — so the implementation plan is written against measurable success criteria, not just prose.

This skill is domain-agnostic. It works for any AI system: coding agents, conversational agents, customer support bots, research agents, RAG pipelines, content generation, data analysis, workflow automation, or any LLM-powered application. The eval patterns adapt to the domain — what changes is the specific tasks and graders, not the methodology.

This skill sits between brainstorming and planning:

```text
Brainstorming (approved spec)
  → THIS SKILL (eval plan from spec)
    → Writing Plans (implementation plan informed by evals)
```

<HARD-GATE>
Do NOT proceed without an approved design spec. An approved spec means: a document that has been explicitly marked as approved or finalized by the user, OR a spec the user confirms is ready for eval definition in this conversation. If no spec exists, tell the user to complete brainstorming first. Do NOT skip steps or jump to implementation.
</HARD-GATE>

## Checklist

You MUST create a task for each item and complete them in order:

1. **Locate the spec** — Find the approved design doc (ask the user if unclear)
2. **Detect archetypes** — Scan spec for archetype signature patterns, classify into 1+ archetypes, present to user for confirmation
3. **Extract requirements via archetype checklists** — For each matched archetype, run its extraction checklist from `references/archetypes/`. Merge results across archetypes. Deduplicate. If extraction reveals additional archetypes, return to Phase 2.
4. **Inventory call paths** — LLM call paths PLUS non-LLM call paths for ml-pipeline, data-workflow, and api-service archetypes
5. **Classify each requirement** — Assign a primary grader: deterministic (code-based), subjective (LLM-as-judge), or environmental (outcome verification). Then add statistical validation as a secondary grader where correctness is distributional.
6. **Generate eval tasks** — Write concrete eval tasks using archetype-specific task templates
7. **Build balanced problem sets** — Add negative cases, boundary cases, and edge cases for each task
8. **Select graders** — Choose grader type and define grading logic for each task
9. **Define pass criteria with archetype-specific default metrics** — Each matched archetype contributes its default metrics. Merge and deduplicate. User approves which metrics are tracked vs. hard-gated.
10. **Present eval plan** — Show the complete plan to the user for approval
11. **Coverage check** — Scan the spec for uncovered components, especially checking all matched archetypes have coverage. If gaps found, return to Phase 6.
12. **Framework compatibility check** — Verify the eval plan is implementable. Add framework notes for tasks requiring non-standard capabilities.
13. **Write eval plan file** — Save to `docs/eval-plans/YYYY-MM-DD-<topic>-eval-plan.md`
14. **Transition** — Invoke writing-plans skill, passing the eval plan as acceptance criteria

## Phase 1: Locate the Spec

Find the approved design spec. Check in order:

- Was a spec file path mentioned in conversation?
- Does the project have a specs or design docs directory (e.g., `docs/specs/`, `docs/design/`, `specs/`)?
- Ask the user to point you to the spec.

## Phase 2: Detect Archetypes

Scan the spec for archetype signature patterns. Archetypes are recognizable system patterns that determine which extraction checklists and default metrics to apply. The archetypes are:

- **single-agent** — One LLM, tool use, single-turn or multi-turn interaction
- **multi-agent** — Multiple agents, delegation, coordination, shared state
- **rag-pipeline** — Retrieval, embedding, chunking, vector search, grounding, citation
- **user-facing-product** — User journeys, UX flows, onboarding, accessibility
- **ml-pipeline** — Training, inference, model serving, feature engineering (non-LLM or mixed)
- **data-workflow** — ETL, data transformations, scheduling, data quality checks
- **content-generation** — Writing, editing, style guides, brand voice, templates
- **api-service** — API endpoints, tool definitions, MCP server, function-calling interface

A spec can match multiple archetypes. Disambiguation rules:

- **single-agent vs. multi-agent**: Requires two or more distinct LLM-calling components that coordinate. A single agent with multiple tools is single-agent.
- **single-agent vs. content-generation**: content-generation applies when the system's primary purpose is producing written content for human consumption. A coding agent that generates code is single-agent.
- **user-facing-product vs. content-generation**: user-facing-product is interactive (conversations, forms, journeys). content-generation is batch/on-demand output.
- **ml-pipeline vs. data-workflow**: Use ml-pipeline when there is a trained model (inference, training, fine-tuning). Use data-workflow when there is no trained model — pure ETL, reporting, analytics. If both, match both.
- **api-service vs. single-agent**: api-service is a request-response service with no agency. If the service internally uses an LLM, match both api-service and single-agent.

Present detected archetypes to the user for confirmation. The user can add or remove archetypes.

If multiple archetypes match, ask the user which is the **primary archetype**. The primary archetype leads the eval plan — its checklist and metrics come first. Secondary archetypes layer in additions.

See `references/archetypes/<archetype>.md` for signature patterns, extraction checklists, default eval dimensions, grader patterns, common failure modes, and example eval tasks for each archetype.

## Phase 3: Extract Requirements via Archetype Checklists

For each matched archetype, run its extraction checklist from `references/archetypes/<archetype>.md`. This replaces free-form spec reading with structured extraction.

For each archetype, pull:

- Every item on the archetype's extraction checklist
- **Functional requirements** — What the system must do
- **Non-functional requirements** — Performance, cost, latency constraints
- **Security constraints** — Auth, injection resistance, data handling
- **Integration points** — APIs, tools, external systems
- **User-facing behaviors** — How the system interacts with users (if applicable)

### Merge Rules (for multi-archetype specs)

When a spec matches multiple archetypes, merge their extraction results:

- **Dedup by intent**: When two archetypes surface semantically equivalent requirements, keep the one from the primary archetype.
- **Priority tiebreaking**: When two archetypes flag the same dimension at different priorities, take the higher priority.
- **Presentation cap**: After merging, present at most 15-20 eval dimensions sorted by priority (P0 first), then by archetype rank (primary before secondary). Group the rest as "additional dimensions from [archetype]" that the user can opt into.

If extraction reveals the spec matches additional archetypes not detected in Phase 2, return to Phase 2 and update the archetype classification.

## Phase 4: Inventory Call Paths

<HARD-GATE>
Before proceeding to Phase 5, you MUST produce an explicit inventory of every place in the spec where an LLM is invoked. If the spec mentions agents, sub-agents, skills, or any component that calls an LLM, this inventory cannot be empty.
</HARD-GATE>

### LLM Call Paths

Trace the spec and list every LLM call path. For each, record:

```yaml
- path_id: <short-id>
  component: <which agent, skill, or module makes the call>
  purpose: <what the LLM does — generation, classification, extraction, tool selection, summarization, etc.>
  input: <what goes into the LLM call>
  output: <what comes out and how it's used>
  non_deterministic: true | false
```

Common LLM call paths that are easy to miss:

- **Agent tool selection** — LLM decides which tool to call and with what parameters
- **Agent response generation** — LLM generates user-facing text
- **Pattern extraction** — LLM extracts patterns, rules, or structure from code/text
- **Test/content generation** — LLM writes tests, rules, documentation, or other artifacts
- **Classification/routing** — LLM categorizes input to decide next action
- **Summarization/compression** — LLM condenses context for downstream use
- **Multi-agent delegation** — One agent invokes another agent via LLM

### Non-LLM Call Paths (for ml-pipeline, data-workflow, api-service archetypes)

If the spec describes non-LLM computation — model inference, data transformations, API integrations — inventory those paths too:

```yaml
- path_id: <short-id>
  component: <which module or service>
  purpose: <model inference, data transformation, API integration, etc.>
  input: <what goes in>
  output: <what comes out>
```

Every path in both inventories MUST have at least one eval task by the end of Phase 6.

## Phase 5: Classify Each Requirement

For each requirement from the spec, assign a primary grader from the first three categories. Then check whether statistical validation should be added as a secondary grader:

### Code-Based (Deterministic)

Requirements with objectively verifiable outcomes. Use when:

- There is a single correct answer or a finite set of valid answers
- Success can be checked by inspecting output format, state changes, or tool calls
- The check is binary: it either happened or it didn't

Examples: tool selection correctness, auth gating, format compliance, API response codes, database state after operation, retrieval groundedness checks.

### LLM-as-Judge (Subjective)

Requirements where quality is a spectrum and reasonable people could disagree. Use when:

- Multiple valid outputs exist for the same input
- Quality requires nuanced judgment (tone, helpfulness, completeness)
- The grading criteria are expressible as a rubric but not as code

Examples: response quality, explanation clarity, appropriate level of detail, conversation flow, error message helpfulness.

### Outcome Verification (Environmental)

Requirements verified by checking the state of the world after the agent acts. Use when:

- The agent modifies external state (files, databases, APIs)
- Success means the environment is in the correct state, regardless of the path taken
- The outcome matters more than the process

Examples: file was created with correct contents, database record exists, API was called with correct parameters, deployment succeeded.

### Second Pass: Statistical Validation (Distributional)

After assigning a primary grader, check whether the requirement also has distributional properties. If so, add statistical validation as a secondary grader alongside the primary. Use when:

- Success is defined by metrics within confidence intervals (accuracy > 90% with p < 0.05)
- The system processes batches where individual items vary but aggregate behavior must be consistent
- Drift detection requires comparing distributions over time
- A/B testing requires statistical significance

Examples: model accuracy within threshold, data distribution stability, performance regression detection, bias measurement across demographic groups. A task can have both outcome verification (did the batch job write correct records?) and statistical validation (is the 95% success rate within the confidence interval?).

**Note on memory-bearing systems:** If the spec describes an agent with persistent memory (cross-session state, user profiles, learned preferences, knowledge accumulation), treat memory operations as a distinct eval surface. Classify memory requirements separately: can it retrieve the right information? Can it forget when required? Does it handle contradictions? Does retrieval degrade as the store grows? See `references/eval-guide.md` for the full memory quality framework.

**Note on agent harnesses/scaffolds:** If the spec describes orchestration infrastructure (routing, context assembly, tool dispatch, multi-agent coordination, error recovery), evaluate the harness independently from the agents running inside it. Scaffold differences can dominate outcomes even under fixed base models — the infrastructure is often the bottleneck, not the LLM. Key harness eval surfaces: routing correctness (especially with >15 tools), context compaction fidelity, sensor coverage (do checks actually fire?), fault recovery, and premature completion detection. See `references/eval-guide.md` for the full harness eval checklist.

**Note on statistical requirements:** If the spec includes ml-pipeline or data-workflow archetypes and specifies metric thresholds (accuracy targets, drift limits, throughput SLAs), classify these as statistical validation. Read `references/eval-taxonomy.md` for method selection guidance and minimum sample sizes.

Read `references/eval-taxonomy.md` for the complete grader taxonomy with methods and tradeoffs for all four grader types.

## Phase 6: Generate Eval Tasks

For each classified requirement, write a concrete eval task. Each task MUST include:

```yaml
- id: <short-descriptive-id>
  requirement: <which spec requirement this tests>
  description: <what this task tests, in one sentence>
  input: <the prompt, context, or scenario given to the agent>
  expected_behavior: <what success looks like — NOT exact output>
  reference_solution: <a known-good solution that proves solvability and verifies grader config>
  grader_type: code | llm-judge | outcome | statistical | code+statistical | outcome+statistical
  grader_logic: <specific grading approach — what to check and how>
  category: capability | regression
  priority: P0 | P1 | P2
```

### Priority Levels

- **P0**: Non-negotiable. Must pass before any deployment. Security, auth, data integrity.
- **P1**: Core functionality. Must pass before feature is considered complete.
- **P2**: Quality and polish. Important but not blocking.

### Agent and LLM Task Templates

For every LLM call path identified in the Phase 4 inventory, generate eval tasks using these templates as starting points. Adapt to your domain — these are patterns, not rigid forms.

**Tool/Action Selection** — Does the agent pick the right tool with the right parameters?

```yaml
- id: <component>-tool-selection
  grader_type: code
  grader_logic: Check tool name and parameter values against expected
  category: capability
  priority: P1
```

**Generation Quality** — Does the agent produce high-quality output (tests, rules, text, code)?

```yaml
- id: <component>-generation-quality
  grader_type: llm-judge
  grader_logic: |
    Rubric: correctness, completeness, relevance to input context.
    Grade each dimension independently. PASS/FAIL per dimension.
  category: capability
  priority: P1
```

**End-to-End Outcome** — Does the agent achieve the intended goal, regardless of path?

```yaml
- id: <component>-e2e-outcome
  grader_type: outcome
  grader_logic: Check environment state after agent completes — files created, records updated, output matches expected shape
  category: capability
  priority: P0
```

**Multi-Turn Consistency** — Does the agent behave consistently across turns?

```yaml
- id: <component>-multi-turn
  grader_type: llm-judge
  grader_logic: |
    Design scenario where turn N depends on turn 1-2.
    Judge whether agent contradicts itself or loses context.
  category: capability
  priority: P1
```

**Reliability (pass^k)** — Does the agent succeed consistently, not just once?

```yaml
- id: <component>-reliability
  grader_type: code | llm-judge
  grader_logic: Run same task k times (k=5 minimum). Use pass^k metric. Flag if pass@k >> pass^k.
  category: capability
  priority: P1
```

Every LLM call path from the Phase 4 inventory must map to at least one task. If a path has no task after this phase, add one before proceeding.

### Task Writing Rules

Follow these rules from the research (read `references/eval-guide.md` for full context):

1. **Unambiguous tasks**: Two domain experts should independently reach the same pass/fail verdict. Ambiguity in task specs becomes noise in metrics.
2. **Include reference solutions**: Each task should have a known-good solution that proves solvability and verifies grader configuration.
3. **Grade outcomes, not paths**: Don't check exact tool call sequences. Check what the agent produced. For user-facing agents, prefer outcome grading: compare the environment state (database, API, file system) after the agent acts against the expected goal state. The conversation is the means; the environmental state is what matters.
4. **Prefer constrained tasks**: Bug-fixing and error-correction tasks are easier to grade than open-ended generation. When possible, frame tasks as constrained transformations (fix this bug, correct this output) rather than unbounded generation (build X from scratch).
5. **Build in partial credit**: An agent that identifies the problem but fails to fix it is better than one that fails immediately.
6. **Start small**: 20-50 tasks is a strong start. Don't aim for exhaustive coverage in v1.

## Phase 7: Build Balanced Problem Sets

For every eval task, add counterbalancing cases. One-sided evals create one-sided optimization.

For each task, define:

**Positive cases** — Inputs where the behavior SHOULD occur:

- Happy path (standard usage)
- Variations in phrasing, format, or complexity
- Edge cases that should still succeed

**Negative cases** — Inputs where the behavior should NOT occur:

- Inputs that look similar but shouldn't trigger the behavior
- Boundary cases just outside the expected scope
- Adversarial inputs (prompt injection, out-of-scope requests)
- Noise/distractor cases (inject irrelevant context, skills, or tools — does the agent stay focused?)

**Boundary cases** — Inputs at the exact boundary:

- Ambiguous inputs where the correct behavior is debatable
- Cases requiring judgment calls about escalation vs. handling

Target ratio: roughly 40% positive, 40% negative, 20% boundary for each eval dimension. This is a practical default — adjust based on the risk profile of the system. Higher-risk systems (safety-critical, financial) may warrant more negative and boundary cases.

## Phase 8: Select Graders and Define Logic

For each task, define the specific grading approach. **Prefer execution-based validation over pattern matching** — actually run the generated code or invoke the generated artifact and verify runtime behavior. A source file that contains the right patterns but doesn't wire them up correctly will pass a regex check but fail execution.

### Code-Based Graders

```text
- String matching (exact or fuzzy)
- Regex patterns
- JSON schema validation
- Tool call verification (correct tool, correct params)
- State diff (before/after comparison)
- Static analysis (linters, type checks)
- Binary tests (does it compile, do tests pass)
```

### LLM-as-Judge Graders

```text
- Rubric: Define 3-5 specific criteria the judge evaluates
- Default quality dimensions: coherence, accuracy, clarity, relevance, efficiency
  — adapt these to your domain; they cover the most common real-world LLM usage patterns
- Scoring: PASS/FAIL (not Likert scales — binary forces clarity)
- Judge model: Use the most powerful model affordable
- Isolation: One judge per dimension, not one judge for everything
- Escape hatch: Include instruction to return "Unknown" when uncertain
- Calibration plan: Note that human calibration is needed (25-50 examples)
```

### Outcome Verification Graders

```text
- Environment state checks (file exists, DB record, API state)
- Diff-based (expected state vs. actual state)
- Idempotency checks (running twice produces same outcome)
```

## Phase 9: Define Pass Criteria

For the overall eval plan, define:

### Per-Task Criteria

- **Threshold**: What pass rate is acceptable? (e.g., 90% for P0, 80% for P1)
- **Trials**: How many trials per task? (minimum 3 for statistical meaning, 5-10 for agents)
- **Metric**: pass@k (at least one success) or pass^k (all must succeed)?
  - **Default to pass^k for user-facing agents.** Research shows even state-of-the-art agents pass less than half of customer service tasks on any single try, and pass^8 drops below 25%. An agent that looks decent on one try is unreliable over multiple interactions. Users expect consistent behavior, not coin flips.
  - Use pass@k only for capability exploration or internal tooling where retries are acceptable.

### Suite-Level Criteria

- **Regression floor**: P0 evals must maintain near-100% pass rate
- **Capability target**: P1/P2 evals start low, define the hill to climb
- **Graduation rule**: When a capability eval hits sustained >95%, it graduates to regression
- **Saturation rule**: When a regression eval hits 100% for N consecutive runs, flag for replacement with harder tasks
- **Baseline comparison**: For any new component (skill, tool, memory system, harness change), run evals without it (control) and with it (treatment). If the component doesn't measurably improve outcomes, it adds complexity without value.

### Non-Functional Metrics (The Underexplored Gaps)

These universal dimensions apply to all archetypes and MUST be part of every eval plan:

- **Cost-efficiency**: Token usage, latency, cost per task, API call count. Set budgets early.
- **Safety**: Harmful output detection, policy compliance, data leakage, PII handling. Include adversarial test cases.
- **Robustness**: Behavior under malformed input, edge cases, adversarial prompts, partial failures. Does the agent degrade gracefully or catastrophically?
- **Governance**: Privacy leakage rate, deletion compliance (can the system forget when required?), access-scope violations. Critical for any agent handling user data or operating under regulatory constraints.
- **Observability**: Can you see the full agent trajectory — what it read, wrote, invoked, and in what order? Pass/fail alone is insufficient for iteration. Design eval harnesses to capture interaction traces, not just final outcomes.

Track these alongside correctness. Start as tracked metrics, promote to pass/fail gates as baselines stabilize.

### Harness-Specific Metrics (for systems with orchestration infrastructure)

These dimensions are included by default for single-agent and multi-agent archetypes. For other archetypes, include them only if the system has orchestration infrastructure:

- **Routing accuracy**: Does the right tool or specialist get selected? Accuracy degrades past 15-20 tools — test with increasing tool counts.
- **Context compaction fidelity**: Do critical instructions survive window compression? Test by checking whether the agent follows early instructions after compaction occurs.
- **Sensor coverage**: Do your checks (linters, validators, type checkers) actually fire on relevant input? Silence may mean blind spots, not quality.
- **Fault recovery**: Inject faults (500s, malformed JSON, timeouts) and verify the agent recovers rather than looping indefinitely.
- **Premature completion**: Does the agent declare "done" before the task is actually finished?
- **Over-ambition**: Does the agent exhaust its context window mid-task? Test with tasks that require sustained reasoning across many steps.
- **Model transferability**: Does the harness work across different LLMs? Infrastructure improvements tend to generalize — test this.

Scaffold differences can dominate outcomes even under fixed base models. Evaluate the harness independently from the agents running inside it.

### Memory-Specific Metrics (for agents with persistent state)

These dimensions are included by default for single-agent and multi-agent archetypes when the spec describes persistent state. For other archetypes, include them only if the system maintains memory across turns or sessions:

- **Memory quality**: Retrieval precision/recall, contradiction rate, staleness distribution of recalled facts.
- **Selective forgetting**: Can the agent discard outdated information without losing critical facts?
- **Cross-session coherence**: Does the agent maintain consistent behavior across sessions separated by time?
- **Consolidation fidelity**: When memories are compressed or summarized, does safety-critical information survive?

Memory architecture often matters more than model choice — the gap between "has memory" and "no memory" frequently exceeds the gap between different model versions. Eval accordingly.

## Phase 10: Present Eval Plan

Present the complete eval plan to the user organized by priority:

1. **P0 evals** (must-pass) — show first, get explicit approval
2. **P1 evals** (core functionality) — show next
3. **P2 evals** (quality) — show last
4. **Suite-level criteria** — thresholds, metrics, graduation rules

Wait for user approval before proceeding.

## Phase 11: Coverage Check

After presenting the eval plan, scan the original spec for components that the eval plan does NOT cover. This is a gap-detection step — the most common failure mode is scoping down to the easy deterministic pieces while quietly omitting the agent/LLM components that actually need evaluation.

Check for:

1. **Uncovered agent components**: Does the spec describe agents, skills, or sub-agents that make LLM calls? If so, does the eval plan include LLM-as-judge graders and pass^k metrics for those components, or did it only cover the deterministic infrastructure around them?

2. **Uncovered LLM call paths**: Trace every path in the spec where an LLM is invoked (generation, extraction, classification, summarization, tool selection). Each path needs at least one eval task. If any path has zero coverage, flag it.

3. **Missing grader diversity**: If the spec describes a system with both deterministic and non-deterministic components but the eval plan only has code-based graders, the non-deterministic parts are unevaluated. Flag this explicitly.

4. **"Evaluated separately" without a plan**: If the eval plan scopes out any component with language like "evaluated separately" or "tested in a different plan," verify that a separate eval plan exists or is planned. If not, either include it in this plan or surface it to the user as a gap that needs its own eval plan.

5. **Uncovered archetypes**: For each matched archetype, verify that at least one eval task covers an archetype-specific dimension. If a matched archetype has zero archetype-specific coverage, flag it.

Present any gaps to the user:

> "The eval plan covers [X, Y, Z] but the spec also describes [A, B] which are not covered. These components make LLM calls and need their own eval tasks with [LLM-as-judge / pass^k / outcome verification]. Want me to:
>
> 1. Add eval tasks for these components to this plan?
> 2. Create a separate eval plan for them?
> 3. Consciously skip them (document why)?"

If gaps are found, return to Phase 6 to add eval tasks. Re-run Phases 7-9 for new tasks only.

Do NOT proceed to Phase 12 or beyond until all gaps are resolved — either covered or explicitly skipped with the user's approval.

## Phase 12: Framework Compatibility Check

Verify the eval plan is implementable with common eval frameworks. Add a "Framework Compatibility Notes" section to any task that needs non-standard capabilities.

Common capability gaps to check:

- **Multi-session state**: Most frameworks are single-session. Tasks requiring cross-session evaluation need custom state management.
- **Container sandboxing**: Harbor supports natively. Others need Docker setup for isolation.
- **Statistical graders**: Typically require custom scoring functions wrapping scipy/statsmodels. Not built into most agent eval frameworks.
- **Pairwise comparison**: Inspect AI supports natively. Others need custom harness code.

Reference agent-eval-harness, Harbor, and Inspect AI as execution environments. If any task has no clear implementation path, flag it to the user.

## Phase 13: Write Eval Plan File

After user approval, write the eval plan. Default path:
`docs/eval-plans/YYYY-MM-DD-<topic>-eval-plan.md`

If the project already has an eval-related directory (e.g., `evals/`, `tests/evals/`, `evaluation/`), use that instead. Ask the user if multiple candidates exist.

Use the structure from `references/eval-plan-template.md` as the output format. See `references/example-eval-plan.md` for a filled-in example.

Ask the user to review the written eval plan file. Once they approve, ask if they want to commit it. Do NOT commit without explicit user approval.

## Phase 14: Transition to Implementation Planning

After the eval plan is approved and committed, invoke the **writing-plans** skill if available. If the user does not have the writing-plans skill installed, present the eval plan as a standalone artifact and guide them to create their implementation plan with these integration points:

- Map each implementation step to the eval tasks it must pass
- Include an eval harness setup phase early in the plan
- Add CI/CD integration for running evals
- The implementation is not done until the evals pass

When framing the implementation plan (if writing-plans is available):

- Reference the eval plan file as acceptance criteria
- Each implementation step should note which eval tasks it must pass
- The plan should include an "eval harness setup" phase early in implementation
- CI/CD integration for running evals should be part of the plan

The implementation is not done until the evals pass. The evals are the definition of done.

## Key Principles

- **Evals before code**: The eval plan defines what "done" means. Implementation follows.
- **Balanced coverage**: Always test both positive and negative cases.
- **Grade outcomes, not paths**: Don't over-specify how the agent should solve the problem.
- **Start small, iterate**: 20-50 tasks beats 0 tasks. Expand from real failures later.
- **Binary judgments**: PASS/FAIL, not scales. A fail is actionable; a "3" is ambiguous.
- **No single layer catches everything**: Combine code-based, LLM-as-judge, and outcome verification.
- **Evals are living artifacts**: They graduate, saturate, and get replaced. Plan for this.
