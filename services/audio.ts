import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Haptics from 'expo-haptics';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioLockScreenOptions,
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { InteractionManager } from 'react-native';
import { appIdentity } from '../design-tokens';
import { addListeningHistory } from './storage';

const STREAM_URL = 'https://live.radiostreaming.al:8010/stream.mp3';
const reconnectDelaysMs = [1000, 2000, 4000, 8000, 16000, 30000];
const lockScreenOptions: AudioLockScreenOptions = {
  showSeekBackward: false,
  showSeekForward: false,
};

const PlayerState = {
  none: 0,
  connecting: 1,
  paused: 2,
  playing: 3,
  buffering: 4,
  error: 5,
} as const;

type NowPlayingMetadata = {
  title: string;
  artist: string;
};

type AudioStateValue = {
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isReconnecting: boolean;
  // PROFILING FIX: `metadata` removed from this shape. Consumers that need
  // the now-playing title/artist must call useAudioMetadata() so they only
  // re-render when metadata actually changes (and not on status ticks).
  playbackState: number;
};

type AudioActionsValue = {
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  reconnect: () => Promise<void>;
};

// Combined value preserved for backward-compat consumers that still call useAudio().
type AudioContextValue = AudioStateValue & AudioActionsValue;

// Split contexts: consumers reading only callbacks never re-render on status ticks.
//
// PROFILING-DRIVEN FIX (round 2): MiniPlayer and LiveScreen only read the
// boolean status fields (isPlaying / isBuffering / isReconnecting), but the
// previous combined AudioStateContext value also carried `metadata`. Every
// ICY-metadata tick (~once per song) updated the bundled value and forced
// MiniPlayer + LiveScreen to re-render even though their visible output
// did not change. We now publish status and metadata on separate contexts
// so metadata updates only re-render the FullPlayer (the sole consumer).
const AudioStateContext = createContext<AudioStateValue | null>(null);
const AudioMetadataContext = createContext<NowPlayingMetadata | null>(null);
const AudioActionsContext = createContext<AudioActionsValue | null>(null);

export async function playbackService() {
  return;
}

type PlayerStateShape = {
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isReconnecting: boolean;
  playbackState: number;
  metadata: NowPlayingMetadata;
};

const initialPlayerState: PlayerStateShape = {
  isReady: false,
  isPlaying: false,
  isBuffering: false,
  isReconnecting: false,
  playbackState: PlayerState.none,
  metadata: {
    title: appIdentity.stationName,
    artist: appIdentity.location,
  },
};

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerStateShape>(initialPlayerState);
  const stateRef = useRef<PlayerStateShape>(initialPlayerState);

  // Single batched updater — only triggers a re-render if at least one field changed.
  // For `metadata` (an object), do a deep compare on title/artist so that fresh
  // object literals from status callbacks don't force a re-render every 500ms.
  const updateState = useCallback((patch: Partial<PlayerStateShape>) => {
    const prev = stateRef.current;
    let changed = false;
    // R-9: revert M-C2. Hermes is bytecode-interpreted (no JIT) and shortcuts
    // for...in over plain literal objects via its inline-cache fast path \u2014
    // zero allocations. Object.keys() always allocates a fresh Array + string
    // entries. The "Object.keys is faster" rule is a V8/JIT-era heuristic
    // that is wrong on Hermes for monomorphic patches.
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
    // Reuse prev.metadata reference when the patch's metadata is value-equal,
    // so downstream consumers that compare metadata identity stay stable.
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

  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const lockScreenActiveRef = useRef(false);
  const lockScreenMetadataRef = useRef<AudioMetadata | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectRef = useRef<() => Promise<void>>(async () => undefined);
  // Gate: while true, status callbacks must not flip isPlaying/isBuffering back
  const pauseIntentRef = useRef(false);
  // C-A2: monotonic generation counter. play()/pause() increment it. Each
  // status callback captures the generation that was current at the time the
  // callback was scheduled; if the user toggled in the interim (incrementing
  // the counter), the callback's effects are dropped. This eliminates the
  // pause→play race where a stale "paused" status from an in-flight callback
  // overrode a freshly-issued play().
  const intentGenerationRef = useRef(0);
  // C-A2: latest user-driven intent. Used in the status callback's "stopped"
  // fallthrough to drop stale "stopped" callbacks that arrive AFTER the user
  // pressed play (the player will report stopped briefly between the old
  // pause completing and the new play taking effect — without this guard the
  // UI flickers back to ▶ for ~500 ms mid-press).
  const userIntentRef = useRef<'play' | 'pause' | 'idle'>('idle');

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const buildLockScreenMetadata = useCallback((): AudioMetadata => {
    const cur = stateRef.current.metadata;
    const title =
      cur.title && cur.title !== 'Gabim në stream'
        ? cur.title
        : appIdentity.stationName;
    const artist =
      cur.artist && cur.artist !== 'Provo përsëri'
        ? cur.artist
        : appIdentity.location;
    return {
      title,
      artist,
      albumTitle: appIdentity.stationName,
    };
  }, []);

  const clearLockScreenControls = useCallback(() => {
    const player = playerRef.current;
    try {
      player?.clearLockScreenControls();
    } catch {
      // Lock-screen controls are best effort; playback state is still the source of truth.
    }
    lockScreenActiveRef.current = false;
    lockScreenMetadataRef.current = null;
  }, []);

  const activateLockScreenControls = useCallback((player?: AudioPlayer | null) => {
    const target = player ?? playerRef.current;
    if (!target) return;

    const metadata = buildLockScreenMetadata();
    try {
      if (!lockScreenActiveRef.current) {
        target.setActiveForLockScreen(true, metadata, lockScreenOptions);
        lockScreenActiveRef.current = true;
      } else {
        const prev = lockScreenMetadataRef.current;
        if (
          prev?.title !== metadata.title ||
          prev?.artist !== metadata.artist ||
          prev?.albumTitle !== metadata.albumTitle
        ) {
          target.updateLockScreenMetadata(metadata);
        }
      }
      lockScreenMetadataRef.current = metadata;
    } catch {
      lockScreenActiveRef.current = false;
      lockScreenMetadataRef.current = null;
    }
  }, [buildLockScreenMetadata]);

  const onPlaybackStatusUpdate = useCallback((status: AudioStatus) => {
    if (!mountedRef.current) {
      return;
    }

    // C-A2: capture the user-intent generation at callback entry. If the user
    // has issued a new play()/pause() since this status was queued, the
    // generation will differ and we drop status-driven state writes that would
    // contradict the latest user intent (e.g. a stale pause-callback flipping
    // us back to "paused" right after the user pressed play).
    const cbGen = intentGenerationRef.current;
    const generationMatches = () => intentGenerationRef.current === cbGen;

    const playbackStateLabel = (status.playbackState ?? '').toLowerCase();
    const isFailureState =
      playbackStateLabel.includes('fail') || playbackStateLabel.includes('error');

    if (isFailureState) {
      pauseIntentRef.current = false;
      clearLockScreenControls();
      updateState({
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.error,
        metadata: { title: 'Gabim në stream', artist: 'Po rilidhet automatikisht' },
      });
      void reconnectRef.current();
      return;
    }

    if (!status.isLoaded) {
      // If user intends to be paused, ignore unloaded state (stream just draining)
      if (pauseIntentRef.current) return;
      if (!generationMatches()) return;
      updateState({
        isPlaying: false,
        isBuffering: true,
        isReconnecting: true,
        playbackState: PlayerState.connecting,
      });
      return;
    }

    const buffering = status.isBuffering;
    const playing = status.playing;

    // If user explicitly paused, ignore any playing/buffering callbacks until
    // the player confirms it has stopped. This prevents the UI from flickering
    // back to buffering/playing right after the user presses pause.
    if (pauseIntentRef.current) {
      if (!playing && !buffering) {
        // Player has confirmed paused — but only honour it if no new user
        // action has been issued since we entered this callback (C-A2).
        if (!generationMatches()) return;
        pauseIntentRef.current = false;
        clearLockScreenControls();
        updateState({
          isPlaying: false,
          isBuffering: false,
          isReconnecting: false,
          playbackState: PlayerState.paused,
        });
      }
      // While still draining, keep showing paused state — do NOT call setIsPlaying(true)
      return;
    }

    if (buffering) {
      if (!generationMatches()) return;
      updateState({
        isPlaying: playing,
        isBuffering: true,
        isReconnecting: true,
        playbackState: PlayerState.buffering,
      });
      return;
    }

    if (playing) {
      reconnectAttemptRef.current = 0;
      if (!generationMatches()) return;
      activateLockScreenControls();
      updateState({
        isPlaying: true,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.playing,
        metadata: { title: appIdentity.stationName, artist: appIdentity.location },
      });
      return;
    }

    // Final fallthrough: not playing, not buffering, not paused-intent.
    // C-A2: if the user's latest action is play, this "stopped" status is a
    // stale artifact (the player paused briefly between the old pause and
    // the new play taking effect) — drop it rather than flipping the UI
    // back to ▶ mid-press. Generation check defends against any further
    // queued callbacks issued before the latest user action.
    if (userIntentRef.current === 'play') return;
    if (!generationMatches()) return;
    clearReconnectTimeout();
    clearLockScreenControls();
    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
    });
  }, [activateLockScreenControls, clearLockScreenControls, clearReconnectTimeout, updateState]);

  const releaseCurrentPlayer = useCallback(() => {
    statusSubscriptionRef.current?.remove();
    statusSubscriptionRef.current = null;

    clearLockScreenControls();
    playerRef.current?.remove();
    playerRef.current = null;
  }, [clearLockScreenControls]);

  const createAndAttachPlayer = useCallback(
    (autoPlay: boolean) => {
      releaseCurrentPlayer();

      const player = createAudioPlayer(
        { uri: STREAM_URL },
        {
          // C-A8: 2000ms interval. expo-audio's status callback drives only
          // 4 meaningful UI transitions per session (connecting → buffering
          // → playing → paused), so 2/sec is wasteful: at 70k devices it is
          // 140k JSI hops/sec aggregate and ~2 % per-device battery drain
          // per listening hour. 0.5 Hz preserves snappy UI without the wake-
          // up tax.
          updateInterval: 2000,
          keepAudioSessionActive: true,
        },
      );

      statusSubscriptionRef.current = player.addListener(
        'playbackStatusUpdate',
        onPlaybackStatusUpdate,
      );

      playerRef.current = player;

      if (autoPlay) {
        player.play();
        activateLockScreenControls(player);
      }

      return player;
    },
    [activateLockScreenControls, onPlaybackStatusUpdate, releaseCurrentPlayer],
  );

  const ensurePlayer = useCallback(async () => {
    if (playerRef.current || initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
        // Equivalent of legacy staysActiveInBackground: true
        shouldPlayInBackground: true,
      });

      createAndAttachPlayer(false);
      updateState({
        isReady: true,
        playbackState: PlayerState.paused,
        metadata: { title: appIdentity.stationName, artist: appIdentity.location },
      });
    } finally {
      initializingRef.current = false;
    }
  }, [createAndAttachPlayer, updateState]);

  const cancelReconnect = useCallback(() => {
    clearReconnectTimeout();
    // A-2: also drop any pending debounce so a user-initiated pause cancels
    // a queued reconnect attempt cleanly.
    if (reconnectDebounceRef.current) {
      clearTimeout(reconnectDebounceRef.current);
      reconnectDebounceRef.current = null;
    }
    updateState({ isReconnecting: false });
  }, [clearReconnectTimeout, updateState]);

  // A-2: debounce window for failure-storm coalescing. ExoPlayer can fire
  // 5–10 failure callbacks in 2 seconds during a brief network blip; without
  // debouncing, each one would increment reconnectAttemptRef and the next
  // backoff slot would jump straight to 30 s. We coalesce all failures
  // inside a 500 ms window into ONE reconnect attempt and ONE counter
  // increment.
  const reconnectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconnect = useCallback(async () => {
    // A-2: if a reconnect is already debounced, this call collapses into it.
    if (reconnectDebounceRef.current) return;
    reconnectDebounceRef.current = setTimeout(() => {
      reconnectDebounceRef.current = null;
      void doReconnectRef.current();
    }, 500);
  }, []);

  // The actual reconnect body, only invoked once per debounce window.
  const doReconnect = useCallback(async () => {
    await ensurePlayer();
    clearReconnectTimeout();

    updateState({
      isReconnecting: true,
      isBuffering: true,
      playbackState: PlayerState.connecting,
    });

    const attempt = reconnectAttemptRef.current;
    const delay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)];
    reconnectAttemptRef.current += 1;

    // A-1: Doze-resistant scheduling.
    //   On Android, plain setTimeout is subject to Doze coalescing once the
    //   device enters deep idle (screen off, no foreground activity). The
    //   timer can be deferred by minutes, leaving the stream silent. expo-
    //   audio holds a foreground service that keeps THIS process alive, so
    //   we don't need a true wake-up alarm — just a timer the OS won't
    //   batch with other apps' deferred work. We chain short (≤200 ms)
    //   setTimeouts; Doze coalesces ≥ 1 s timers, so sub-second ticks ride
    //   the audio service's CPU keep-alive and resume promptly.
    const start = Date.now();
    const tick = () => {
      if (!mountedRef.current) return;
      const elapsed = Date.now() - start;
      if (elapsed >= delay) {
        reconnectTimeoutRef.current = null;
        void (async () => {
          try {
            createAndAttachPlayer(true);
            updateState({ isReady: true });
          } catch {
            updateState({
              playbackState: PlayerState.error,
              metadata: { title: 'Gabim në stream', artist: 'Po rilidhet automatikisht' },
            });
            void reconnectRef.current();
          }
        })();
        return;
      }
      reconnectTimeoutRef.current = setTimeout(tick, Math.min(200, delay - elapsed));
    };
    tick();
  }, [clearReconnectTimeout, createAndAttachPlayer, ensurePlayer, updateState]);

  // Stable ref to the latest doReconnect identity for use inside debounce.
  const doReconnectRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => { doReconnectRef.current = doReconnect; }, [doReconnect]);

  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  const play = useCallback(async () => {
    // C-A2: bump generation FIRST and mark intent before touching the
    // player so any in-flight status callback queued under the previous
    // generation is correctly dropped when it lands.
    intentGenerationRef.current += 1;
    userIntentRef.current = 'play';
    // Clear pause gate so status callbacks resume normally
    pauseIntentRef.current = false;
    await ensurePlayer();

    updateState({
      isReconnecting: true,
      isBuffering: true,
      playbackState: PlayerState.connecting,
    });

    try {
      const player = playerRef.current;
      if (!player) {
        await reconnect();
        return;
      }

      if (!player.isLoaded) {
        await reconnect();
        return;
      }

      player.play();
      activateLockScreenControls(player);
    } catch {
      await reconnect();
    }
  }, [activateLockScreenControls, ensurePlayer, reconnect, updateState]);

  const pause = useCallback(() => {
    // C-A2: bump generation + record intent so status callbacks from a
    // previous play() that haven't drained yet cannot bring the UI back to
    // playing/buffering after we optimistically rendered ❙❙.
    intentGenerationRef.current += 1;
    userIntentRef.current = 'pause';
    // Set intent gate FIRST — blocks any in-flight status callback from overriding
    pauseIntentRef.current = true;
    cancelReconnect();

    // Optimistic UI update — shows ▶ immediately
    updateState({
      isPlaying: false,
      isBuffering: false,
      playbackState: PlayerState.paused,
    });
    clearLockScreenControls();

    const player = playerRef.current;
    if (!player) {
      pauseIntentRef.current = false;
      return;
    }

    if (player.playing) {
      player.pause();
    } else {
      pauseIntentRef.current = false;
    }
  }, [cancelReconnect, clearLockScreenControls, updateState]);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    // Read latest state from the ref so this callback's identity stays stable
    // across status ticks — prevents Context value churn every 500ms.
    const cur = stateRef.current;
    if (cur.isPlaying || cur.isBuffering || cur.isReconnecting) {
      pause();
    } else {
      void play();
    }
  }, [play, pause]);

  useEffect(() => {
    mountedRef.current = true;

    // Native audio-mode setup and ExoPlayer/AVPlayer creation are useful to
    // have ready, but they do not need to sit on the cold-start critical
    // path. Prewarm shortly after the first screen settles; an immediate user
    // tap still calls ensurePlayer() through play().
    let interactionHandle: { cancel: () => void } | null = null;
    const prewarmTimer = setTimeout(() => {
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        ensurePlayer().catch(() => {
          updateState({
            playbackState: PlayerState.error,
            metadata: { title: 'Gabim në stream', artist: 'Provo përsëri' },
          });
        });
      });
    }, 2500);

    return () => {
      mountedRef.current = false;
      clearTimeout(prewarmTimer);
      interactionHandle?.cancel();
      cancelReconnect();
      releaseCurrentPlayer();
    };
  }, [cancelReconnect, ensurePlayer, releaseCurrentPlayer, updateState]);

  // Debounced listening-history writes:
  // expo-audio fires status callbacks ~2/sec while playing, but we only want to
  // record a history row once per actual song change. Track the last written
  // title and ignore re-emits for the same song.
  const lastHistoryTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lockScreenActiveRef.current) return;
    activateLockScreenControls();
  }, [activateLockScreenControls, metadata.artist, metadata.title]);

  useEffect(() => {
    if (
      !isPlaying ||
      isBuffering ||
      !metadata.title ||
      metadata.title === 'Po lidhet...' ||
      metadata.title === 'Gabim në stream'
    ) {
      return;
    }

    if (lastHistoryTitleRef.current === metadata.title) {
      return;
    }
    lastHistoryTitleRef.current = metadata.title;

    addListeningHistory({
      id: metadata.title,
      title: metadata.title,
      artist: metadata.artist,
      listenedAt: new Date().toISOString(),
    });
  }, [isPlaying, isBuffering, metadata.artist, metadata.title]);

  // State context value: status flags only. metadata is published on its own
  // context so MiniPlayer + LiveScreen don't re-render when only the now-
  // playing title changes.
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

  // Metadata context value: changes only when the now-playing title or
  // artist actually changes (updateState already deep-compares those fields
  // before committing).
  const metadataValue = useMemo<NowPlayingMetadata>(
    () => metadata,
    [metadata],
  );

  // Actions context value: callback identities are stable across status ticks
  // (toggle reads from a ref). This memo never changes after first mount, so
  // callback-only consumers never re-render.
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

// Backward-compat: combined hook. Prefer useAudioState / useAudioActions.
export function useAudio(): AudioContextValue {
  const state = useAudioState();
  const actions = useAudioActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
