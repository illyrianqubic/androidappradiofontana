import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerTrackPlayerService } from './services/audio/registerTrackPlayerService';
import 'expo-router/entry';

// DIAGNOSTIC (iOS startup-crash investigation): log the exact JS error
// before RN's default handler reports it to native. In production builds,
// an uncaught fatal JS exception is routed to RCTExceptionsManager on a
// dedicated GCD queue for native reporting — if that reporting path itself
// throws, the whole process aborts. Confirmed against a real device crash
// log: EXC_CRASH/SIGABRT, faulting thread queue
// "com.facebook.react.ExceptionsManagerQueue", no JS-level info attached
// (Apple's .ips format can't see into the JS VM, only the native unwind).
//
// IMPORTANT CAVEAT: ES module imports always execute before a file's own
// body statements, regardless of source order — so this handler cannot
// install before the `expo-router/entry` import above finishes its own
// bootstrap (which loads the entire app tree). If the crash originates
// during that bootstrap, as the evidence so far suggests, this handler
// installs too late to catch it. It's still worth having for any fatal
// error that occurs after startup completes, and costs nothing.
//
// ErrorUtils is RN's own error-guard polyfill, installed as a global by
// the runtime before any user code runs — it isn't exported from
// 'react-native' itself, hence the local type instead of an import.
type RNErrorHandler = (error: unknown, isFatal?: boolean) => void;
type RNErrorUtils = {
  getGlobalHandler(): RNErrorHandler;
  setGlobalHandler(handler: RNErrorHandler): void;
};
declare const global: typeof globalThis & { ErrorUtils?: RNErrorUtils };

if (global.ErrorUtils) {
  const previousHandler = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[STARTUP CRASH]', isFatal ? 'FATAL' : 'non-fatal', err.message, err.stack);
    previousHandler(error, isFatal);
  });
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
