import { TrackPlayer } from './trackPlayerNative';

let registered = false;

export function registerTrackPlayerService() {
  if (registered) return;
  registered = true;

  // Lazy-import the service module so react-native-track-player is never
  // loaded at module level in the main app context. RNTP 4.1.2's entry
  // point constructs new NativeEventEmitter(NativeModules.TrackPlayerModule)
  // and reads Capability constants at module-evaluation time — both throw
  // when the native module is unavailable, which in a release build is an
  // instant crash on the splash screen (this file is imported by the app's
  // root index.ts). The wrapper's registerPlaybackService defers all RNTP
  // evaluation off the startup path; see trackPlayerNative.ts.
  TrackPlayer.registerPlaybackService(() => async () => {
    const { trackPlayerService } = await import('./trackPlayerService');
    await trackPlayerService();
  });
}
