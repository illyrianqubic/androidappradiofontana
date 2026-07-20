import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { registerTrackPlayerService } from './services/audio/registerTrackPlayerService';

// Sentry is initialised at the top of the bundle so its JS error handler is
// installed before the app tree (expo-router/entry and everything it pulls
// in) evaluates below. Because ES module imports always hoist above a file's
// own body statements, the entry point is loaded with require() further down
// — it runs at THAT line, after Sentry.init() and the Android playback-
// service registration, and it registers the 'main' component synchronously,
// before React Native's native side calls AppRegistry.runApplication('main')
// when the bundle finishes evaluating.
//
// CRASH HISTORY (builds 9–15): a previous version deferred the entry load
// with setTimeout(..., 5000). The native side calls runApplication('main')
// immediately after bundle eval — with 'main' still unregistered for the next
// 5 seconds, AppRegistry threw its "main has not been registered" invariant
// every single launch: EXC_CRASH/SIGABRT on
// com.facebook.react.ExceptionsManagerQueue in all five device crash logs.
// Do not reintroduce any deferral here.

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
// iOS uses services/audio/index.ios.ts (expo-audio) instead of RNTP, and the
// RNTP iOS pod is excluded from autolinking entirely (react-native.config.js),
// so this is gated to Android. The static import above stays:
// trackPlayerNative.ts's own top-level code is lazy/safe (e204afe), so merely
// importing it does not touch RNTP.
if (Platform.OS === 'android') {
  registerTrackPlayerService();
}

// Load the expo-router bootstrap, which registers the 'main' app component.
// Must execute synchronously at bundle-eval time (see CRASH HISTORY above).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
