// iOS audio backend using expo-audio instead of react-native-track-player.
//
// WHY RNTP WAS REPLACED: RNTP 4.1.2's native module crashed on iOS with
// EXC_CRASH/SIGABRT, confirmed via a controlled A/B test against real
// device crash logs — a build with AudioProvider/RNTP fully removed
// crashed on a different, independent signature
// (expo.controller.errorRecoveryQueue), while builds with RNTP present
// crashed on com.facebook.react.ExceptionsManagerQueue at byte-identical
// app-binary offsets (2890212/2888704).
//
// CRASH FIX ROUND 2 (the same offsets reappeared after the RNTP replacement
// shipped): expo-audio's own AudioModule.js does
// `export default requireNativeModule('ExpoAudio');` at MODULE EVALUATION
// TIME (no lazy wrapper), and expo-modules-core's requireNativeModule()
// throws synchronously if the native module isn't found (confirmed by
// reading node_modules/expo-modules-core/src/requireNativeModule.ts — its
// own requireOptionalNativeModule() helper returns null gracefully, but
// requireNativeModule() wraps it in `if (!nativeModule) throw new
// Error(...)`). ExpoAudio.js then immediately touches
// AudioModule.AudioPlayer.prototype at its own top level. The original
// version of this file imported { createAudioPlayer, setAudioModeAsync }
// from 'expo-audio' as a static top-level import — exactly the same
// eager-native-throw-at-import-time bug that RNTP had (see
// trackPlayerNative.ts's crash-fix comment for the original writeup),
// just in a different library. This fully explains why swapping RNTP for
// expo-audio produced the IDENTICAL crash offsets: the actual crash site
// is almost certainly the shared Metro/RN module-require error path, not
// any library-specific code — identical regardless of which import threw.
// Fixed the same proven way: defer requiring 'expo-audio' until first
// actual use via loadExpoAudio() below, instead of a static import.
//
// This file otherwise mirrors index.web.ts's reconnect/state-machine
// architecture (already proven correct there) but adds the lock-screen
// integration index.web.ts doesn't need. Android is untouched — index.ts
// still uses RNTP there, where it has always worked.
//
// LOCK SCREEN CONTROLS: expo-audio's AudioPlayer.setActiveForLockScreen()
// only *displays* metadata via its public JS API — but its native iOS
// implementation (node_modules/expo-audio/ios/MediaController.swift) wires
// MPRemoteCommandCenter's playCommand/pauseCommand/togglePlayPauseCommand
// directly to the underlying AVPlayer, with no JS round-trip required.
// Verified by reading that file directly, not assumed from the package
// name — tapping Play/Pause on the lock screen, AirPods, or CarPlay works
// without any JS-side remote-command listener, and the resulting state
// change is reported back to JS via the existing playbackStatusUpdate
// event, same as a JS-initiated play()/pause().
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
// Type-only import — erased at compile time, does NOT evaluate the
// package at runtime. See the crash-fix comment above.
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { appIdentity } from '../../constants/tokens';

type ExpoAudioPackage = typeof import('expo-audio');

// Cache: undefined = not attempted yet, null = attempted and unavailable.
let _expoAudioPkg: ExpoAudioPackage | null | undefined;

function loadExpoAudio(): ExpoAudioPackage | null {
  if (_expoAudioPkg !== undefined) return _expoAudioPkg;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _expoAudioPkg = require('expo-audio') as ExpoAudioPackage;
  } catch (error) {
    if (__DEV__) console.warn('[audio-ios] expo-audio require failed — native module unavailable', error);
    _expoAudioPkg = null;
  }
  return _expoAudioPkg;
}

const reconnectDelaysMs = [1000, 2000, 4000, 8000, 16000, 30000];
const AUDIO_DEBUG = __DEV__;

// Same numeric values as services/audio/index.ts (Android/RNTP) — live.tsx
// imports PlayerState generically from './services/audio' and must behave
// identically regardless of which platform file Metro resolves.
export const PlayerState = {
  none: 0,
  connecting: 1,
  paused: 2,
  playing: 3,
  buffering: 4,
  error: 5,
} as const;
export type PlayerStateValue = (typeof PlayerState)[keyof typeof PlayerState];

export type NowPlayingMetadata = {
  title: string;
  artist: string;
};

export type AudioStateValue = {
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isReconnecting: boolean;
  playbackState: number;
  reconnectAttempt: number;
};

export type AudioActionsValue = {
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  reconnect: () => Promise<void>;
};

export type AudioContextValue = AudioStateValue & AudioActionsValue;

type PlayerStateShape = AudioStateValue & {
  metadata: NowPlayingMetadata;
};

function audioLog(message: string, details?: unknown) {
  if (!AUDIO_DEBUG) return;
  if (details === undefined) {
    console.info(`[audio-ios] ${message}`);
    return;
  }
  console.info(`[audio-ios] ${message}`, details);
}

function audioError(message: string, error: unknown) {
  if (!AUDIO_DEBUG) return;
  console.warn(`[audio-ios] ${message}`, error);
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
  reconnectAttempt: 0,
  metadata: {
    title: appIdentity.stationName,
    artist: appIdentity.location,
  },
};

// expo-audio has no headless-task concept — background playback and lock
// screen remote commands are handled entirely natively (AVPlayer +
// MPRemoteCommandCenter), no JS process resumption required. Kept as a
// no-op so the shared service export shape stays aligned with Android.
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
  const playSettlingCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseIntentRef = useRef(false);
  const playIntentStartedAtRef = useRef(0);
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

  const clearPlaySettlingCheck = useCallback(() => {
    if (playSettlingCheckTimeoutRef.current) {
      clearTimeout(playSettlingCheckTimeoutRef.current);
      playSettlingCheckTimeoutRef.current = null;
    }
  }, []);

  const syncPausedFromSettledPlayer = useCallback(() => {
    const status = playerRef.current?.currentStatus;
    if (!mountedRef.current || !status?.isLoaded || status.playing || status.isBuffering) {
      return;
    }
    userIntentRef.current = 'idle';
    pauseIntentRef.current = false;
    clearReconnectTimeout();
    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
    });
  }, [clearReconnectTimeout, updateState]);

  const schedulePlaySettlingCheck = useCallback(() => {
    clearPlaySettlingCheck();
    const elapsed = Date.now() - playIntentStartedAtRef.current;
    const wait = Math.max(80, 1250 - elapsed);
    playSettlingCheckTimeoutRef.current = setTimeout(() => {
      playSettlingCheckTimeoutRef.current = null;
      syncPausedFromSettledPlayer();
    }, wait);
  }, [clearPlaySettlingCheck, syncPausedFromSettledPlayer]);

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
        metadata: { title: 'Gabim në stream', artist: 'Po rilidhet automatikisht' },
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
      if (playing && !buffering) {
        pauseIntentRef.current = false;
        userIntentRef.current = 'idle';
        clearPlaySettlingCheck();
        reconnectAttemptRef.current = 0;
        updateState({
          isPlaying: true,
          isBuffering: false,
          isReconnecting: false,
          playbackState: PlayerState.playing,
          reconnectAttempt: 0,
          metadata: { title: appIdentity.stationName, artist: appIdentity.location },
        });
        return;
      }

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
      userIntentRef.current = 'idle';
      clearPlaySettlingCheck();
      updateState({
        isPlaying: true,
        isBuffering: false,
        isReconnecting: false,
        playbackState: PlayerState.playing,
        reconnectAttempt: 0,
        metadata: { title: appIdentity.stationName, artist: appIdentity.location },
      });
      return;
    }

    if (userIntentRef.current === 'play') {
      const settling = Date.now() - playIntentStartedAtRef.current < 1200;
      if (!stateRef.current.isPlaying && settling) {
        schedulePlaySettlingCheck();
        return;
      }
      userIntentRef.current = 'idle';
    }
    if (!generationMatches()) return;
    clearReconnectTimeout();
    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
    });
  }, [clearPlaySettlingCheck, clearReconnectTimeout, schedulePlaySettlingCheck, updateState]);

  const releaseCurrentPlayer = useCallback(() => {
    statusSubscriptionRef.current?.remove();
    statusSubscriptionRef.current = null;
    clearPlaySettlingCheck();
    try {
      playerRef.current?.clearLockScreenControls();
    } catch {
      // Best effort — lock screen state is cosmetic, never block teardown.
    }
    playerRef.current?.remove();
    playerRef.current = null;
  }, [clearPlaySettlingCheck]);

  const createAndAttachPlayer = useCallback(
    (autoPlay: boolean): AudioPlayer | null => {
      const expoAudio = loadExpoAudio();
      if (!expoAudio) return null;

      releaseCurrentPlayer();

      const player = expoAudio.createAudioPlayer(
        {
          uri: appIdentity.streamUrl,
          headers: { 'User-Agent': 'RTV Fontana/2.0.0 expo-audio' },
        },
        {
          updateInterval: 2000,
          keepAudioSessionActive: true,
        },
      );

      statusSubscriptionRef.current = player.addListener(
        'playbackStatusUpdate',
        onPlaybackStatusUpdate,
      );

      try {
        // No skip/seek buttons — this is a live stream, seeking is
        // meaningless. Mirrors the Android (RNTP) provider only offering
        // Capability.Play/Capability.Pause.
        player.setActiveForLockScreen(
          true,
          {
            title: stateRef.current.metadata.title,
            artist: stateRef.current.metadata.artist,
            artworkUrl: appIdentity.lockScreenArtwork,
          },
          { showSeekForward: false, showSeekBackward: false },
        );
      } catch {
        // Best effort — lock screen integration is a UX nicety, never
        // block playback over it.
      }

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
      const expoAudio = loadExpoAudio();
      if (!expoAudio) {
        throw new Error('expo-audio native module is unavailable. Rebuild the native app.');
      }

      await expoAudio.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
        shouldPlayInBackground: true,
      });

      if (!createAndAttachPlayer(false)) {
        throw new Error('expo-audio native module is unavailable. Rebuild the native app.');
      }
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
    if (userIntentRef.current === 'pause') return;
    await ensurePlayer();
    clearReconnectTimeout();

    updateState({
      isReconnecting: true,
      isBuffering: true,
      playbackState: PlayerState.connecting,
    });

    const attempt = reconnectAttemptRef.current;
    const MAX_RECONNECT_ATTEMPTS = 15;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      audioLog('reconnect ceiling reached — stopping retries', { attempt });
      updateState({
        isReconnecting: false,
        isBuffering: false,
        playbackState: PlayerState.error,
        metadata: {
          title: 'Gabim në stream',
          artist: 'Rilidhja u ndal pas shumë tentimeve',
        },
      });
      return;
    }
    const delay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)];
    reconnectAttemptRef.current += 1;
    updateState({ reconnectAttempt: reconnectAttemptRef.current });
    audioLog('reconnect scheduled', { attempt, delay });

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (!mountedRef.current || userIntentRef.current === 'pause') return;
      void (async () => {
        try {
          createAndAttachPlayer(true);
          updateState({ isReady: true });
        } catch (error) {
          audioError('reconnect play error', error);
          if (!mountedRef.current) return;
          updateState({
            playbackState: PlayerState.error,
            metadata: { title: 'Gabim në stream', artist: 'Po rilidhet automatikisht' },
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
    if (userIntentRef.current === 'pause') return;
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
    audioLog('play action');
    intentGenerationRef.current += 1;
    userIntentRef.current = 'play';
    playIntentStartedAtRef.current = Date.now();
    cancelReconnect();
    clearPlaySettlingCheck();
    pauseIntentRef.current = false;
    reconnectAttemptRef.current = 0;

    updateState({
      isPlaying: false,
      isBuffering: true,
      isReconnecting: true,
      playbackState: PlayerState.buffering,
      reconnectAttempt: 0,
    });

    try {
      await ensurePlayer();

      // Always reconnect to the live edge on tap, never resume from a
      // stale buffer — mirrors the Android (RNTP) provider's play().
      createAndAttachPlayer(true);
    } catch (error) {
      audioError('play error', error);
      void reconnect();
    }
  }, [cancelReconnect, clearPlaySettlingCheck, createAndAttachPlayer, ensurePlayer, reconnect, updateState]);

  const pause = useCallback(() => {
    audioLog('pause action');
    userIntentRef.current = 'pause';
    cancelReconnect();
    clearPlaySettlingCheck();
    pauseIntentRef.current = true;

    updateState({
      isPlaying: false,
      isBuffering: false,
      isReconnecting: false,
      playbackState: PlayerState.paused,
      metadata: { title: appIdentity.stationName, artist: appIdentity.location },
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
  }, [cancelReconnect, clearPlaySettlingCheck, updateState]);

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
    // Eagerly set up the player on mount so the session/queue is ready
    // before the first play tap, matching the Android (RNTP) provider.
    void ensurePlayer().catch((error) => {
      audioError('eager setup error', error);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPlaySettlingCheck();
      cancelReconnect();
      releaseCurrentPlayer();
    };
  }, [cancelReconnect, clearPlaySettlingCheck, releaseCurrentPlayer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      const status = playerRef.current?.currentStatus;
      if (!status) return;
      onPlaybackStatusUpdate(status);
    });
    return () => sub.remove();
  }, [onPlaybackStatusUpdate]);

  const { isReady, isPlaying, isBuffering, isReconnecting, playbackState, reconnectAttempt, metadata } = state;

  // Keep the lock screen's Now Playing info in sync with error/reconnect
  // metadata changes, not just the initial static station name — mirrors
  // safeUpdateStationMetadata() in the Android (RNTP) provider.
  useEffect(() => {
    try {
      playerRef.current?.updateLockScreenMetadata({
        title: metadata.title,
        artist: metadata.artist,
        artworkUrl: appIdentity.lockScreenArtwork,
      });
    } catch {
      // Best effort.
    }
  }, [metadata]);

  const stateValue = useMemo<AudioStateValue>(
    () => ({
      isReady,
      isPlaying,
      isBuffering,
      isReconnecting,
      playbackState,
      reconnectAttempt,
    }),
    [isReady, isPlaying, isBuffering, isReconnecting, playbackState, reconnectAttempt],
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

export function useAudioState(): AudioStateValue | null {
  return useContext(AudioStateContext);
}

export function useAudioMetadata(): NowPlayingMetadata | null {
  return useContext(AudioMetadataContext);
}

export function useAudioActions(): AudioActionsValue | null {
  return useContext(AudioActionsContext);
}

export function useAudio(): AudioContextValue | null {
  const state = useAudioState();
  const actions = useAudioActions();
  return useMemo(() => {
    if (!state || !actions) return null;
    return { ...state, ...actions };
  }, [state, actions]);
}
