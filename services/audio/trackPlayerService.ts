// Import RNTP directly — the headless JS task context on Android may not
// satisfy our shim's TurboModuleRegistry.get() availability check, which
// would silently drop all addEventListener calls and break lock screen controls.
import TrackPlayer, { Event, type AddTrack } from 'react-native-track-player';
import { radioTrack } from './radioTrack';

// Ensures the native queue contains the radio track before play() is called.
//
// Why this matters: the in-app pause() calls TrackPlayer.stop() so resume
// always reconnects at the live edge of the stream (otherwise users hear
// audio from N minutes ago after a long pause). stop() empties the queue.
// When the user then taps Play on the LOCK SCREEN, this headless service —
// not the in-app play() — is what runs, and it has no React state to know
// the queue is empty. Calling play() on an empty queue makes the
// MediaSession drop out of the playing state, which is exactly the
// "notification flickers / disappears for a moment" symptom users see.
//
// We unconditionally reset+add before play here so the native queue is
// always primed, regardless of how it got emptied. add() on a non-empty
// queue would be a duplicate, hence the reset() first.
async function ensureQueueAndPlay() {
  try {
    await TrackPlayer.reset();
    await TrackPlayer.add(radioTrack as AddTrack);
  } catch {
    // reset() / add() can throw if the player isn't set up yet (cold start
    // from the lock screen with the app fully killed). play() below will
    // throw too in that case and the user can re-tap, but in practice the
    // app's eager setup runs before the notification is interactive.
  }
  try {
    await TrackPlayer.play();
  } catch {
    // No-op — the next state event from RNTP will surface the error to UI.
  }
}

export async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    if (__DEV__) console.log('[TrackPlayer Service]', Event.RemotePlay);
    void ensureQueueAndPlay();
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
