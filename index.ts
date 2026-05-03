import 'react-native-gesture-handler';
import { registerTrackPlayerService } from './services/audio/registerTrackPlayerService';
import 'expo-router/entry';

// Register the TrackPlayer headless task so Android can invoke it when
// the user taps lock-screen media controls while the app is in the
// background. Must be called before any background task runs.
registerTrackPlayerService();
