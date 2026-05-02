import { Stack } from 'expo-router';
import { colors } from '../../../constants/tokens';

// Expo Router restores the last route inside a nested Stack on cold start
// (and when the parent tab navigator first mounts the screen). Without an
// explicit initial route, re-entering the Lajme tab could surface the most
// recently viewed [slug] instead of the listing. Declaring `initialRouteName`
// pins the stack root to `index`.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function NewsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
