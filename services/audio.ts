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
import { addListeningHistory } from './storage';

const STREAM_URL = 'https://live.radiostreaming.al:8010/stream.mp3';
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

type AudioContextValue = {
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isReconnecting: boolean;
  metadata: NowPlayingMetadata;
  playbackState: number;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  reconnect: () => Promise<void>;
};

const AudioContext = createContext<AudioContextValue | null>(null);

export async function playbackService() {
  return;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [playbackState, setPlaybackState] = useState<number>(PlayerState.none);
  const [metadata, setMetadata] = useState<NowPlayingMetadata>({
    title: appIdentity.stationName,
    artist: appIdentity.location,
  });

  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectRef = useRef<() => Promise<void>>(async () => undefined);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AudioStatus) => {
    if (!mountedRef.current) {
      return;
    }

    const playbackStateLabel = (status.playbackState ?? '').toLowerCase();
    const isFailureState =
      playbackStateLabel.includes('fail') || playbackStateLabel.includes('error');

    if (isFailureState) {
      setIsPlaying(false);
      setIsBuffering(false);
      setIsReconnecting(false);
      setPlaybackState(PlayerState.error);
      setMetadata({
        title: 'Gabim në stream',
        artist: 'Po rilidhet automatikisht',
      });
      void reconnectRef.current();
      return;
    }

    if (!status.isLoaded) {
      setIsPlaying(false);
      setIsBuffering(true);
      setIsReconnecting(true);
      setPlaybackState(PlayerState.connecting);
      return;
    }

    const buffering = status.isBuffering;
    const playing = status.playing;

    setIsPlaying(playing);
    setIsBuffering(buffering);

    if (buffering) {
      setIsReconnecting(true);
      setPlaybackState(PlayerState.buffering);
      return;
    }

    if (playing) {
      reconnectAttemptRef.current = 0;
      setIsReconnecting(false);
      setPlaybackState(PlayerState.playing);
      setMetadata({
        title: appIdentity.stationName,
        artist: appIdentity.location,
      });
      return;
    }

    setIsReconnecting(false);
    setPlaybackState(PlayerState.paused);
  }, []);

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
        { uri: STREAM_URL },
        {
          updateInterval: 250,
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
        // Equivalent of legacy staysActiveInBackground: true
        shouldPlayInBackground: true,
      });

      createAndAttachPlayer(false);
      setIsReady(true);
      setPlaybackState(PlayerState.paused);
      setMetadata({
        title: appIdentity.stationName,
        artist: appIdentity.location,
      });
    } finally {
      initializingRef.current = false;
    }
  }, [createAndAttachPlayer]);

  const cancelReconnect = useCallback(() => {
    clearReconnectTimeout();
    setIsReconnecting(false);
  }, [clearReconnectTimeout]);

  const reconnect = useCallback(async () => {
    await ensurePlayer();
    clearReconnectTimeout();

    setIsReconnecting(true);
    setIsBuffering(true);
    setPlaybackState(PlayerState.connecting);

    const attempt = reconnectAttemptRef.current;
    const delay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)];
    reconnectAttemptRef.current += 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;

      void (async () => {
        try {
          createAndAttachPlayer(true);

          setIsReady(true);
        } catch {
          setPlaybackState(PlayerState.error);
          setMetadata({
            title: 'Gabim në stream',
            artist: 'Po rilidhet automatikisht',
          });
          void reconnectRef.current();
        }
      })();
    }, delay);
  }, [clearReconnectTimeout, createAndAttachPlayer, ensurePlayer]);

  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  const play = useCallback(async () => {
    await ensurePlayer();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    setIsReconnecting(true);
    setIsBuffering(true);
    setPlaybackState(PlayerState.connecting);

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
  }, [ensurePlayer, reconnect]);

  const pause = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    cancelReconnect();

    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackState(PlayerState.paused);

    const player = playerRef.current;
    if (!player) {
      return;
    }

    if (player.playing) {
      player.pause();
    }
  }, [cancelReconnect]);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [isPlaying, pause, play]);

  useEffect(() => {
    mountedRef.current = true;
    ensurePlayer().catch(() => {
      setPlaybackState(PlayerState.error);
      setMetadata({
        title: 'Gabim në stream',
        artist: 'Provo përsëri',
      });
    });

    return () => {
      mountedRef.current = false;
      cancelReconnect();
      releaseCurrentPlayer();
    };
  }, [cancelReconnect, ensurePlayer, releaseCurrentPlayer]);

  useEffect(() => {
    if (
      !isPlaying ||
      isBuffering ||
      metadata.title === 'Po lidhet...' ||
      metadata.title === 'Gabim në stream'
    ) {
      return;
    }

    addListeningHistory({
      id: metadata.title,
      title: metadata.title,
      artist: metadata.artist,
      listenedAt: new Date().toISOString(),
    });
  }, [isPlaying, metadata.artist, metadata.title]);

  const value = useMemo<AudioContextValue>(
    () => ({
      isReady,
      isPlaying,
      isBuffering,
      isReconnecting,
      metadata,
      playbackState,
      play,
      pause,
      toggle,
      reconnect,
    }),
    [
      isReady,
      isPlaying,
      isBuffering,
      isReconnecting,
      metadata,
      playbackState,
      play,
      pause,
      toggle,
      reconnect,
    ],
  );

  return React.createElement(AudioContext.Provider, { value }, children);
}

export function useAudio() {
  const ctx = useContext(AudioContext);

  if (!ctx) {
    throw new Error('useAudio must be used inside AudioProvider');
  }

  return ctx;
}
