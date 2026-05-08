import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Image,
  type AppStateStatus,
} from 'react-native';
import {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  getPlaybackCapabilities,
  getTrackPlayerDiagnostics,
  isTrackPlayerAvailable,
  TrackPlayer,
  TrackPlayerEvent,
  TrackPlayerState,
} from './trackPlayerNative';
import { radioTrack, stationMetadata } from './radioTrack';
import { appIdentity } from '../../constants/tokens';


const reconnectDelaysMs = [1000, 2000, 4000, 8000, 16000, 30000];
const AUDIO_DEBUG = __DEV__;

const PlayerState = {
  none: 0,
  connecting: 1,
  paused: 2,
  playing: 3,
  buffering: 4,
  error: 5,
} as const;

// Resolve the local asset to a file:// URI so Android can use it as the
// media notification largeIcon (square thumbnail on the left). Passing a raw
// require() number works for React Native views but Android's MediaSession
// needs an actual URI string to render the thumbnail correctly.
const logoUri = Image.resolveAssetSource(appIdentity.logo).uri;

type NowPlayingMetadata = {
  title: string;
  artist: string;
};

type AudioStateValue = {
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isReconnecting: boolean;
  playbackState: number;
};

type AudioActionsValue = {
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  reconnect: () => Promise<void>;
};

type AudioContextValue = AudioStateValue & AudioActionsValue;

type PlayerStateShape = AudioStateValue & {
  metadata: NowPlayingMetadata;
};

function audioLog(message: string, details?: unknown) {
  if (!AUDIO_DEBUG) return;
  if (details === undefined) {
    console.info(`[audio] ${message}`);
    return;
  }
  console.info(`[audio] ${message}`, details);
}

function audioError(message: string, error: unknown) {
  if (!AUDIO_DEBUG) return;
  const err = error as { code?: string; message?: string };
  console.warn(`[audio] ${message}`, {
    code: err?.code,
    message: err?.message ?? String(error),
  });
}

const AudioStateContext = createContext<AudioStateValue | null>(null);
const AudioMetadataContext = createContext<NowPlayingMetadata | null>(null);
const AudioActionsContext = createContext<AudioActionsValue | null>(null);

const initialPlayerState: PlayerStateShape = {
  isReady: false,
  isPlaying: false,
  isBuffering: false,
  isReconnecting: false,
  playbackState: PlayerState.none,
  metadata: {
    title: stationMetadata.title,
    artist: stationMetadata.artist,
  },
};

function toStatePatch(rntpState: TrackPlayerState): Partial<PlayerStateShape> {
  switch (rntpState) {
    case TrackPlayerState.Playing:
      return {
        isReady: true,
        isPlaying: true,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.playing,
        metadata: {
          title: stationMetadata.title,
          artist: stationMetadata.artist,
        },
      };
    case TrackPlayerState.Buffering:
    case TrackPlayerState.Loading:
      return {
        isReady: true,
        isPlaying: false,
        isBuffering: true,
        isReconnecting: true,
        playbackState: PlayerState.buffering,
      };
    case TrackPlayerState.Error:
      return {
        isReady: true,
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.error,
        metadata: {
          title: 'Gabim në stream',
          artist: 'Po rilidhet automatikisht',
        },
      };
    case TrackPlayerState.Paused:
    case TrackPlayerState.Ready:
    case TrackPlayerState.Stopped:
    case TrackPlayerState.Ended:
      return {
        isReady: true,
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.paused,
        metadata: {
          title: stationMetadata.title,
          artist: stationMetadata.artist,
        },
      };
    case TrackPlayerState.None:
    default:
      return {
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.none,
      };
  }
}

async function safeUpdateStationMetadata() {
  try {
    await TrackPlayer.updateMetadataForTrack(0, stationMetadata);
    await TrackPlayer.updateNowPlayingMetadata({
      ...stationMetadata,
      isLiveStream: true,
    });
  } catch {
    // Metadata is best effort; playback state remains the source of truth.
  }
}

// RNTP registers the real background service from index.ts. This export is kept
// for compatibility with any older imports that expected services/audio to have
// a playbackService symbol.
export async function playbackService() {
  return;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerStateShape>(initialPlayerState);
  const stateRef = useRef<PlayerStateShape>(initialPlayerState);
  const mountedRef = useRef(true);
  const setupPromiseRef = useRef<Promise<void> | null>(null);
  const queueReadyRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectRef = useRef<() => Promise<void>>(async () => undefined);
  const doReconnectRef = useRef<() => Promise<void>>(async () => undefined);
  const userIntentRef = useRef<'play' | 'pause' | 'idle'>('idle');
  // Tracks when the user (or system) paused playback so resume can decide
  // whether to do a fresh load() to snap back to the live edge of the stream.
  // Short pauses use plain play() for an instant, flicker-free resume; long
  // pauses (where audio would be noticeably stale) trigger a reload.
  const pausedAtRef = useRef<number | null>(null);
  // After this many ms of pause, we assume the audio in the buffer is too far
  // behind live to be acceptable for a radio listener and force a reload.
  const LIVE_EDGE_RESYNC_AFTER_MS = 8000;

  const updateState = useCallback((patch: Partial<PlayerStateShape>) => {
    const prev = stateRef.current;
    let changed = false;

    for (const k in patch) {
      if (k === 'metadata') {
        const nextMeta = patch.metadata;
        if (
          nextMeta &&
          (nextMeta.title !== prev.metadata.title ||
            nextMeta.artist !== prev.metadata.artist)
        ) {
          changed = true;
          break;
        }
      } else if (prev[k as keyof PlayerStateShape] !== patch[k as keyof PlayerStateShape]) {
        changed = true;
        break;
      }
    }

    if (!changed) return;

    const next: PlayerStateShape = { ...prev, ...patch };
    if (
      patch.metadata &&
      patch.metadata.title === prev.metadata.title &&
      patch.metadata.artist === prev.metadata.artist
    ) {
      next.metadata = prev.metadata;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const { isReady, isPlaying, isBuffering, isReconnecting, playbackState, metadata } = state;

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const configurePlayer = useCallback(async () => {
    const playbackCapabilities = getPlaybackCapabilities();
    audioLog('updateOptions', { capabilities: playbackCapabilities });
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        alwaysPauseOnInterruption: true,
        stopForegroundGracePeriod: 30,
        largeIcon: logoUri,
      },
      capabilities: playbackCapabilities,
      notificationCapabilities: playbackCapabilities,
      progressUpdateEventInterval: 5,
    });
  }, []);

  const setupPlayer = useCallback(async () => {
    if (setupPromiseRef.current) {
      return setupPromiseRef.current;
    }

    setupPromiseRef.current = (async () => {
      audioLog('setup start', getTrackPlayerDiagnostics());
      if (!isTrackPlayerAvailable()) {
        throw new Error('react-native-track-player native module is unavailable. Rebuild the development client.');
      }

      try {
        await TrackPlayer.setupPlayer({
          minBuffer: 8,
          maxBuffer: 30,
          playBuffer: 2,
          backBuffer: 0,
          androidAudioContentType: AndroidAudioContentType.Music,
          autoHandleInterruptions: true,
          autoUpdateMetadata: false,
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'player_already_initialized') {
          throw error;
        }
        audioLog('setup already initialized');
      }

      await configurePlayer();

      // Pre-load the track so play() is instant — queue is ready before first tap.
      await TrackPlayer.reset();
      await TrackPlayer.load(radioTrack);
      queueReadyRef.current = true;
      audioLog('setup done + track pre-loaded');
      updateState({
        isReady: true,
        playbackState: PlayerState.paused,
        metadata: {
          title: stationMetadata.title,
          artist: stationMetadata.artist,
        },
      });
    })().catch((error) => {
      audioError('setup error', error);
      setupPromiseRef.current = null;
      throw error;
    });

    return setupPromiseRef.current;
  }, [configurePlayer, updateState]);

  const ensureRadioTrack = useCallback(async (options?: { forceReset?: boolean }) => {
    await setupPlayer();

    if (queueReadyRef.current && !options?.forceReset) {
      return;
    }

    audioLog('reset/load track', {
      id: radioTrack.id,
      url: radioTrack.url,
      title: radioTrack.title,
      artist: radioTrack.artist,
      album: radioTrack.album,
    });
    await TrackPlayer.reset();
    await TrackPlayer.load(radioTrack);
    queueReadyRef.current = true;
    audioLog('track ready');
  }, [setupPlayer]);

  const syncFromTrackPlayer = useCallback(async () => {
    try {
      const playback = await TrackPlayer.getPlaybackState();
      if (!mountedRef.current) return;
      updateState(toStatePatch(playback.state));
      await safeUpdateStationMetadata();
    } catch {
      // The player may not be set up yet. That is fine before first Play.
    }
  }, [updateState]);

  const cancelReconnect = useCallback(() => {
    clearReconnectTimeout();
    if (reconnectDebounceRef.current) {
      clearTimeout(reconnectDebounceRef.current);
      reconnectDebounceRef.current = null;
    }
    updateState({ isReconnecting: false });
  }, [clearReconnectTimeout, updateState]);

  const reconnect = useCallback(async () => {
    if (userIntentRef.current === 'pause') return;
    if (reconnectDebounceRef.current) return;
    if (!isTrackPlayerAvailable()) {
      audioLog('reconnect skipped: native module unavailable', getTrackPlayerDiagnostics());
      updateState({
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.error,
        metadata: {
          title: 'Gabim në stream',
          artist: 'Rindërto development build',
        },
      });
      return;
    }

    reconnectDebounceRef.current = setTimeout(() => {
      reconnectDebounceRef.current = null;
      void doReconnectRef.current();
    }, 500);
  }, [updateState]);

  const doReconnect = useCallback(async () => {
    if (userIntentRef.current === 'pause') return;
    clearReconnectTimeout();

    updateState({
      isReconnecting: true,
      isBuffering: true,
      playbackState: PlayerState.connecting,
    });

    const attempt = reconnectAttemptRef.current;
    const delay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)];
    reconnectAttemptRef.current += 1;
    audioLog('reconnect scheduled', { attempt, delay });

    const start = Date.now();
    const tick = () => {
      if (!mountedRef.current || userIntentRef.current === 'pause') return;
      const elapsed = Date.now() - start;

      if (elapsed >= delay) {
        reconnectTimeoutRef.current = null;
        void (async () => {
          try {
            await ensureRadioTrack({ forceReset: true });
            audioLog('play called from reconnect');
            await TrackPlayer.play();
            void safeUpdateStationMetadata();
            audioLog('play success from reconnect');
            updateState({
              isReady: true,
              isBuffering: true,
              isReconnecting: true,
              playbackState: PlayerState.connecting,
            });
          } catch (error) {
            audioError('reconnect play error', error);
            updateState({
              playbackState: PlayerState.error,
              metadata: {
                title: 'Gabim në stream',
                artist: 'Po rilidhet automatikisht',
              },
            });
            void reconnectRef.current();
          }
        })();
        return;
      }

      reconnectTimeoutRef.current = setTimeout(tick, Math.min(200, delay - elapsed));
    };

    tick();
  }, [clearReconnectTimeout, ensureRadioTrack, updateState]);

  useEffect(() => {
    doReconnectRef.current = doReconnect;
  }, [doReconnect]);

  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  const play = useCallback(async () => {
    if (!isTrackPlayerAvailable()) {
      if (__DEV__) console.error('[Audio] TrackPlayer TurboModule is not available — rebuild the native app');
      return;
    }
    audioLog('play action');
    userIntentRef.current = 'play';
    cancelReconnect();

    updateState({
      isReconnecting: true,
      isBuffering: true,
      playbackState: PlayerState.connecting,
    });

    try {
      if (!queueReadyRef.current) {
        // Setup not yet complete (rare on slow devices) — wait for pre-load.
        audioLog('play: waiting for track pre-load');
        await ensureRadioTrack();
      } else {
        // Live-edge resync: if we've been paused long enough that the buffered
        // audio would be noticeably behind the live broadcast, swap the track
        // in place with load() so playback reconnects at the live edge. We do
        // NOT reset() here — load() replaces the current track without tearing
        // down the MediaSession, so the lock-screen notification stays alive.
        const pausedAt = pausedAtRef.current;
        if (pausedAt !== null && Date.now() - pausedAt >= LIVE_EDGE_RESYNC_AFTER_MS) {
          audioLog('play: pause was long, reloading for live edge');
          try {
            await TrackPlayer.load(radioTrack);
          } catch (loadError) {
            // load() can fail on some setups; fall back to a full reset/add.
            audioError('play: load() failed, falling back to ensureRadioTrack', loadError);
            await ensureRadioTrack({ forceReset: true });
          }
        }
      }
      pausedAtRef.current = null;
      audioLog('play called');
      await TrackPlayer.play();
      audioLog('play success');
      // Update metadata after play starts — non-blocking for the user.
      void safeUpdateStationMetadata();

      // Fallback: if playback state hasn't transitioned to playing after 3 s,
      // something is silently stuck — log and trigger a reconnect.
      setTimeout(() => {
        if (!mountedRef.current) return;
        if (userIntentRef.current === 'pause') return;
        const cur = stateRef.current;
        if (!cur.isPlaying && !cur.isBuffering) {
          if (__DEV__) console.error('[Audio] play() timeout — state did not transition to playing after 3 s', {
            playbackState: cur.playbackState,
            isPlaying: cur.isPlaying,
            isBuffering: cur.isBuffering,
          });
          void reconnectRef.current();
        }
      }, 3000);
    } catch (error) {
      audioError('play error', error);
      void reconnect();
    }
  }, [cancelReconnect, ensureRadioTrack, reconnect, updateState]);

  const pause = useCallback(() => {
    audioLog('pause action');
    userIntentRef.current = 'pause';
    cancelReconnect();

    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
      metadata: {
        title: stationMetadata.title,
        artist: stationMetadata.artist,
      },
    });

    // Use TrackPlayer.pause() (NOT stop) so the native queue and Android
    // MediaSession stay alive in the PAUSED state. This is what keeps the
    // lock-screen notification visible and stable — tapping Play from the
    // lock screen then resumes instantly with no flicker, exactly like
    // Spotify or any premium audio app. The previous implementation called
    // stop() to force a fresh live-edge reconnect on resume, but that
    // emptied the queue and tore down the MediaSession, which caused the
    // notification to briefly disappear and reappear when the user tapped
    // Play on the lock screen.
    //
    // Live-edge resync after a long pause is now handled in play() via
    // TrackPlayer.load() (in-place swap, no MediaSession churn).
    pausedAtRef.current = Date.now();
    TrackPlayer.pause().catch(() => undefined);
    void safeUpdateStationMetadata();
  }, [cancelReconnect, updateState]);

  const toggle = useCallback(() => {
    audioLog('toggle pressed', {
      isPlaying: stateRef.current.isPlaying,
      isBuffering: stateRef.current.isBuffering,
      isReconnecting: stateRef.current.isReconnecting,
    });
    import('expo-haptics')
      .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
      .catch(() => undefined);

    const cur = stateRef.current;
    if (cur.isPlaying || cur.isBuffering || cur.isReconnecting) {
      pause();
    } else {
      void play();
    }
  }, [pause, play]);

  useEffect(() => {
    // Eagerly set up the player on mount so we get early diagnostics
    // and the queue is ready before the first play tap.
    if (isTrackPlayerAvailable()) {
      void setupPlayer().catch((error) => {
        audioError('eager setup error', error);
      });
    } else {
      if (__DEV__) console.error('[Audio] TrackPlayer TurboModule is not available — rebuild the native app');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const onPlaybackState = (event?: { state?: TrackPlayerState }) => {
      if (!event?.state) return;
      if (!mountedRef.current) return;
      audioLog('state event', event.state);
      if (event.state === TrackPlayerState.Playing) {
        userIntentRef.current = 'idle';
        reconnectAttemptRef.current = 0;
        clearReconnectTimeout();
        void safeUpdateStationMetadata();
      }
      if (event.state === TrackPlayerState.Error && userIntentRef.current !== 'pause') {
        updateState(toStatePatch(event.state));
        void reconnectRef.current();
        return;
      }
      updateState(toStatePatch(event.state));
    };

    const stateSub = TrackPlayer.addEventListener(TrackPlayerEvent.PlaybackState, onPlaybackState);
    const errorSub = TrackPlayer.addEventListener(TrackPlayerEvent.PlaybackError, (error) => {
      audioError('playback error event', error);
      if (userIntentRef.current === 'pause') return;
      updateState(toStatePatch(TrackPlayerState.Error));
      void reconnectRef.current();
    });
    const queueEndedSub = TrackPlayer.addEventListener(TrackPlayerEvent.PlaybackQueueEnded, () => {
      if (userIntentRef.current === 'pause') return;
      void reconnectRef.current();
    });
    const remotePlaySub = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePlay, () => {
      audioLog('remote-play (lock screen)');
      void play();
    });
    const remotePauseSub = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePause, () => {
      audioLog('remote-pause (lock screen)');
      pause();
    });

    void syncFromTrackPlayer();

    return () => {
      mountedRef.current = false;
      stateSub.remove();
      errorSub.remove();
      queueEndedSub.remove();
      remotePlaySub.remove();
      remotePauseSub.remove();
      clearReconnectTimeout();
      if (reconnectDebounceRef.current) {
        clearTimeout(reconnectDebounceRef.current);
        reconnectDebounceRef.current = null;
      }
    };
  }, [clearReconnectTimeout, pause, play, syncFromTrackPlayer, updateState]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      void syncFromTrackPlayer();
    });
    return () => sub.remove();
  }, [syncFromTrackPlayer]);

  const stateValue = useMemo<AudioStateValue>(
    () => ({
      isReady,
      isPlaying,
      isBuffering,
      isReconnecting,
      playbackState,
    }),
    [isReady, isPlaying, isBuffering, isReconnecting, playbackState],
  );

  const metadataValue = useMemo<NowPlayingMetadata>(
    () => metadata,
    [metadata],
  );

  const actionsValue = useMemo<AudioActionsValue>(
    () => ({ play, pause, toggle, reconnect }),
    [play, pause, toggle, reconnect],
  );

  return React.createElement(
    AudioActionsContext.Provider,
    { value: actionsValue },
    React.createElement(
      AudioStateContext.Provider,
      { value: stateValue },
      React.createElement(
        AudioMetadataContext.Provider,
        { value: metadataValue },
        children,
      ),
    ),
  );
}

export function useAudioState(): AudioStateValue {
  const ctx = useContext(AudioStateContext);
  if (!ctx) {
    throw new Error('useAudioState must be used inside AudioProvider');
  }
  return ctx;
}

export function useAudioMetadata(): NowPlayingMetadata {
  const ctx = useContext(AudioMetadataContext);
  if (!ctx) {
    throw new Error('useAudioMetadata must be used inside AudioProvider');
  }
  return ctx;
}

export function useAudioActions(): AudioActionsValue {
  const ctx = useContext(AudioActionsContext);
  if (!ctx) {
    throw new Error('useAudioActions must be used inside AudioProvider');
  }
  return ctx;
}

export function useAudio(): AudioContextValue {
  const state = useAudioState();
  const actions = useAudioActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
