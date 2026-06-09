// Shared radio track definition.
//
// Exported separately so both the React provider (services/audio/index.ts)
// AND the headless playback service (services/audio/trackPlayerService.ts)
// reference the exact same track object. Both paths call load(radioTrack)
// before play() on every resume to reconnect at the live edge.

import { Platform } from 'react-native';
import { TrackType, type RadioTrack } from './trackPlayerNative';
import { appIdentity } from '../../constants/tokens';

// Android expanded media notifications render better with a wide (landscape)
// artwork. iOS and compact Android notifications use the square artwork.
const lockScreenArtworkUri = Platform.OS === 'android'
  ? appIdentity.lockScreenArtworkWide
  : appIdentity.lockScreenArtwork;

export const RADIO_TRACK_ID = 'rtv-fontana-live';

export const stationMetadata = {
  title: appIdentity.stationName,
  artist: appIdentity.location,
  album: appIdentity.albumTitle,
  artwork: lockScreenArtworkUri,
} as const;

export const radioTrack: RadioTrack = {
  id: RADIO_TRACK_ID,
  url: appIdentity.streamUrl,
  type: TrackType.Default,
  contentType: 'audio/mpeg',
  userAgent: 'RTV Fontana/2.0.0 react-native-track-player',
  title: stationMetadata.title,
  artist: stationMetadata.artist,
  album: stationMetadata.album,
  artwork: lockScreenArtworkUri,
  isLiveStream: true,
};
