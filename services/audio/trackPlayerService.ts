// Import RNTP directly — the headless JS task context on Android may not
// satisfy our shim's TurboModuleRegistry.get() availability check, which
// would silently drop all addEventListener calls and break lock screen controls.
import TrackPlayer, { Event, type AddTrack } from 'react-native-track-player';
import { radioTrack } from './radioTrack';

// Lock-screen / Bluetooth / Auto remote-play handler.
//
// The in-app pause() now uses TrackPlayer.pause() (not stop), so the native
// queue and MediaSession stay alive across pauses. That means in the common
// case we just call play() here and the user gets an instant, flicker-free
// resume — the lock-screen notification never disappears, exactly like
// Spotify or any premium audio app.
//
// The reset+add fallback only kicks in if play() throws (e.g. the JS app was
// killed long enough that the native session was reclaimed and the queue is
// genuinely empty). In that rare case a brief notification flicker is
// unavoidable because the MediaSession has to be rebuilt from scratch.
//
// IMPORTANT: do NOT proactively reset()+add() on every RemotePlay — reset()
// tears the MediaSession down to NONE and is itself the cause of the
// notification flicker we're trying to eliminate.
async function handleRemotePlay() {
  try {
    await TrackPlayer.play();
    return;
  } catch (playError) {
    if (__DEV__) console.warn('[TrackPlayer Service] play() failed, rebuilding queue', playError);
  }
  try {
    await TrackPlayer.reset();
    await TrackPlayer.add(radioTrack as AddTrack);
    await TrackPlayer.play();
  } catch (rebuildError) {
    if (__DEV__) console.error('[TrackPlayer Service] queue rebuild failed', rebuildError);
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
