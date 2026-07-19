import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { registerTrackPlayerService } from './services/audio/registerTrackPlayerService';

// DIAGNOSTIC (iOS startup-crash investigation): five consecutive real
// device crash logs (builds 9, 11, 12, 13) have all shown an identical
// signature — EXC_CRASH/SIGABRT, faulting thread queue
// "com.facebook.react.ExceptionsManagerQueue", byte-identical app-binary
// offsets — regardless of which audio library or expo-updates config was
// in play. That means the crash is very likely inside a piece of code
// that hasn't changed across any of those builds (React Native's own
// exception-reporting path, or similar), triggered by some JS exception
// whose actual message/type Apple's .ips format cannot capture — it only
// sees the native unwind, never into the JS VM. Sentry's SDK captures the
// JS-level exception before any native abort, which is the one thing
// static analysis of five crash logs couldn't provide.
//
// SEQUENCING: ES module imports always execute before a file's own body
// statements, regardless of source order (confirmed empirically earlier
// in this investigation) — so Sentry.init() below can only run before
// expo-router/entry's bootstrap (which loads the entire app/_layout.tsx
// tree, and is almost certainly where this ~18ms-after-launch crash
// actually happens) if that import is deferred to run AFTER Sentry.init(),
// not as a static top-level import alongside gesture-handler. A static
// `import 'expo-router/entry'` here would already have fully executed (or
// crashed) before Sentry.init() ever got a chance to run.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Crash/error capture only — no performance tracing needed for this
    // investigation, keep startup overhead minimal.
    tracesSampleRate: 0,
    enableNative: true,
    attachStacktrace: true,
  });
} else if (__DEV__) {
  console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set — crash reporting is disabled. See README/report for setup steps.');
}

// Register the TrackPlayer headless task so Android can invoke it when
// the user taps lock-screen media controls while the app is in the
// background. Must be called before any background task runs.
//
// iOS uses services/audio/index.ios.ts (expo-audio) instead of RNTP —
// react-native-track-player's native module has been confirmed (via a
// controlled A/B test against real device crash logs) to crash on iOS
// init. This call is gated to Android so registerTrackPlayerService.ts's
// registerPlaybackService() — which is what actually requires
// 'react-native-track-player' on iOS via a setImmediate-deferred callback
// (see trackPlayerNative.ts) — never runs on iOS at all. The static
// import above stays: trackPlayerNative.ts's own top-level code is
// already lazy/safe (e204afe), so merely importing it does not touch RNTP.
if (Platform.OS === 'android') {
  registerTrackPlayerService();
}

// Deferred 5s so Sentry has time to flush any pending crash report from
// the previous session before expo-router/entry's bootstrap (and
// everything downstream of it) starts running.
setTimeout(() => {
  // @ts-expect-error expo-router/entry is a side-effect-only module with no
  // declared exports/types (the static `import 'expo-router/entry'` form
  // this replaces didn't need types either — TS is just stricter about
  // dynamic import() targets needing a resolvable declaration).
  void import('expo-router/entry');
}, 5000);
