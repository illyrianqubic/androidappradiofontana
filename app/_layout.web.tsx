import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayerVisibilityGate } from '../components/MiniPlayer';
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

const PERSIST_OPTIONS = {
  persister,
  maxAge: 1000 * 60 * 60 * 24,
} as const;

const ROOT_STACK_SCREEN_OPTIONS = { headerShown: false, animation: 'fade' } as const;

const PLAYER_SCREEN_OPTIONS = {
  presentation: 'modal',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
} as const;

function MiniPlayerHost() {
  const router = useRouter();
  const onOpen = useCallback(() => router.push('/player' as never), [router]);
  return <MiniPlayerVisibilityGate onOpenPlayer={onOpen} />;
}

export default function RootLayout() {
  const router = useRouter();
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  const [interLoaded] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  useEffect(() => {
    if (interLoaded && !nativeSplashHidden) {
      setNativeSplashHidden(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
    router.replace('/(tabs)' as never);
  }, [router]);

  if (!interLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
          <AudioProvider>
            <DrawerProvider>
              <StatusBar style="dark" />

              <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="rreth-nesh" />
                <Stack.Screen name="na-kontakto" />
                <Stack.Screen name="player" options={PLAYER_SCREEN_OPTIONS} />
              </Stack>

              <MiniPlayerHost />

              {showLaunchSplash ? (
                <LaunchSplash
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
