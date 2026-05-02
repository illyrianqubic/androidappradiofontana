import { TrackPlayer, TrackPlayerEvent } from './trackPlayerNative';

export async function trackPlayerService() {
  TrackPlayer.addEventListener(TrackPlayerEvent.RemotePlay, () => {
    console.log('[TrackPlayer Service]', TrackPlayerEvent.RemotePlay);
    TrackPlayer.play().catch(() => undefined);
  });

  TrackPlayer.addEventListener(TrackPlayerEvent.RemotePause, () => {
    console.log('[TrackPlayer Service]', TrackPlayerEvent.RemotePause);
    TrackPlayer.pause().catch(() => undefined);
  });

  TrackPlayer.addEventListener(TrackPlayerEvent.RemoteStop, () => {
    console.log('[TrackPlayer Service]', TrackPlayerEvent.RemoteStop);
    TrackPlayer.pause().catch(() => undefined);
  });
}
