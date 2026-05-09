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
  // Set to true while a deliberate live-edge load() sequence is in progress.
  // Intermediate RNTP state events (IDLE/None, Loading, Buffering, Paused)
  // are suppressed while this flag is true so the ONE loading state we set
  // explicitly before load() stays stable until Playing or Error fires.
  // Also set in the RemotePlay listener so events from the headless service's
  // load() call are suppressed in the React state handler.
  const liveEdgeLoadingRef = useRef(false);
  // Spinner debounce: brief Loading/Buffering events during a normal resume
  // (typically < 800 ms total) would otherwise flash the spinner on screen
  // for a few hundred ms then disappear, which reads as a glitch. We delay
  // *showing* the buffering UI by this window; if Playing arrives first the
  // pending show is cancelled and the spinner never appears. Genuinely slow
  // network loads still surface the spinner once the window elapses.
  const BUFFERING_SHOW_DELAY_MS = 450;
  const bufferingShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    try {
      // Ensure the player is initialised (noop if already ready).
      await ensureRadioTrack();

      // Always reconnect to the live edge — never resume from a stale buffer.
      // load() replaces the ExoPlayer source without tearing down MediaSession
      // (unlike reset(), which sends STATE_NONE and removes the notification).
      // We set loading state explicitly here and suppress all intermediate
      // events (IDLE/None, Loading, Buffering) via liveEdgeLoadingRef until
      // Playing or Error fires. The user sees one clean loading → playing
      // transition with no mid-playback glitch.
      audioLog('play: reloading stream for live edge');
      if (bufferingShowTimerRef.current) {
        clearTimeout(bufferingShowTimerRef.current);
        bufferingShowTimerRef.current = null;
      }
      updateState({
        isPlaying: false,
        isBuffering: true,
        isReconnecting: true,
        playbackState: PlayerState.buffering,
      });
      liveEdgeLoadingRef.current = true;
      try {
        await TrackPlayer.load(radioTrack);
      } catch (loadError) {
        // load() failed (unlikely); fall through and let play() try on the
        // existing stream. If that also fails the outer catch fires reconnect.
        audioError('play: live-edge load failed, will try play anyway', loadError);
      }

      // Guard: user may have tapped Pause while load() was in flight.
      // Double cast defeats TypeScript's CFA which incorrectly narrows
      // .current to 'play' after the assignment at the top of play() —
      // pause() can legitimately change it across the await boundary.
      const intentAfterLoad = (userIntentRef.current as unknown) as 'play' | 'pause' | 'idle';
      if (intentAfterLoad === 'pause') {
        liveEdgeLoadingRef.current = false;
        return;
      }

      audioLog('play called');
      await TrackPlayer.play();
      audioLog('play success');
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
      liveEdgeLoadingRef.current = false;
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

    if (bufferingShowTimerRef.current) {
      clearTimeout(bufferingShowTimerRef.current);
      bufferingShowTimerRef.current = null;
    }
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

    const cancelPendingBufferingShow = () => {
      if (bufferingShowTimerRef.current) {
        clearTimeout(bufferingShowTimerRef.current);
        bufferingShowTimerRef.current = null;
      }
    };

    const onPlaybackState = (event?: { state?: TrackPlayerState }) => {
      if (!event?.state) return;
      if (!mountedRef.current) return;
      audioLog('state event', event.state);

      if (event.state === TrackPlayerState.Playing) {
        // Clear the live-edge load flag so the playing state update goes through.
        liveEdgeLoadingRef.current = false;
        userIntentRef.current = 'idle';
        reconnectAttemptRef.current = 0;
        clearReconnectTimeout();
        cancelPendingBufferingShow();
        void safeUpdateStationMetadata();
        updateState(toStatePatch(event.state));
        return;
      }

      if (event.state === TrackPlayerState.Error && userIntentRef.current !== 'pause') {
        liveEdgeLoadingRef.current = false;
        cancelPendingBufferingShow();
        updateState(toStatePatch(event.state));
        void reconnectRef.current();
        return;
      }

      // Suppress intermediate events during a deliberate live-edge load
      // sequence. We've already set the loading state explicitly; letting
      // these fire would either revert the loading state (IDLE/None → none)
      // or create redundant updates before Playing arrives.
      if (liveEdgeLoadingRef.current) {
        audioLog('state event suppressed (live-edge load in progress)', event.state);
        return;
      }

      // Debounced spinner: if RNTP enters Loading/Buffering for a brief moment
      // during a normal resume, never show the spinner at all. We schedule the
      // UI update; if Playing arrives first the timer is cancelled above. Only
      // genuinely slow loads (> BUFFERING_SHOW_DELAY_MS) reach the UI.
      if (event.state === TrackPlayerState.Buffering || event.state === TrackPlayerState.Loading) {
        if (bufferingShowTimerRef.current) return; // already pending
        const patch = toStatePatch(event.state);
        bufferingShowTimerRef.current = setTimeout(() => {
          bufferingShowTimerRef.current = null;
          if (!mountedRef.current) return;
          if (userIntentRef.current === 'pause') return;
          updateState(patch);
        }, BUFFERING_SHOW_DELAY_MS);
        return;
      }

      // Paused / Stopped / Ready / Ended / None — apply immediately and
      // cancel any pending buffering show so a stale timer can't flash the
      // spinner after the user has already paused.
      cancelPendingBufferingShow();
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
      // IMPORTANT: do NOT call play() or any TrackPlayer operation here.
      //
      // When the lock-screen Play button is tapped, RNTP fires RemotePlay to
      // BOTH this JS listener AND the headless playback service (trackPlayerService.ts).
      // Both run on the same JS thread. If this listener also calls TrackPlayer
      // operations it races with the headless service, causing a double load()
      // and a mid-stream IDLE transition that flashes/removes the notification.
      //
      // The headless service is the sole authority for player operations from
      // lock-screen events. This listener syncs React intent and pre-sets
      // liveEdgeLoadingRef so the PlaybackState handler suppresses intermediate
      // events (IDLE/Loading/Buffering) during the headless load() call.
      userIntentRef.current = 'play';
      cancelReconnect();
      liveEdgeLoadingRef.current = true;
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
      liveEdgeLoadingRef.current = false;
      if (bufferingShowTimerRef.current) {
        clearTimeout(bufferingShowTimerRef.current);
        bufferingShowTimerRef.current = null;
      }
    };
  }, [cancelReconnect, clearReconnectTimeout, pause, play, syncFromTrackPlayer, updateState]);

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
