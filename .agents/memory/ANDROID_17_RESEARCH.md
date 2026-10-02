# Android 17 (API 37) Readiness Research for Tracker Mobile

## Executive Summary

Android 17 is API level 37. Tracker must pass THREE DISTINCT TESTS before changing targetSdk:

1. **Run existing app on Android 17** (don't change targetSdk) → discover all-app behavior changes
2. **Compile against SDK 37** → ensure native toolchain compatibility
3. **Evaluate and test target-37 specific changes** → before opting in

## Current Stack

- Expo SDK: 57.0.26 (released June 30, 2026)
- React Native: 0.86.3 (no breaking changes from 0.85)
- Android Gradle Plugin: (to be determined from prebuild)
- Gradle: (to be determined)
- Kotlin: (to be determined)
- compileSdk: (currently unknown, likely 36)
- targetSdk: (currently unknown, likely 36)

**React Native 0.87+ already compiles against SDK 37.** This is a framework + toolchain migration, not just an SDK edit.

## Android 17 Behavior Changes Affecting Tracker

### All-App Changes (regardless of targetSdk)

#### Memory Limits (CRITICAL FOR TRACKER)

**Impact**: HIGH if Tracker loads large image collections, calendar histories, or journal attachments

- Android 17 enforces app memory limits based on device RAM
- Limits focus on memory leaks and outliers
- Can exit with `REASON_OTHER` and `"MemoryLimiter:AnonSwap"` in description

**Tracker considerations:**
- Calendar: does it load unbounded event histories?
- Journal: image attachment loading strategy
- Icons/symbols: bundled locally, no issue
- Lists: pagination implemented?
- Test: `adb am memory-limiter manual <pid> <limit_mb>` to test limits

#### SMS/OTP Protection

**Impact**: LOW for Tracker (not a credential/auth-via-SMS app)

- WebOTP messages only accessible after 3-hour delay if app is not domain-verified
- WebOTP + SMS Retriever: migrate to official APIs
- Tracker uses Google OAuth only, not SMS-based auth

#### IME (Soft Keyboard) Visibility on Rotation

**Impact**: MEDIUM if Tracker has journal/notes/forms that handle rotation

- On configuration change (rotation), keyboard visibility is NOT restored
- Must explicitly request with `android:windowSoftInputMode="stateAlwaysVisible"` or code
- Tracker considerations: JournalScreen, NotesScreen, LeaveModal on rotate

#### Touchpad Relative Events During Pointer Capture

**Impact**: LOW (tablet/foldable consideration)

- Touchpads deliver relative motion instead of absolute finger position
- Apps requesting pointer capture must opt into old behavior if needed
- Tracker: not a pointer-capture app

#### Background Audio Hardening

**Impact**: LOW (no audio playback in Tracker)

- Audio APIs fail silently if called outside valid lifecycle
- Audio focus API returns AUDIOFOCUS_REQUEST_FAILED
- Tracker: no background audio

### Target SDK 37 Changes (only if app targets API 37)

#### Static Final Field Reflection Blocked

**Impact**: LOW to MEDIUM depending on native modules

- Apps cannot mutate `static final` fields via reflection
- Throws `IllegalAccessException`
- Tracker: audit all native dependencies (Reanimated, Lucide, etc.)

#### Local Network Access Blocked by Default

**Impact**: MEDIUM (if Tracker requires LAN access)

- Must declare `ACCESS_LOCAL_NETWORK` permission
- `LOCAL_NETWORK_DENY_APPS` intent action available
- Tracker considerations:
  - Does Tracker sync with local server instances? (development only? or production?)
  - If API URL is localhost/192.168.x.x, need explicit permission

**Current config:**
```json
"EXPO_PUBLIC_API_URL": "http://192.168.1.27:3000" (preview)
```

Action required: verify if mobile ever connects to local network in production. If only during dev/preview, exempt from permission handling.

#### Dynamic Code Loading Restrictions

**Impact**: LOW (React Native managed by Expo)

- Native files loaded via `System.load()` must be read-only
- Throws `UnsatisfiedLinkError` if writable
- Tracker: Expo managed, no custom JNI

#### Certificate Transparency (CT) Enabled by Default

**Impact**: LOW (HTTPS only)

- CT now enabled by default (was opt-in on Android 16)
- Tracker: uses HTTPS API URLs only (`https://tracker.chinmaypatil.com`)
- Check: any self-signed certs or local HTTP URLs → may fail

#### Large Screen / Tablet Requirements

**Impact**: MEDIUM (Tracker may run on tablets/foldables)

- Cannot opt out of resizability on screens with 600dp+ width
- Must support portrait, landscape, split-view
- No aspect-ratio or orientation locks allowed

**Tracker considerations:**
- Currently `"orientation": "portrait"` in app.json
- Must handle large-screen layouts
- Test: tablet emulator, landscape, split-view

#### Additional Target-37 Changes

- Safer dynamic code loading for native libraries
- MessageQueue reflection restrictions
- Bluetooth autonomous re-pairing
- BluetoothSocket reads returning -1 on RFCOMM close

## Testing Protocol for Tracker

### Phase 1: All-App Compatibility (Android 17, current targetSdk)

Priority order:

1. **Cold launch** — app starts cleanly
2. **Memory baseline** — profile initial memory footprint
3. **Google OAuth** → login flow, deep link callback
4. **Today screen** — load tasks, complete, postpone
5. **Calendar** — load month/week/day, sync with Google
6. **Journal/Notes** — create, edit, autosave
7. **Background → foreground** — resume state
8. **Rotation** — landscape on all screens (especially forms)
9. **Keyboard** — JournalScreen, NotesScreen on rotate
10. **Large screen** — tablet emulator (if available)
11. **Memory under load** — long list, many calendar events
12. **Network failure** — offline, reconnect, outbox sync

### Phase 2: Compile Against SDK 37

Prerequisites:
- Android Gradle Plugin: verify compatibility
- Kotlin: verify version
- Gradle: verify version

Steps:
1. Update `compileSdk = 37` in build.gradle (via Expo config)
2. Run `expo prebuild --clean` to regenerate native
3. Verify Gradle sync completes
4. Verify no new build errors

### Phase 3: Evaluate Target-37 Changes

1. Audit for local network access needs
   - Check all API URL patterns
   - Verify production doesn't use localhost
2. Test large-screen behavior (tablet, landscape, split-view)
3. Verify calendar/journal keyboard behavior post-rotation
4. Check for reflection-based native modules
5. Verify CT/HTTPS compliance

## Current Status

- **All-app testing**: NOT YET DONE (blocked without Android 17 device/emulator)
- **SDK 37 compilation**: NOT YET DONE (pending Phase 1 results)
- **Target-37 changes**: NOT YET DONE (pending SDK 37 compilation)

## Next Steps

1. Verify current compileSdk and targetSdk in app
2. Check Expo/RN support matrix for SDK 37
3. Set up Android 17 emulator if available
4. Run Phase 1 all-app testing
5. Record failures with logcat
6. Proceed to SDK 37 if Phase 1 passes

## References

- [Android 17 Behavior Changes: All Apps](https://developer.android.com/about/versions/17/behavior-changes-all)
- [Android 17 Behavior Changes: Target API 37+](https://developer.android.com/about/versions/17/behavior-changes-17)
- [Android 17 Migration Guide](https://developer.android.com/about/versions/17)
- [React Native 0.86 Release Notes](https://reactnative.dev/blog/2026/06/11/react-native-0.86)
- [Expo SDK 57 Changelog](https://expo.dev/changelog/sdk-57)
- [Android 17 Readiness for React Native/Expo](https://dopebase.com/blog/android-17-react-native-readiness)
