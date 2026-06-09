import { Stack } from 'expo-router';
import { useTheme } from '../../../providers/ThemeProvider';

// Expo Router restores the last route inside a nested Stack on cold start
// (and when the parent tab navigator first mounts the screen). Without an
// explicit initial route, re-entering the Lajme tab could surface the most
// recently viewed [slug] instead of the listing. Declaring `initialRouteName`
// pins the stack root to `index`.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function NewsStackLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 200,
        contentStyle: { backgroundColor: colors.bgScreen },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
