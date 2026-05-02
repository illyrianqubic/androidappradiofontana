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
};

export type RadioTrack = StationMetadata & {
  id: string;
  url: string;
  type: RNTPTrackType;
  contentType: string;
  userAgent?: string;
  isLiveStream: boolean;
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

function loadTrackPlayerPackage(): TrackPlayerPackage {
  requireTrackPlayerModule();
  // Lazy require keeps RNTP's Capability enum from reading NativeModules at
  // app startup in an old dev client, but uses RNTP's own wrapper once linked.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-track-player') as TrackPlayerPackage;
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
};
