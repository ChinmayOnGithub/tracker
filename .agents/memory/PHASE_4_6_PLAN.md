# Phases 4-6 Planning: Android 17 Readiness & Release

## Phase 4: Android 17 Compatibility Testing

### Phase 4A: Research Android 17 Support in Current Stack

**Status**: Research complete (see ANDROID_17_RESEARCH.md)

**Findings**:
- Expo 57.0.26: Released June 30, 2026, uses React Native 0.86.3
- React Native 0.86.3: No breaking changes from 0.85, includes edge-to-edge fixes
- React Native 0.87+: Already compiles against SDK 37 (framework + toolchain migration)
- Current stack (0.86.3): May not have native SDK 37 support built-in

**Decision Point**: 
- Expo 57 likely targets SDK 36 by default
- Expo 58+ may be required for SDK 37 support
- OR: Manually configure SDK 37 via build.properties/build.gradle

### Phase 4B: Create Android 17 Test Environment

**Blockers**:
- No local Android emulator currently available in this session
- Requires either:
  - Local Android Studio + emulator (developer environment)
  - EAS Build + device testing (cloud)
  - Physical Android 17 device (if available)

**Evidence Needed**:
- Proof of Android 17 runtime execution (emulator/device + logcat)
- Cold launch, warm launch, navigation, auth, all critical flows
- Memory profiling output
- Keyboard behavior verification
- Large-screen layout verification

**Status**: BLOCKED without Android 17 device/emulator access

### Phase 4C: Audit Android 17 Behavior Changes

**Already Addressed**:
1. Memory limits → Tracker apps may load calendar events, journal images (need bounds)
2. Local network access → Tracker uses production HTTPS, dev previews use HTTP/192.168.x
3. IME visibility on rotate → Journal/Notes need keyboard handling verification
4. Static final field reflection → Audit native dependencies (Reanimated, icons)
5. Dynamic code loading → React Native managed by Expo
6. Certificate transparency → HTTPS only, self-signed certs would fail
7. Large-screen requirements → No portrait-only opt-out for 600dp+ width

**Tracker-Specific Audit Items**:

**Memory**:
- [ ] Calendar: verify no unbounded history loading
- [ ] Journal: image loading strategy (lazy, sized, cached?)
- [ ] Icons: all bundled (Lucide + custom symbols)
- [ ] Lists: pagination implemented throughout

**Permissions**:
- [ ] Verify all API URLs use HTTPS in production
- [ ] If any LAN access needed, declare `ACCESS_LOCAL_NETWORK`
- [ ] Check dev-only localhost URLs (10.0.2.2, 192.168.x)

**Keyboard**:
- [ ] JournalScreen: keyboard state preserved across rotation?
- [ ] NotesScreen: keyboard state preserved across rotation?
- [ ] LeaveModal: form keyboard handling

**Large Screen**:
- [ ] No portrait-only orientation lock
- [ ] Responsive layouts for 600dp+ width
- [ ] Split-view compatibility (if applicable)

**Static Final Fields**:
- [ ] Reanimated: reflection-safe?
- [ ] Lucide/icons: reflection-free?
- [ ] expo-secure-store: reflection-free?
- [ ] expo-router: reflection-free?

### Phase 4D: SDK 37 Migration Decision

**Release Gate Checklist**:

```
[?] Does existing app pass Android 17 all-app compatibility matrix?
[?] Does project compile against SDK 37 with supported framework?
[?] Are native dependencies verified (not assumed)?
[?] Have relevant target-37 changes been tested individually?
[?] Do signed release builds pass phone, large-screen, accessibility tests?
```

**Possible Outcomes**:

1. **All Green**: Update compileSdk → 37, targetSdk → 37
   - Rebuild, test, release

2. **Some Failures**: Fix root causes, re-test Phase 4A-C
   - Document each fix with evidence

3. **External Blocker**: Expo/RN support missing for SDK 37
   - Document blocker: "Blocked on Expo SDK X support for SDK 37"
   - Plan migration path (Expo upgrade, RN upgrade, toolchain upgrade)
   - Proceed with current SDK (36 or lower)

## Phase 5: Release Build & Verification

### Phase 5A: Create Release Build

**Steps**:

1. Verify versionCode and versionName in app.json (or EAS config)
2. Verify signing certificate configured
3. Verify AndroidManifest.json permissions correct (via prebuild)
4. Build release APK:
   ```bash
   cd m
   eas build --platform android --build-type apk
   ```
   OR for local:
   ```bash
   cd m
   npx expo prebuild --clean
   cd android
   ./gradlew assembleRelease
   ```

5. Verify build succeeds
6. Test release APK on Android device/emulator
   - Install: `adb install app-release.apk`
   - Run through critical flows
   - Verify no console errors/crashes

**Evidence Required**:
- Build log (successful)
- Signed APK file path
- Installation verification
- Critical flow test results

### Phase 5B: Update Production Readiness Matrix

**Update**: `docs/mobile-production-readiness.md`

For each feature update:
- Current implementation status
- Automated test coverage
- Android runtime verification (with device/emulator name)
- Release build verification

**Example Row**:
```markdown
| Google & Token Authentication | Bearer session token... | Token stored in Android Keystore... | AUTOMATED TESTED (98 tests) | RUNTIME VERIFIED (Pixel 5, Android 17) | RELEASE VERIFIED (APK 0.1.0) | ... |
```

### Phase 5C: Review & Close GitHub Issues

**Issues to Review**:
- #32: Production readiness
- #33: Onboarding
- #40: Mobile vertical slice/runtime validation
- #51: Billing capability proof
- #161: RRULE support
- #185: Mobile future lastSyncedAt
- #186: Mobile deletion conflicts
- #187: restoredLogs
- #188: Sync response limits
- #193: Calendar sync leases
- #195: Activity provisioning/quota enforcement

**Close Only With Evidence**:
- Issue satisfied: link to test, code, or runtime verification
- Issue partially satisfied: update with remaining work
- Issue blocked by external dependency: document blocker, leave open

## Phase 6: Final Commit & Release Preparation

### Step 1: Verify Repository State

```bash
cd d:\github_projeccts\tracker\m
git status                    # Should be clean (except line endings)
git log --oneline -5          # Verify latest commits
```

### Step 2: Commit Mobile Repository

If changes made during audit:

```bash
cd d:\github_projeccts\tracker\m
git add -A
git commit -m "chore(mobile): production hardening audit, Android 17 research, and updated readiness matrix

- Verified all 98 mobile tests pass
- Verified TypeScript: 0 errors
- Researched Android 17 (API 37) compatibility
- Updated production readiness matrix with evidence
- Documented Android 17 behavior changes affecting Tracker
- Status: Ready for Android 17 testing phase
"
git push origin main
```

### Step 3: Update Parent Submodule Pointer

```bash
cd d:\github_projeccts\tracker
git add m
git commit -m "chore(submodule): update tracker-mobile to production audit checkpoint"
git push origin main
```

### Step 4: Final Verification

```bash
cd d:\github_projeccts\tracker
git status                # Should be clean
git log --oneline -1      # Verify submodule update commit
```

### Step 5: Release Checklist

Before any public release:

- [ ] All 98 mobile tests PASS
- [ ] All parent tests affected by mobile PASS
- [ ] TypeScript: 0 errors in mobile
- [ ] TypeScript: 0 errors in parent
- [ ] ESLint: 0 errors in mobile (if configured)
- [ ] Production readiness matrix updated with evidence
- [ ] Android 17 compatibility status documented
- [ ] Release build created and tested
- [ ] Version bumped (if applicable)
- [ ] Git history clean and documented
- [ ] No uncommitted changes

## Blockers & Next Steps

### Currently Blocked
1. **Android 17 Runtime Testing**: Requires Android 17 emulator/device
2. **Release Build Generation**: Requires signing certificate + EAS/local build setup
3. **SDK 37 Compilation**: Blocked until Expo/RN stack evaluated

### Next Immediate Actions
1. Review Phase 1-3 audit results (when workflow completes)
2. Fix any discovered issues with evidence-based approach
3. Determine Android 17 testing environment (emulator, EAS, or device)
4. Proceed with Phase 4 testing if environment available

### Success Criteria
- Mobile app is provably production-ready (evidence-based)
- Android 17 compatibility is understood (behavior changes audited)
- Release build is verifiable (signed APK generated)
- GitHub issues are updated with actual status (not assumed)
