import { Stack } from 'expo-router';
import { colors } from '../../../design-tokens';

export default function NewsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Fade avoids the side-gap that slide_from_right exposes on Android.
        // animationDuration keeps it snappy.
        animation: 'fade',
        animationDuration: 180,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
