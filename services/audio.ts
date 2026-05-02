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
  TrackType,
  type RadioTrack,
} from './trackPlayerNative';
import { appIdentity } from '../design-tokens';
import { addListeningHistory } from './storage';

const reconnectDelaysMs = [1000, 2000, 4000, 8000, 16000, 30000];
const RADIO_TRACK_ID = 'rtv-fontana-live';
const AUDIO_DEBUG = true;

const PlayerState = {
  none: 0,
  connecting: 1,
  paused: 2,
  playing: 3,
  buffering: 4,
  error: 5,
} as const;

const stationMetadata = {
  title: appIdentity.stationName,
  artist: appIdentity.location,
  album: appIdentity.albumTitle,
};

const radioTrack: RadioTrack = {
  id: RADIO_TRACK_ID,
  url: appIdentity.streamUrl,
  type: TrackType.Default,
  contentType: 'audio/mpeg',
  userAgent: 'RTV Fontana/2.0.0 react-native-track-player',
  title: stationMetadata.title,
  artist: stationMetadata.artist,
  album: stationMetadata.album,
  artwork: appIdentity.logo,
  isLiveStream: true,
};

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
  const historyWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHistoryTitleRef = useRef<string | null>(null);
  const userIntentRef = useRef<'play' | 'pause' | 'idle'>('idle');

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
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        alwaysPauseOnInterruption: true,
        stopForegroundGracePeriod: 30,
        // largeIcon sets the small square thumbnail on the left of the Android
        // media notification. Must be a local asset — remote URLs render as
        // a full-bleed background instead of a thumbnail.
        largeIcon: appIdentity.logo,
      },
      capabilities: playbackCapabilities,
      notificationCapabilities: playbackCapabilities,
      compactCapabilities: playbackCapabilities,
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
      console.error('[Audio] TrackPlayer TurboModule is not available — rebuild the native app');
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
      }
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
          console.error('[Audio] play() timeout — state did not transition to playing after 3 s', {
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
      console.error('[Audio] TrackPlayer TurboModule is not available — rebuild the native app');
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

    void syncFromTrackPlayer();

    return () => {
      mountedRef.current = false;
      stateSub.remove();
      errorSub.remove();
      queueEndedSub.remove();
      if (historyWriteTimeoutRef.current) {
        clearTimeout(historyWriteTimeoutRef.current);
        historyWriteTimeoutRef.current = null;
      }
      clearReconnectTimeout();
      if (reconnectDebounceRef.current) {
        clearTimeout(reconnectDebounceRef.current);
        reconnectDebounceRef.current = null;
      }
    };
  }, [clearReconnectTimeout, syncFromTrackPlayer, updateState]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      void syncFromTrackPlayer();
    });
    return () => sub.remove();
  }, [syncFromTrackPlayer]);

  useEffect(() => {
    if (
      !isPlaying ||
      isBuffering ||
      !metadata.title ||
      metadata.title === 'Po lidhet...' ||
      metadata.title === 'Gabim në stream'
    ) {
      if (historyWriteTimeoutRef.current) {
        clearTimeout(historyWriteTimeoutRef.current);
        historyWriteTimeoutRef.current = null;
      }
      return;
    }

    if (lastHistoryTitleRef.current === metadata.title) {
      return;
    }
    lastHistoryTitleRef.current = metadata.title;

    if (historyWriteTimeoutRef.current) {
      clearTimeout(historyWriteTimeoutRef.current);
    }
    const title = metadata.title;
    const artist = metadata.artist;
    historyWriteTimeoutRef.current = setTimeout(() => {
      historyWriteTimeoutRef.current = null;
      addListeningHistory({
        id: title,
        title,
        artist,
        listenedAt: new Date().toISOString(),
      });
    }, 750);
  }, [isPlaying, isBuffering, metadata.artist, metadata.title]);

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
