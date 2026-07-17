/* ============================================================
   ANDROID / 5.0.0-alpha0 IMPLEMENTATION — DO NOT DELETE
   ============================================================
   This was the original implementation using TurboModuleRegistry
   for react-native-track-player@5.0.0-alpha0 (New Architecture
   TurboModule approach). It works on Android with newArchEnabled:true
   but crashes on iOS after "state event loading".

   TO RESTORE FOR ANDROID: uncomment this block and remove the
   4.1.2 implementation below. Or create a trackPlayerNative.android.ts
   file with this content if you need platform-specific implementations.

   Original commit: see git log for the pre-migration version of this file.
   ============================================================

import {
  AppRegistry,
  Platform,
  TurboModuleRegistry,
  type EmitterSubscription,
} from 'react-native';
import type { AddTrack, TrackType as RNTPTrackType } from 'react-native-track-player';

// Opaque type — we only need to check presence, not read properties.
type NativeTrackPlayerModule = Record<string, unknown>;

type TrackPlayerPackage = typeof import('react-native-track-player');

export type StationMetadata = {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
};

export type RadioTrack = StationMetadata & {
  id: string;
  url: string;
  type: RNTPTrackType;
  contentType: string;
  userAgent?: string;
  isLiveStream: boolean;
  artwork?: string | number;
};

export const TrackPlayerState = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Loading: 'loading',
  Buffering: 'buffering',
  Error: 'error',
  Ended: 'ended',
} as const;

export type TrackPlayerState = (typeof TrackPlayerState)[keyof typeof TrackPlayerState];

export const TrackPlayerEvent = {
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  MetadataCommonReceived: 'metadata-common-received',
} as const;

export type TrackPlayerEvent = (typeof TrackPlayerEvent)[keyof typeof TrackPlayerEvent];

export const TrackType = {
  Default: 'default' as RNTPTrackType,
} as const;

export const AndroidAudioContentType = {
  Music: 'music',
} as const;

export const AppKilledPlaybackBehavior = {
  ContinuePlayback: 'continue-playback',
  StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
} as const;

const noopSubscription: EmitterSubscription = {
  remove: () => undefined,
} as EmitterSubscription;

let lastModuleLookupError: string | undefined;

export function getTrackPlayerModule(): NativeTrackPlayerModule | null {
  try {
    lastModuleLookupError = undefined;
    // v5 is a Turbo Module — use TurboModuleRegistry.get (non-enforcing) so
    // this returns null instead of throwing when the module is unavailable
    // (e.g. in Expo Go or before a native rebuild).
    return TurboModuleRegistry.get<NativeTrackPlayerModule>('TrackPlayer');
  } catch (error) {
    // On New Architecture, accessing an incompatible native module throws a
    // C++ HostObject exception rather than returning undefined. Treat it as
    // unavailable so isTrackPlayerAvailable() returns false and the audio
    // provider shows "rebuild required" instead of crashing.
    lastModuleLookupError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function isTrackPlayerAvailable() {
  return getTrackPlayerModule() !== null;
}

export function getTrackPlayerDiagnostics() {
  return {
    available: isTrackPlayerAvailable(),
    lookupError: lastModuleLookupError,
  };
}

function requireTrackPlayerModule() {
  const module = getTrackPlayerModule();
  if (!module) {
    throw new Error('react-native-track-player native module is unavailable. Rebuild the development client.');
  }
  return module;
}

// AUDIT FIX: cache the resolved package so every TrackPlayer.play(), pause(),
// reset(), etc. doesn't re-require the module. In rapid reconnect loops this
// removes unnecessary bridge/module-system overhead.
let _cachedTrackPlayerPackage: TrackPlayerPackage | undefined;

function loadTrackPlayerPackage(): TrackPlayerPackage {
  if (_cachedTrackPlayerPackage) return _cachedTrackPlayerPackage;
  requireTrackPlayerModule();
  // Lazy require keeps RNTP's Capability enum from reading NativeModules at
  // app startup in an old dev client, but uses RNTP's own wrapper once linked.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _cachedTrackPlayerPackage = require('react-native-track-player') as TrackPlayerPackage;
  return _cachedTrackPlayerPackage;
}

export function getPlaybackCapabilities() {
  // Capability enum values are resolved from native constants at runtime.
  // Use RNTP's own Capability enum rather than reading raw constant numbers
  // from the TurboModule (v5 exposes constants via getConstants(), not as
  // direct module properties the way the old bridge did).
  const pkg = loadTrackPlayerPackage();
  return [pkg.Capability.Play, pkg.Capability.Pause];
}

export const TrackPlayer = {
  registerPlaybackService(factory: () => () => Promise<void>) {
    if (Platform.OS === 'android') {
      AppRegistry.registerHeadlessTask('TrackPlayer', factory);
      return;
    }

    if (!isTrackPlayerAvailable()) return;
    setImmediate(factory());
  },

  addEventListener(
    event: TrackPlayerEvent,
    listener: (payload?: { state?: TrackPlayerState }) => void,
  ) {
    if (!isTrackPlayerAvailable()) return noopSubscription;
    // Delegate to RNTP v5's own addEventListener which uses NativeEventEmitter
    // internally. Cast event/listener as `never` because our string-literal
    // TrackPlayerEvent type is narrower than RNTP's typed Event enum.
    return (
      loadTrackPlayerPackage().default.addEventListener(event as never, listener as never) ??
      noopSubscription
    );
  },

  setupPlayer(options: Record<string, unknown>) {
    return loadTrackPlayerPackage().default.setupPlayer(options);
  },

  updateOptions(options: Record<string, unknown>) {
    return loadTrackPlayerPackage().default.updateOptions(options);
  },

  reset() {
    return loadTrackPlayerPackage().default.reset();
  },

  add(track: RadioTrack) {
    return loadTrackPlayerPackage().default.add(track as AddTrack);
  },

  load(track: RadioTrack) {
    return loadTrackPlayerPackage().default.load(track as AddTrack);
  },

  updateMetadataForTrack(index: number, metadata: StationMetadata) {
    return loadTrackPlayerPackage().default.updateMetadataForTrack(index, metadata);
  },

  updateNowPlayingMetadata(metadata: StationMetadata & { isLiveStream?: boolean }) {
    return loadTrackPlayerPackage().default.updateNowPlayingMetadata(metadata);
  },

  getPlaybackState() {
    return loadTrackPlayerPackage().default.getPlaybackState() as Promise<{ state: TrackPlayerState }>;
  },

  play() {
    return loadTrackPlayerPackage().default.play();
  },

  pause() {
    return loadTrackPlayerPackage().default.pause();
  },

  stop() {
    return loadTrackPlayerPackage().default.stop();
  },
};

   ============================================================ */

// ============================================================
// react-native-track-player@4.1.2 IMPLEMENTATION (current)
// ============================================================
// Migrated from 5.0.0-alpha0 (TurboModule, New Architecture-only) to
// 4.1.2 (stable) because 5.0.0-alpha0 crashes on iOS after entering the
// "Loading" state. newArchEnabled stays true for the rest of the app —
// 4.1.2 has no codegenConfig/TurboModule spec at all (confirmed by
// inspecting the installed package), so it runs through React Native's
// Legacy Interop Layer instead.
//
// Because 4.1.2 is a plain NativeModules bridge module rather than a
// Turbo Module, it does not throw synchronously when unavailable the way
// 5.0.0-alpha0's TurboModuleRegistry.getEnforcing() did — the elaborate
// lazy-require + availability-check machinery above (getTrackPlayerModule,
// isTrackPlayerAvailable, getTrackPlayerDiagnostics, requireTrackPlayerModule,
// loadTrackPlayerPackage) existed specifically to survive that TurboModule
// failure mode and is not needed here.
//
// One residual risk worth knowing: RNTP's own `Capability` enum (imported
// below) reads its values off `NativeModules.TrackPlayerModule` at *module
// evaluation time*. If the native module truly isn't linked (e.g. a stale
// dev client that hasn't been rebuilt since this migration, or Expo Go,
// which never supported RNTP regardless of version), importing this file
// will throw while that enum is being constructed, before any of our own
// code runs. This is inherent to RNTP 4.x's own source — not something a
// wrapper can guard against without reintroducing the lazy-require pattern
// removed above — and only affects unlinked/stale dev builds, never a
// correctly built production binary.
import { type EmitterSubscription } from 'react-native';
import RNTrackPlayer, {
  Capability,
  type AddTrack,
  type Track,
  type TrackType as RNTPTrackType,
} from 'react-native-track-player';

export type StationMetadata = {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
};

export type RadioTrack = StationMetadata & {
  id: string;
  url: string;
  type: RNTPTrackType;
  contentType: string;
  userAgent?: string;
  isLiveStream: boolean;
  artwork?: string | number;
};

export const TrackPlayerState = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Loading: 'loading',
  Buffering: 'buffering',
  Error: 'error',
  Ended: 'ended',
} as const;

export type TrackPlayerState = (typeof TrackPlayerState)[keyof typeof TrackPlayerState];

export const TrackPlayerEvent = {
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  MetadataCommonReceived: 'metadata-common-received',
} as const;

export type TrackPlayerEvent = (typeof TrackPlayerEvent)[keyof typeof TrackPlayerEvent];

export const TrackType = {
  Default: 'default' as RNTPTrackType,
} as const;

export const AndroidAudioContentType = {
  Music: 'music',
} as const;

export const AppKilledPlaybackBehavior = {
  ContinuePlayback: 'continue-playback',
  StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
} as const;

// Verified against node_modules/react-native-track-player's own State/Event
// constants: the string values above are byte-identical to RNTP 4.1.2's
// (and 5.0.0-alpha0's) real State/Event enums, so no runtime translation is
// needed between our own string-literal types and RNTP's payloads.
const noopSubscription: EmitterSubscription = {
  remove: () => undefined,
} as EmitterSubscription;

// RNTP 4.1.2 is a plain NativeModules bridge — Capability.Play/.Pause are
// read as direct module constants (not via getConstants() the way v5's
// TurboModule did).
export function getPlaybackCapabilities() {
  return [Capability.Play, Capability.Pause];
}

export const TrackPlayer = {
  registerPlaybackService(factory: () => () => Promise<void>) {
    // ANDROID NOTE (5.0.0-alpha0): the original wrapper reimplemented the
    // Android headless task / iOS setImmediate split manually here, guarded
    // by isTrackPlayerAvailable(), to avoid eagerly loading RNTP before it
    // was confirmed linked. RNTP 4.1.2's own registerPlaybackService already
    // handles that same platform split internally, so we delegate directly.
    RNTrackPlayer.registerPlaybackService(factory);
  },

  addEventListener(
    event: TrackPlayerEvent,
    listener: (payload?: { state?: TrackPlayerState }) => void,
  ) {
    // Cast event/listener as `never` because our string-literal
    // TrackPlayerEvent type is narrower than RNTP's typed Event enum — the
    // underlying string values are identical (see comment above).
    return RNTrackPlayer.addEventListener(event as never, listener as never) ?? noopSubscription;
  },

  setupPlayer(options: Record<string, unknown>) {
    return RNTrackPlayer.setupPlayer(options);
  },

  updateOptions(options: Record<string, unknown>) {
    return RNTrackPlayer.updateOptions(options);
  },

  reset() {
    return RNTrackPlayer.reset();
  },

  add(track: RadioTrack) {
    return RNTrackPlayer.add(track as AddTrack);
  },

  load(track: RadioTrack) {
    return RNTrackPlayer.load(track as Track);
  },

  updateMetadataForTrack(index: number, metadata: StationMetadata) {
    return RNTrackPlayer.updateMetadataForTrack(index, metadata);
  },

  updateNowPlayingMetadata(metadata: StationMetadata & { isLiveStream?: boolean }) {
    return RNTrackPlayer.updateNowPlayingMetadata(metadata);
  },

  getPlaybackState() {
    return RNTrackPlayer.getPlaybackState() as Promise<{ state: TrackPlayerState }>;
  },

  play() {
    return RNTrackPlayer.play();
  },

  pause() {
    return RNTrackPlayer.pause();
  },

  stop() {
    return RNTrackPlayer.stop();
  },
};
