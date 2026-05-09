// Import RNTP directly — the headless JS task context on Android may not
// satisfy our shim's TurboModuleRegistry.get() availability check, which
// would silently drop all addEventListener calls and break lock screen controls.
import TrackPlayer, { Event, type AddTrack } from 'react-native-track-player';
import { radioTrack } from './radioTrack';

// Lock-screen / Bluetooth / Auto remote-play handler.
//
// Always reconnects to the live edge via load() before play(). load() replaces
// the ExoPlayer source (ExoPlayer: PAUSED → LOADING → PLAYING) without tearing
// the MediaSession down to STATE_NONE — so the notification stays visible
// throughout. This is how every pause → lock-screen-play cycle lands on the
// current broadcast, never on buffered/stale audio.
//
// IMPORTANT: do NOT use reset()+add() here — reset() sends STATE_NONE to
// MediaSession, which removes the notification and causes the visible flicker.
async function handleRemotePlay() {
  try {
    await TrackPlayer.load(radioTrack as AddTrack);
    await TrackPlayer.play();
  } catch (error) {
    if (__DEV__) console.warn('[TrackPlayer Service] load+play failed, falling back to play-only', error);
    // If load() itself threw (e.g. queue torn down entirely), attempt play()
    // on whatever is in the queue. If that also fails, the PlaybackError event
    // will surface the error through the normal reconnect path.
    TrackPlayer.play().catch(() => undefined);
  }
}

export async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    if (__DEV__) console.log('[TrackPlayer Service]', Event.RemotePlay);
    void handleRemotePlay();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    if (__DEV__) console.log('[TrackPlayer Service]', Event.RemotePause);
    TrackPlayer.pause().catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    if (__DEV__) console.log('[TrackPlayer Service]', Event.RemoteStop);
    TrackPlayer.pause().catch(() => undefined);
  });
}
