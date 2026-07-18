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
// CRASH FIX (iOS production: instant crash on splash, no JS output).
//
// RNTP 4.1.2 touches the native module at MODULE-EVALUATION time:
//   - src/TrackPlayerModule.ts:  const { TrackPlayerModule } = NativeModules
//   - src/trackPlayer.ts:        new NativeEventEmitter(TrackPlayer)  // iOS
//   - src/constants/Capability.ts: TrackPlayer.CAPABILITY_PLAY, ...
// If NativeModules.TrackPlayerModule is null/undefined, the
// NativeEventEmitter constructor throws an invariant and the Capability
// enum throws a TypeError — while the JS bundle is still being evaluated.
// The previous revision of this file imported RNTP at module scope, and
// the app's root index.ts imports this file as its first statement, so
// that evaluation sat on the startup critical path: in a release build
// the result is an immediate abort behind the splash screen, before React
// renders anything and before any JS error can be surfaced.
//
// When can the module be null? The 4.1.2 native side registers a LEGACY
// bridge module named "TrackPlayerModule"
// (RCT_EXTERN_REMAP_MODULE(TrackPlayerModule, RNTrackPlayer, ...)), while
// 5.0.0-alpha0 registered a TURBO module named "TrackPlayer" — different
// name, different registry. Any binary whose native side doesn't carry the
// 4.1.2 legacy module (an old dev client, a stale binary running newer JS,
// or an interop-layer registration failure under New Architecture) hits
// the eval-time crash.
//
// Fix: never import RNTP at module scope. Everything goes through a lazy,
// cached, availability-guarded require — the same architecture the
// preserved 5.0.0-alpha0 wrapper above used, adapted to 4.1.2's
// NativeModules-based lookup. If the module is unavailable the app now
// boots normally and audio degrades to its error state instead of the
// process dying on the splash screen.
import {
  AppRegistry,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';
// Type-only imports are erased at compile time — they do NOT evaluate the
// package at runtime.
import type { AddTrack, Track, TrackType as RNTPTrackType } from 'react-native-track-player';

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

// The string values above are byte-identical to RNTP 4.1.2's own State and
// Event enums (verified against the installed package), so no runtime
// translation is needed between our string-literal types and RNTP payloads.
const noopSubscription: EmitterSubscription = {
  remove: () => undefined,
} as EmitterSubscription;

function isNativeModulePresent(): boolean {
  try {
    // Safe on both architectures: the bridgeless NativeModules proxy
    // returns null/undefined for unknown modules rather than throwing —
    // but keep the try/catch in case a future RN version changes that.
    return NativeModules.TrackPlayerModule != null;
  } catch {
    return false;
  }
}

// Cache: undefined = not attempted yet, null = attempted and unavailable.
let _pkg: TrackPlayerPackage | null | undefined;

function loadTrackPlayerPackage(): TrackPlayerPackage | null {
  if (_pkg !== undefined) return _pkg;
  if (!isNativeModulePresent()) {
    _pkg = null;
    return _pkg;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _pkg = require('react-native-track-player') as TrackPlayerPackage;
  } catch {
    // Package evaluation itself failed (constants readout etc.) — treat as
    // unavailable instead of letting the throw propagate to a caller.
    _pkg = null;
  }
  return _pkg;
}

function requireTrackPlayerPackage(): TrackPlayerPackage {
  const pkg = loadTrackPlayerPackage();
  if (!pkg) {
    throw new Error('react-native-track-player native module is unavailable. Rebuild the native app.');
  }
  return pkg;
}

export function getPlaybackCapabilities() {
  // Lazy per the crash fix above — Capability's enum values are read off
  // the native module the moment RNTP's JS evaluates. Only called from
  // configurePlayer(), i.e. after setupPlayer() already succeeded.
  const pkg = requireTrackPlayerPackage();
  return [pkg.Capability.Play, pkg.Capability.Pause];
}

export const TrackPlayer = {
  registerPlaybackService(factory: () => () => Promise<void>) {
    if (Platform.OS === 'android') {
      // No RNTP import needed — mirrors RNTP's own implementation.
      AppRegistry.registerHeadlessTask('TrackPlayer', factory);
      return;
    }

    // iOS: RNTP's own registerPlaybackService just does
    // setImmediate(factory()). Doing the same here, but with the package
    // load deferred INSIDE the tick, keeps all RNTP evaluation off the
    // bundle-eval critical path (this method is called from the app's root
    // index.ts before anything renders).
    setImmediate(() => {
      if (!loadTrackPlayerPackage()) return;
      factory()().catch(() => {
        // Service init failed — audio provider surfaces its own error state.
      });
    });
  },

  addEventListener(
    event: TrackPlayerEvent,
    listener: (payload?: { state?: TrackPlayerState }) => void,
  ) {
    const pkg = loadTrackPlayerPackage();
    if (!pkg) return noopSubscription;
    // Cast event/listener as `never` because our string-literal
    // TrackPlayerEvent type is narrower than RNTP's typed Event enum — the
    // underlying string values are identical (see comment above).
    return pkg.default.addEventListener(event as never, listener as never) ?? noopSubscription;
  },

  // The methods below are async so that an unavailable module surfaces as a
  // REJECTED PROMISE (absorbed by the existing try/catch and .catch() paths
  // in services/audio/index.ts) instead of a synchronous throw at the call
  // site.
  async setupPlayer(options: Record<string, unknown>) {
    return requireTrackPlayerPackage().default.setupPlayer(options);
  },

  async updateOptions(options: Record<string, unknown>) {
    return requireTrackPlayerPackage().default.updateOptions(options);
  },

  async reset() {
    return requireTrackPlayerPackage().default.reset();
  },

  async add(track: RadioTrack) {
    return requireTrackPlayerPackage().default.add(track as AddTrack);
  },

  async load(track: RadioTrack) {
    return requireTrackPlayerPackage().default.load(track as Track);
  },

  async updateMetadataForTrack(index: number, metadata: StationMetadata) {
    return requireTrackPlayerPackage().default.updateMetadataForTrack(index, metadata);
  },

  async updateNowPlayingMetadata(metadata: StationMetadata & { isLiveStream?: boolean }) {
    return requireTrackPlayerPackage().default.updateNowPlayingMetadata(metadata);
  },

  async getPlaybackState() {
    return requireTrackPlayerPackage().default.getPlaybackState() as Promise<{ state: TrackPlayerState }>;
  },

  async play() {
    return requireTrackPlayerPackage().default.play();
  },

  async pause() {
    return requireTrackPlayerPackage().default.pause();
  },

  async stop() {
    return requireTrackPlayerPackage().default.stop();
  },
};
