// ANDROID NOTE (5.0.0-alpha0): this imported RNTP directly (rather than via
// our trackPlayerNative.ts shim) because the headless JS task context on
// Android might not satisfy the shim's TurboModuleRegistry.get()
// availability check, silently dropping addEventListener calls and breaking
// lock screen controls. That check no longer exists after the 4.1.2
// migration (trackPlayerNative.ts imports RNTP directly too now), but
// importing RNTP directly here is still correct — the headless service
// should talk to RNTP as plainly as possible regardless.
import TrackPlayer, { Event, type AddTrack } from 'react-native-track-player';
import { radioTrack } from './radioTrack';

// Lock-screen / Bluetooth / Auto remote-play handler.
//
// We call play() directly WITHOUT a preceding load(). For a live HTTP/Icecast
// stream the HTTP connection is dropped by the server after a few seconds of
// pause, so ExoPlayer reconnects to the live edge automatically when play() is
// called — no stale audio in practice.
//
// Why NOT load() first: load() forces ExoPlayer through STATE_IDLE before
// STATE_BUFFERING. RNTP maps STATE_IDLE → MediaSession STATE_NONE, which
// briefly resets the lock-screen notification (play button disappears, loading
// indicator flickers). play() transitions PAUSED → BUFFERING → PLAYING with no
// STATE_IDLE, so the notification goes cleanly: play button → loading → pause.
//
// IMPORTANT: do NOT use reset()+add() — reset() sends STATE_NONE to
// MediaSession, which removes the notification entirely.
async function handleRemotePlay() {
  try {
    await TrackPlayer.play();
  } catch (error) {
    // play() failed — the queue may have been torn down (e.g. app killed and
    // restarted). Fall back to load()+play(); this accepts the brief STATE_IDLE
    // notification flicker as a recovery edge case.
    if (__DEV__) console.warn('[TrackPlayer Service] play() failed, reloading track', error);
    try {
      await TrackPlayer.load(radioTrack as AddTrack);
      await TrackPlayer.play();
    } catch (retryError) {
      if (__DEV__) console.warn('[TrackPlayer Service] load+play retry also failed', retryError);
    }
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
