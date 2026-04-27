import { Component, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayer } from '../components/MiniPlayer';
import { HamburgerDrawer } from '../components/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../context/DrawerContext';
import { UIProvider } from '../context/UIContext';
import { queryStorage } from '../services/storage';
import { fetchLatestPosts } from '../services/api';
import { colors } from '../design-tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// ── Error boundary — catches any render crash and shows a readable message ────
type EBState = { error: string | null };
class RootErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown): EBState {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { error: msg };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={ebStyles.wrap}>
          <Text style={ebStyles.title}>App crashed on startup</Text>
          <Text style={ebStyles.msg}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
const ebStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#dc2626', marginBottom: 12 },
  msg: { fontSize: 13, color: '#374151', textAlign: 'center', lineHeight: 20 },
});

// Fired once inside PersistQueryClientProvider so useQueryClient() is available.
// Prefetches the default news feed so the first visit is instant (served from cache).
function PrefetchOnMount() {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['news-feed', '', ''],
      queryFn: () => fetchLatestPosts('', '', 40),
      staleTime: 1000 * 60 * 5,
    }).catch(() => undefined);
  // Intentionally runs once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

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

  // Load Inter (UI) and Merriweather (article bodies) in parallel.
  // We do NOT block rendering on Merriweather — articles are never the first screen.
  const [interLoaded, interFontError] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  // Merriweather is only needed when reading an article. Load it opportunistically
  // in the background so it's ready when the user first opens an article.
  useFonts({
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableBold: Merriweather_700Bold,
  });

  // Kick off the native splash hide as soon as Inter (UI fonts) are ready or errored.
  // If we only wait for interLoaded, a font error leaves the native splash stuck forever.
  useEffect(() => {
    if ((interLoaded || interFontError) && !nativeSplashHidden) {
      setNativeSplashHidden(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, interFontError, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
    router.replace('/(tabs)' as never);
  }, [router]);

  // After 22+ seconds of bundle loading the native splash is gone — returning null
  // here would leave a grey screen. Show a white view (matches splash bg) while fonts
  // load, and proceed even if font loading errored (fallback system font is fine).
  if (!interLoaded && !interFontError) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  return (
    <RootErrorBoundary>
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
            <UIProvider>
            <DrawerProvider>
              <StatusBar style="dark" />
              <PrefetchOnMount />

              <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="article/[slug]"
                  options={{
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: colors.surface },
                  }}
                />
                <Stack.Screen name="rreth-nesh" />
                <Stack.Screen name="na-kontakto" />
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
                <LaunchSplash onComplete={onLaunchSplashComplete} />
              ) : null}

              <HamburgerDrawer />
            </DrawerProvider>
            </UIProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
