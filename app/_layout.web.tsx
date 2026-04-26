import { useCallback, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, usePathname, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Merriweather_400Regular,
  Merriweather_700Bold,
} from '@expo-google-fonts/merriweather';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayer } from '../components/MiniPlayer';
import { HamburgerDrawer } from '../components/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../context/DrawerContext';
import { queryStorage } from '../services/storage';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      networkMode: 'offlineFirst',
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: queryStorage,
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  const [fontsLoaded] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableBold: Merriweather_700Bold,
  });

  const onLaunchSplashReady = useCallback(() => {
    if (nativeSplashHidden) {
      return;
    }

    setNativeSplashHidden(true);
    SplashScreen.hideAsync().catch(() => undefined);
  }, [nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
    router.replace('/(tabs)' as never);
  }, [router]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
          }}
        >
          <AudioProvider>
            <DrawerProvider>
              <StatusBar style="dark" />

              <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="rreth-nesh" />
                <Stack.Screen name="na-kontakto" />
                <Stack.Screen name="programi" />
                <Stack.Screen
                  name="player"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                    gestureEnabled: true,
                  }}
                />
              </Stack>

              {pathname !== '/player' ? (
                <MiniPlayer onOpenPlayer={() => router.push('/player' as never)} />
              ) : null}

              {showLaunchSplash ? (
                <LaunchSplash
                  onReady={onLaunchSplashReady}
                  onComplete={onLaunchSplashComplete}
                />
              ) : null}

              <HamburgerDrawer />
            </DrawerProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
