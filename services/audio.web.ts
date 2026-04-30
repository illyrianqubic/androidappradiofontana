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
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { appIdentity } from '../design-tokens';

const reconnectDelaysMs = [1000, 2000, 4000, 8000, 16000, 30000];

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
    title: appIdentity.stationName,
    artist: appIdentity.location,
  },
};

// Web has no native headless playback service. This no-op keeps the shared
// service export shape aligned with native without pretending process-kill
// recovery exists on web.
export async function playbackService() {
  return;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerStateShape>(initialPlayerState);
  const stateRef = useRef<PlayerStateShape>(initialPlayerState);

  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectRef = useRef<() => Promise<void>>(async () => undefined);
  const doReconnectRef = useRef<() => Promise<void>>(async () => undefined);
  const pauseIntentRef = useRef(false);
  const intentGenerationRef = useRef(0);
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

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const cancelReconnect = useCallback(() => {
    clearReconnectTimeout();
    if (reconnectDebounceRef.current) {
      clearTimeout(reconnectDebounceRef.current);
      reconnectDebounceRef.current = null;
    }
    updateState({ isReconnecting: false });
  }, [clearReconnectTimeout, updateState]);

  const onPlaybackStatusUpdate = useCallback((status: AudioStatus) => {
    if (!mountedRef.current) {
      return;
    }

    const cbGen = intentGenerationRef.current;
    const generationMatches = () => intentGenerationRef.current === cbGen;
    const playbackStateLabel = (status.playbackState ?? '').toLowerCase();
    const isFailureState =
      playbackStateLabel.includes('fail') || playbackStateLabel.includes('error');

    if (isFailureState) {
      pauseIntentRef.current = false;
      updateState({
        isPlaying: false,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.error,
        metadata: { title: 'Gabim ne stream', artist: 'Po rilidhet automatikisht' },
      });
      void reconnectRef.current();
      return;
    }

    if (!status.isLoaded) {
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

    if (pauseIntentRef.current) {
      if (!playing && !buffering) {
        if (!generationMatches()) return;
        pauseIntentRef.current = false;
        updateState({
          isPlaying: false,
          isBuffering: false,
          isReconnecting: false,
          playbackState: PlayerState.paused,
        });
      }
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
      updateState({
        isPlaying: true,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.playing,
        metadata: { title: appIdentity.stationName, artist: appIdentity.location },
      });
      return;
    }

    if (userIntentRef.current === 'play') return;
    if (!generationMatches()) return;
    clearReconnectTimeout();
    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
    });
  }, [clearReconnectTimeout, updateState]);

  const releaseCurrentPlayer = useCallback(() => {
    statusSubscriptionRef.current?.remove();
    statusSubscriptionRef.current = null;
    playerRef.current?.remove();
    playerRef.current = null;
  }, []);

  const createAndAttachPlayer = useCallback(
    (autoPlay: boolean) => {
      releaseCurrentPlayer();

      const player = createAudioPlayer(
        { uri: appIdentity.streamUrl },
        {
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
      }

      return player;
    },
    [onPlaybackStatusUpdate, releaseCurrentPlayer],
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

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;

      void (async () => {
        try {
          createAndAttachPlayer(true);
          updateState({ isReady: true });
        } catch {
          updateState({
            playbackState: PlayerState.error,
            metadata: { title: 'Gabim ne stream', artist: 'Po rilidhet automatikisht' },
          });
          void reconnectRef.current();
        }
      })();
    }, delay);
  }, [clearReconnectTimeout, createAndAttachPlayer, ensurePlayer, updateState]);

  useEffect(() => {
    doReconnectRef.current = doReconnect;
  }, [doReconnect]);

  const reconnect = useCallback(async () => {
    if (reconnectDebounceRef.current) return;
    reconnectDebounceRef.current = setTimeout(() => {
      reconnectDebounceRef.current = null;
      void doReconnectRef.current();
    }, 500);
  }, []);

  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  const play = useCallback(async () => {
    intentGenerationRef.current += 1;
    userIntentRef.current = 'play';
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
    } catch {
      await reconnect();
    }
  }, [ensurePlayer, reconnect, updateState]);

  const pause = useCallback(() => {
    intentGenerationRef.current += 1;
    userIntentRef.current = 'pause';
    pauseIntentRef.current = true;
    cancelReconnect();

    updateState({
      isPlaying: false,
      isBuffering: false,
      playbackState: PlayerState.paused,
    });

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
  }, [cancelReconnect, updateState]);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const cur = stateRef.current;
    if (cur.isPlaying || cur.isBuffering || cur.isReconnecting) {
      pause();
    } else {
      void play();
    }
  }, [pause, play]);

  useEffect(() => {
    mountedRef.current = true;
    const prewarmTimer = setTimeout(() => {
      ensurePlayer().catch(() => {
        updateState({
          playbackState: PlayerState.error,
          metadata: { title: 'Gabim ne stream', artist: 'Provo perseri' },
        });
      });
    }, 2500);

    return () => {
      mountedRef.current = false;
      clearTimeout(prewarmTimer);
      cancelReconnect();
      releaseCurrentPlayer();
    };
  }, [cancelReconnect, ensurePlayer, releaseCurrentPlayer, updateState]);

  const { isReady, isPlaying, isBuffering, isReconnecting, playbackState, metadata } = state;

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

  const metadataValue = useMemo<NowPlayingMetadata>(() => metadata, [metadata]);

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
