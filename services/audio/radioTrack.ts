// Shared radio track definition.
//
// Exported separately so both the React provider (services/audio/index.ts)
// AND the headless playback service (services/audio/trackPlayerService.ts)
// reference the exact same track object. Both paths call load(radioTrack)
// before play() on every resume to reconnect at the live edge.

import { Image } from 'react-native';
import { TrackType, type RadioTrack } from './trackPlayerNative';
import { appIdentity } from '../../constants/tokens';

export const RADIO_TRACK_ID = 'rtv-fontana-live';

export const stationMetadata = {
  title: appIdentity.stationName,
  artist: appIdentity.location,
  album: appIdentity.albumTitle,
} as const;

// Resolve the local asset to a file:// URI so Android can use it as the
// media notification largeIcon. Passing a raw require() number works for
// React Native views but Android's MediaSession needs an actual URI string.
const logoUri = Image.resolveAssetSource(appIdentity.logo).uri;

export const radioTrack: RadioTrack = {
  id: RADIO_TRACK_ID,
  url: appIdentity.streamUrl,
  type: TrackType.Default,
  contentType: 'audio/mpeg',
  userAgent: 'RTV Fontana/2.0.0 react-native-track-player',
  title: stationMetadata.title,
  artist: stationMetadata.artist,
  album: stationMetadata.album,
  artwork: logoUri,
  isLiveStream: true,
};
