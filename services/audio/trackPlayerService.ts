// Import RNTP directly — the headless JS task context on Android may not
// satisfy our shim's TurboModuleRegistry.get() availability check, which
// would silently drop all addEventListener calls and break lock screen controls.
import TrackPlayer, { Event } from 'react-native-track-player';

export async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[TrackPlayer Service]', Event.RemotePlay);
    TrackPlayer.play().catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[TrackPlayer Service]', Event.RemotePause);
    TrackPlayer.pause().catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[TrackPlayer Service]', Event.RemoteStop);
    TrackPlayer.pause().catch(() => undefined);
  });
}
