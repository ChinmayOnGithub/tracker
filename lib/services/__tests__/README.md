# SyncedActivityService Test Suite

## Overview

This test suite verifies the production-hardiness of the Sync Engine implementation, focusing on race conditions, memory leaks, and concurrent access patterns.

## Test Files

### 1. `SyncedActivityService.test.ts`
Integration tests verifying backward compatibility and feature flag behavior.

**Tests:**
- Method exposure and signature compatibility
- Feature flag delegation (sync engine enabled/disabled)
- Stats structure validation

### 2. `SyncedActivityService.race-conditions.test.ts`
Tests for concurrent access safety and race condition prevention.

**Tests:**
- Concurrent initialization (React Strict Mode, rapid user actions)
- Rapid repeated operations (50 concurrent creates, 20 rapid updates)
- Alternating create/delete cycles
- Feature flag changes during operations
- Multiple concurrent users (10 simultaneous)
- Shutdown during pending operations

### 3. `SyncedActivityService.memory-leaks.test.ts`
Tests for proper resource cleanup and memory leak prevention.

**Tests:**
- Map growth with 100 concurrent users
- Cleanup on shutdown (individual and shutdownAll)
- Event listener removal
- Long-running session stability (100 operations)
- Initialization set cleanup on success and failure

## Key Design Decisions

### Mock Strategy
All tests use mocked `ActivityService` to:
- Avoid database dependencies
- Ensure deterministic behavior
- Enable fast execution (< 200ms for full suite)
- Prevent foreign key constraint violations

### Cleanup Strategy
Each test file includes:
- `beforeEach`: Reset environment, clear mocks
- `afterEach`: Shutdown all sync engines, reset feature flag

This ensures complete isolation between tests.

### Test Determinism
- No timing dependencies (removed flaky `setTimeout` patterns)
- No database state dependencies
- Proper mock reset between tests
- Consistent execution order

## Running Tests

### Run all sync tests
```bash
bun test lib/services/__tests__/SyncedActivityService
```

### Run specific test file
```bash
bun test lib/services/__tests__/SyncedActivityService.race-conditions.test.ts
bun test lib/services/__tests__/SyncedActivityService.memory-leaks.test.ts
```

### Run with script
```bash
./scripts/test-sync-engine.ps1
```

## Expected Results

**All tests should pass consistently:**
- 21 total tests across 3 files
- 0 failures
- Execution time: ~160ms

## Test Coverage

The test suite covers:
- ✅ Race conditions in concurrent initialization
- ✅ Duplicate operation prevention
- ✅ Memory leak prevention
- ✅ Event listener cleanup
- ✅ Map growth control
- ✅ Feature flag behavior
- ✅ Shutdown safety
- ✅ React Strict Mode compatibility

## Bugs Fixed

1. **Infinite recursion in initialization** - Replaced recursive setTimeout with Promise-based coordination
2. **Memory leaks in Maps** - Added proper cleanup in shutdown methods
3. **Event listener leaks** - Fixed NetworkManager cleanup
4. **Race condition in duplicate check** - Made duplicate detection atomic with locks
5. **Processing map leaks** - Added finally blocks to ensure cleanup
6. **React Strict Mode issues** - Added initialization guard
7. **Database dependencies** - Mocked ActivityService for test isolation

## Maintenance

When adding new sync functionality:
1. Add corresponding test to appropriate file
2. Ensure test uses mocked ActivityService
3. Add cleanup in afterEach if needed
4. Verify test passes consistently (run 5+ times)
5. Update this README if adding new test file
