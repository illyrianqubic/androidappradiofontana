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
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { appIdentity } from '../design-tokens';

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

  const soundRef = useRef<Audio.Sound | null>(null);
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

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!mountedRef.current) {
      return;
    }

    if (!status.isLoaded) {
      if (status.error) {
        setIsPlaying(false);
        setIsBuffering(false);
        setIsReconnecting(false);
        setPlaybackState(PlayerState.error);
        setMetadata({
          title: 'Gabim ne stream',
          artist: 'Po rilidhet automatikisht',
        });
        void reconnectRef.current();
      }
      return;
    }

    const buffering = status.isBuffering;
    const playing = status.isPlaying;

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

  const ensurePlayer = useCallback(async () => {
    if (isReady || initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      const sound = new Audio.Sound();
      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      await sound.loadAsync(
        { uri: STREAM_URL },
        {
          shouldPlay: false,
          progressUpdateIntervalMillis: 250,
        },
        false,
      );

      soundRef.current = sound;
      setIsReady(true);
      setPlaybackState(PlayerState.paused);
    } finally {
      initializingRef.current = false;
    }
  }, [isReady, onPlaybackStatusUpdate]);

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
          const oldSound = soundRef.current;
          if (oldSound) {
            oldSound.setOnPlaybackStatusUpdate(null);
            const oldStatus = await oldSound.getStatusAsync();
            if (oldStatus.isLoaded) {
              await oldSound.unloadAsync();
            }
          }

          const sound = new Audio.Sound();
          sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
          soundRef.current = sound;

          await sound.loadAsync(
            { uri: STREAM_URL },
            {
              shouldPlay: true,
              progressUpdateIntervalMillis: 250,
            },
            false,
          );

          setIsReady(true);
        } catch {
          setPlaybackState(PlayerState.error);
          setMetadata({
            title: 'Gabim ne stream',
            artist: 'Po rilidhet automatikisht',
          });
          void reconnect();
        }
      })();
    }, delay);
  }, [clearReconnectTimeout, ensurePlayer, onPlaybackStatusUpdate]);

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
      const sound = soundRef.current;
      if (!sound) {
        await reconnect();
        return;
      }

      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        await sound.loadAsync(
          { uri: STREAM_URL },
          {
            shouldPlay: true,
            progressUpdateIntervalMillis: 250,
          },
          false,
        );
      } else {
        await sound.playAsync();
      }
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

    const sound = soundRef.current;
    if (!sound) {
      return;
    }

    const status = await sound.getStatusAsync();
    if (status.isLoaded && status.isPlaying) {
      await sound.pauseAsync();
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
        title: 'Gabim ne stream',
        artist: 'Provo perseri',
      });
    });

    return () => {
      mountedRef.current = false;
      cancelReconnect();

      const sound = soundRef.current;
      soundRef.current = null;

      if (sound) {
        sound.setOnPlaybackStatusUpdate(null);
        void sound.unloadAsync();
      }
    };
  }, [cancelReconnect, ensurePlayer]);

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
