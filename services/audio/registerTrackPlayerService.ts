import TrackPlayer from 'react-native-track-player';
import { trackPlayerService } from './trackPlayerService';

let registered = false;

export function registerTrackPlayerService() {
  if (registered) return;
  registered = true;
  TrackPlayer.registerPlaybackService(() => trackPlayerService);
}
