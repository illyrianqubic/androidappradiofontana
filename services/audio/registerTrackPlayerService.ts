import { TrackPlayer } from './trackPlayerNative';

let registered = false;

export function registerTrackPlayerService() {
  if (registered) return;
  registered = true;

  // Lazy-import the service module so react-native-track-player is never
  // loaded at module level in the main app context. RNTP v5 alpha's entry
  // point calls TurboModuleRegistry.getEnforcing('TrackPlayer'), which
  // crashes synchronously when the native module is unavailable (Expo Go)
  // or incompatible with the New Architecture.
  TrackPlayer.registerPlaybackService(() => async () => {
    const { trackPlayerService } = await import('./trackPlayerService');
    await trackPlayerService();
  });
}
