# Post-Audit Action Plan: How to Process Results

**Status**: Awaiting audit completion  
**Trigger**: When INVESTIGATION_REPORT_PHASE_1_3.md is created  
**Owner**: Orchestrator (this session)

---

## Immediate Steps When Audit Completes

### 1. Read the Investigation Report

**File**: `d:\github_projeccts\tracker\.agents\memory\INVESTIGATION_REPORT_PHASE_1_3.md`

**Extract**:
- Summary of findings
- Issues by severity (critical, high, medium, low)
- Blockers (environment or design constraints)
- Test results
- Recommendations

**Time to read**: ~15-30 minutes

### 2. Categorize All Findings

Create three lists:

**List A: Critical Issues (Fix Immediately)**
- Any crash/data-loss risk
- Security issues (tokens exposed, auth bypassed)
- 401 infinite loop
- Hard deletes breaking soft-delete
- State machine cycle broken
- Production-blocking bugs

**List B: High Priority (Fix Before Release)**
- Missing features (autosave, sync incomplete)
- Incorrect behavior (postpone chain, allowance)
- Performance issues (N+1 queries)
- Partial implementations

**List C: Deferred (Document & Plan for Later)**
- Edge cases
- "Nice to have" features
- Known limitations
- BLOCKED items (environment constraints)

### 3. For Each Critical Issue

**Decision Point**: Is it fixable in this session?

- **YES**: Proceed to Step 4 (Fix It)
- **NO**: Document blocker, add to FINAL_AUDIT_SYNTHESIS_TEMPLATE.md

### 4. Fix Critical Issues (If Any)

**Pattern for each fix**:

1. **Understand the bug**: Read audit findings + root cause explanation
2. **Locate the code**: Open the file path from audit report
3. **Design the fix**: Minimal change, no refactoring
4. **Implement**: Apply fix
5. **Add/update test**: Coverage for this bug
6. **Run test suite**: 
   - `cd m && bun test` → all 98 PASS
   - `cd .. && bun test` → all 1001 PASS (or affected ones)
   - `cd m && npx tsc --noEmit` → 0 errors
7. **Document**: Record fix in FINAL_AUDIT_SYNTHESIS_TEMPLATE.md

**If any test fails after fix**:
- Revert fix: `git checkout -- <file>`
- Analyze why test failed
- Fix is wrong or test assumption is wrong
- Document the issue and seek clarification

**Max fixes to attempt**: 3-5 critical issues per session
- If more than 5 critical issues found: escalate to human review
- Too many fixes = too much risk of introducing new bugs

### 5. Run Full Test Suite Once More

Before proceeding:

```bash
cd d:\github_projeccts\tracker\m
bun test
```

Verify:
- 98/98 tests PASS
- 0 failed
- No new failures from fixes

```bash
cd d:\github_projeccts\tracker
bun test
```

Verify:
- 1001/1001 tests PASS
- 0 failed

```bash
cd d:\github_projeccts\tracker\m
npx tsc --noEmit
```

Verify:
- Exit code 0
- 0 errors

### 6. Update Production Readiness Matrix

**File**: `d:\github_projeccts\tracker\docs\mobile-production-readiness.md`

For each feature/area that was audited:

1. Find the row in the matrix
2. Update the status column based on audit findings:
   - `IMPLEMENTED` (code exists but unverified)
   - `IMPLEMENTED + AUTOMATED TESTED` (tests pass)
   - `IMPLEMENTED + ANDROID RUNTIME VERIFIED` (device/emulator tested)
   - `IMPLEMENTED + RELEASE VERIFIED` (release build tested)
   - `PARTIALLY IMPLEMENTED` (feature incomplete)
   - `BROKEN` (audit found bugs)
   - `UNVERIFIED` (unable to verify)
   - `BLOCKED` (environment constraint)

3. Update the "Evidence" column with:
   - Test file and test name
   - Audit findings reference
   - Any caveats or limitations

Example:
```markdown
| SQLite Soft-Delete Compliance | All entities ... | Migration 1,2,3 verified | IMPLEMENTED + AUTOMATED TESTED | All tables have deletedAt column, STATIC-VALIDATED by schema inspection, AUTOMATED TESTED by db-migrations.test.ts passing |
```

### 7. Analyze Blockers

**Identify**:
- Which findings are BLOCKED (no Android 17 device/emulator)?
- Which are UNVERIFIED (no test coverage)?
- Which are intentional design decisions?

**Document**:
- Root cause of each blocker
- How to unblock it (what's needed)
- Timeline estimate (can it be done in this session?)

**Decision**: Can we proceed to Phase 4 (Android 17 testing)?

### 8. Prepare Phase 4 Briefing

**If proceeding to Android 17 testing**:

1. Note any blockers found that affect Android 17:
   - Missing large-screen layout?
   - Keyboard handling on rotate?
   - Local network permission needed?

2. Create test plan for Android 17:
   - Use findings from audit to prioritize tests
   - Focus on areas audit marked UNVERIFIED

3. Document current SDK versions:
   - compileSdk: ?
   - targetSdk: ?
   - Expo: 57.0.26
   - React Native: 0.86.3

**If NOT proceeding**:
- Document reason (blockers found, too many issues, etc.)
- Plan for next session

### 9. Commit Changes (If Any)

If fixes were applied:

```bash
cd d:\github_projeccts\tracker\m
git status
```

Review changes carefully. Then:

```bash
git add -A
git commit -m "fix(mobile): [issue title] — [brief description]

Root cause: [audit finding]
Fix: [what was changed]
Test added: [test file and test name]
Evidence: AUTOMATED TESTED — [test name] passes
"
```

### 10. Update Parent Submodule Pointer

If mobile repo was updated:

```bash
cd d:\github_projeccts\tracker
git add m
git commit -m "chore(submodule): update tracker-mobile to latest audit fixes"
```

### 11. Create Final Synthesis Document

**Fill in**: `FINAL_AUDIT_SYNTHESIS_TEMPLATE.md`

Update sections:
- Executive summary
- What was fixed
- What remains (blockers & gaps)
- Android 17 readiness assessment
- Next phase decision (proceed to 4? or defer?)

---

## Decision Trees

### Decision Tree 1: How Many Critical Issues?

```
Are there critical issues found?
├─ NO → Proceed to Phase 4 (Android 17 testing)
├─ YES (1-2) → Fix them, re-test, proceed to Phase 4
├─ YES (3-5) → Fix, re-test, decide if safe for Phase 4
├─ YES (6+) → Too many issues
│   └─ Document all findings
│   └─ Request human review
│   └─ Do NOT proceed to Phase 4 until reviewed
```

### Decision Tree 2: When Test Fails After Fix

```
Fix applied, test fails:
├─ Is fix too risky? (breaks other tests)
│  └─ Revert fix
│  └─ Document as DEFERRED
│  └─ Proceed with unfixed (accept risk or document blocker)
├─ Is test wrong? (false positive)
│  └─ Update test assumption
│  └─ Verify fix still applies
│  └─ Proceed with fix
├─ Is fix incomplete? (more work needed)
│  └─ Revert fix
│  └─ Document as BLOCKED or DEFERRED
└─ Is the issue complex?
   └─ Revert fix
   └─ Document in INVESTIGATION_REPORT
   └─ Request human review
```

### Decision Tree 3: Proceed to Android 17 Testing?

```
Are all critical issues resolved?
├─ YES, AND tests pass, AND all high-priority features verified
│  └─ PROCEED to Phase 4
├─ YES, BUT some high-priority gaps remain
│  └─ CONDITIONAL proceed (document known gaps)
├─ NO, critical issues unresolved
│  └─ DO NOT proceed
│  └─ Document blockers
│  └─ Request human review
└─ UNVERIFIED (no test environment)
   └─ CONDITIONAL proceed if low-risk
   └─ Or DEFER Android 17 testing until environment available
```

---

## What Could Go Wrong: Scenarios

### Scenario 1: Many Critical Issues Found (6+)

**Indicators**:
- Soft-delete not actually soft
- Hard deletes everywhere
- Token in AsyncStorage
- 401 infinite loop
- Multiple state machine bugs
- Sync completely broken

**Action**:
1. Do NOT attempt to fix all in one session
2. Categorize by dependency (fix A enables B)
3. Fix only foundation issues (auth, database safety)
4. Document rest as DEFERRED
5. Request human decision on priority

### Scenario 2: Test Failures Cascade

**Indicators**:
- Fix one bug, 3 tests break
- Revert fix, tests pass
- Each fix attempt causes new failures

**Action**:
1. Stop fixing
2. Review the 3 failing tests
3. Understand what shared assumption broke
4. Likely: the fix is conceptually wrong
5. Document issue and seek clarification

### Scenario 3: Android 17 Shows Incompatibility

**Indicators**:
- App crashes on Android 17 emulator
- But audit found nothing

**Action**:
1. Capture logcat output
2. Analyze crash stack trace
3. Link back to code
4. This is a NEW finding (not audit's fault)
5. Document and fix if possible

### Scenario 4: Git State Gets Messy

**Indicators**:
- Multiple edits in progress
- Uncertain which changes are intentional
- Some edits committed, some not

**Action**:
1. `git status` to see current state
2. `git diff` to see uncommitted changes
3. Decide for each: keep or discard?
4. Commit clean, distinct changes
5. One logical change per commit

---

## Success Criteria for Post-Audit

- [ ] Audit report read and findings categorized
- [ ] All critical issues addressed (fixed or deferred with reason)
- [ ] Test suite: 98/98 mobile PASS
- [ ] Test suite: 1001/1001 parent PASS
- [ ] TypeScript: 0 errors
- [ ] Production readiness matrix updated
- [ ] Phase 4 decision made (proceed or defer)
- [ ] All commits clean and documented
- [ ] No uncommitted changes
- [ ] FINAL_AUDIT_SYNTHESIS_TEMPLATE.md completed

---

## Timeline Estimate

- Read audit report: 15-30 min
- Categorize findings: 10-15 min
- Fix critical issues: 30-90 min (depends on count and complexity)
- Run test suites: 5-10 min
- Update readiness matrix: 20-30 min
- Final documentation: 10-15 min

**Total: 90 min to 3+ hours** (depending on findings)

**If too many issues found**: Escalate to human instead of attempting fixes.
