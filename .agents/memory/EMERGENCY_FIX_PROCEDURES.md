# Emergency Fix Procedures for Audit Findings

If critical issues are discovered during the audit, follow these procedures to fix them safely.

## Procedure 1: Critical Issue Fix Pattern

### When an Issue is Found

1. **Document the Issue**
   - File path and line number
   - Root cause explanation
   - Impact assessment (crashes? data loss? security?)
   - Reproduction steps (if testable)

2. **Verify the Issue**
   - Can it be reproduced reliably?
   - Is it in test-covered code or blind spot?
   - What's the scope (mobile only? parent too?)

3. **Design the Fix**
   - Minimal code change (no refactoring in emergency fix)
   - No side effects
   - Preserves existing behavior except bug fix

4. **Implement the Fix**
   - Edit the file
   - Keep change surgical (1-2 line changes if possible)

5. **Add/Update Test**
   - If no test covers this code: add one
   - If test exists: update to verify fix
   - Run test and verify PASS

6. **Run Full Suite**
   - `cd m && bun test` — all 98 tests PASS
   - `cd .. && bun test` — all 1001 tests PASS (or at least mobile-relevant ones)

7. **Verify TypeScript**
   - `cd m && npx tsc --noEmit` — 0 errors

8. **Document the Fix**
   - Add entry to INVESTIGATION_REPORT_PHASE_1_3.md
   - Note file, line, root cause, fix, test added

## Procedure 2: Token Storage Bug (AsyncStorage instead of SecureStore)

**Issue**: Token stored in plain AsyncStorage instead of encrypted SecureStore

**Fix**:
1. Find: `AsyncStorage.setItem('token', token)`
2. Replace with: `await SecureStore.setItemAsync('token', token)`
3. Find: `AsyncStorage.getItem('token')`
4. Replace with: `await SecureStore.getItemAsync('token')`
5. Find: `AsyncStorage.removeItem('token')`
6. Replace with: `await SecureStore.deleteItemAsync('token')`
7. Update test to mock SecureStore instead of AsyncStorage
8. Verify import: `import * as SecureStore from 'expo-secure-store'`

**Test**: Write test that:
- Calls login
- Verifies token in SecureStore (not AsyncStorage)
- Verifies cold boot retrieves token
- Verifies logout clears token

## Procedure 3: 401 Infinite Loop Bug

**Issue**: When server returns 401, drain worker retries forever instead of stopping

**Fix Location**: `m/src/sync/drainWorker.ts`

**Fix**:
1. Find the drain loop error handling
2. Add 401 check:
   ```typescript
   if (error.status === 401) {
     // Clear token, logout user
     await AuthService.logout();
     // Stop drain worker
     return { processed: 0, errors: 1 };
   }
   ```
3. Verify logout actually clears token and navigates to login

**Test**: Write test that:
- Enqueues mutation
- Drain worker processes it
- Server returns 401
- Verify: worker stops (doesn't retry)
- Verify: user logged out
- Verify: mutation left in queue (for retry after re-login)

## Procedure 4: Hard Delete Found Bug

**Issue**: `DELETE FROM activity_template` instead of soft delete

**Fix Location**: `m/src/db/repository.ts` (TemplateRepository)

**Fix**:
1. Find: `DELETE FROM activity_template WHERE id = ?`
2. Replace with: `UPDATE activity_template SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`
3. Find: `DELETE FROM` and verify all are soft-delete semantics
4. Update any queries that list templates to add: `WHERE deleted_at IS NULL`

**Test**: Write test that:
- Create template
- Delete template
- Verify `deleted_at` is set
- Verify template still in DB (soft-deleted)
- Verify template not in `getActiveTemplates()` results
- Verify `restore()` sets `deleted_at = null`

## Procedure 5: Missing Debounce in Autosave

**Issue**: Journal autosave fires on every keystroke instead of debounced

**Fix Location**: `m/src/features/journal/JournalScreen.tsx`

**Fix**:
1. Find: `onChange={handleJournalChange}` or similar direct handler
2. Wrap with debounce:
   ```typescript
   const debouncedSave = useMemo(
     () => debounce((value: string) => {
       enqueueOutboxMutation('update_journal', { content: value });
     }, 1500),
     []
   );
   
   const handleChange = (value: string) => {
     setLocalContent(value); // Instant local UI
     debouncedSave(value); // Debounced save
   };
   ```

**Test**: Write test that:
- User types 5 characters
- Verify `enqueueOutboxMutation` called once (not 5 times)
- Verify timing is ~1500ms after last keystroke

## Procedure 6: Postpone Chain Broken

**Issue**: Re-postpone on D+1 doesn't move to D+2, stays on D+1

**Fix Location**: `m/src/domain/timeline.ts` (computeTaskOccurrences)

**Fix**:
1. Understand: postpone creates a log entry with status=`POSTPONED` and `target_date = D+1`
2. Find: where postponed logs are parsed
3. Verify: if multiple postpone logs on same task, they should chain
4. Example test case:
   - Day D: task scheduled → postpone → log with target=D+1
   - Day D+1: task appears → postpone → new log with target=D+2
   - Verify: `computeTaskOccurrences(D+2)` includes task

**Test**: 
```typescript
const logs = [
  { date: 'D', status: 'POSTPONED', target: 'D+1' },
  { date: 'D+1', status: 'POSTPONED', target: 'D+2' },
];
const result = computeTaskOccurrences(logs, 'D+2');
expect(result[0].status).toBe('PENDING'); // Task is pending on D+2
```

## Procedure 7: Soft-Delete Compliance Check

**Issue**: Soft-delete columns missing on some tables

**Fix**:
1. Run migration to add `deleted_at TEXT NULL` to all soft-deletable tables:
   - activity_template
   - activity_log
   - calendar_event
   - journal_entry
   - note
   - weight_entry
   - leave_record

2. Create new migration file: `m/src/db/migrations/add-soft-delete-columns.ts`

3. SQL:
   ```sql
   ALTER TABLE activity_template ADD COLUMN deleted_at TEXT NULL;
   -- repeat for all tables
   ```

4. Update all deletion operations in repositories to use soft-delete

5. Update all SELECT queries to filter: `WHERE deleted_at IS NULL`

**Test**:
- Run migration
- Verify schema has `deleted_at` on all tables
- Verify unit tests for soft-delete pass

## Procedure 8: Rollback on Test Failure

If any fix causes test failures:

1. **Identify failed test**: Look at error message
2. **Understand why**: Does fix break existing behavior?
3. **Options**:
   - Revert fix and reconsider (if fix was wrong)
   - Update test expectation (if test was wrong)
   - Fix both code and test (if both needed changes)

4. **Revert**:
   ```bash
   cd m
   git diff # see what changed
   git checkout -- src/file-changed.ts # revert single file
   ```

5. **Re-run tests**: Verify we're back to baseline

6. **Diagnose**: Think about the fix more carefully before re-attempting

## Procedure 9: Critical Security Issue (Token Exposure)

If tokens found in logs or telemetry:

1. **Immediate**: Stop all telemetry/logging related to tokens
2. **Audit**: Find all places tokens might leak
3. **Fix**: Strip tokens from all logs/errors
4. **Test**: Write test that logs error with token, verify token not in output
5. **Security Review**: Have someone else review changes
6. **Documentation**: Document why this happened and how it's prevented

## Procedure 10: Data Integrity Issue

If mutations can be lost or duplicated:

1. **Audit**: Trace mutation lifecycle end-to-end
2. **Test**: Write scenario tests:
   - App killed mid-mutation → data survives
   - Server responds after app kill → no duplicate
   - Offline with multiple mutations → all enqueued

3. **Fix**: Ensure atomic SQLite transactions around:
   - Local update
   - Outbox enqueue
   - Drain processing
   - Drain completion

4. **Verify**: All mutation operations are wrapped in transactions

## When to Stop and Ask for Help

Stop immediately and ask for guidance if:
- Fix causes multiple test failures (indicates deeper issue)
- Fix requires changing API contract (server compatibility)
- Fix requires database migration (risk of data loss)
- Fix requires new dependency
- Root cause unclear despite investigation
- Same issue keeps reappearing after fix

**In these cases**: Document finding, add to INVESTIGATION_REPORT, and wait for human decision before proceeding.

