import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { EqualizerBars } from '../../components/EqualizerBars';
import { HamburgerButton } from '../../components/HamburgerButton';
import { LiveBadge } from '../../components/LiveBadge';
import { appIdentity, colors, fonts, radius, spacing } from '../../design-tokens';
import { useAudio } from '../../services/audio';
import { fetchLiveStream } from '../../services/api';

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const { isPlaying, isReconnecting, isBuffering, toggle } = useAudio();
  const liveQuery = useQuery({ queryKey: ['live-stream'], queryFn: fetchLiveStream });
  const liveData = liveQuery.data;

  const showFbEmbed = useMemo(
    () => liveData?.isLive && liveData.facebookUrl,
    [liveData?.isLive, liveData?.facebookUrl],
  );

  const topBarHeight = insets.top + 54;

  const isActive = isPlaying || isBuffering || isReconnecting;

  return (
    <View style={styles.screen}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: topBarHeight }]}>
        <Text style={styles.topBarTitle}>Drejtpërdrejt</Text>
        <HamburgerButton />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topBarHeight + 8, paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Hero player card ─────────────────────────────── */}
        <View style={styles.heroCardOuter}>
          <LinearGradient
            colors={['#dc2626', '#b91c1c', '#7f1d1d']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Decorative circles */}
            <View style={styles.decCircle1} />
            <View style={styles.decCircle2} />

            {/* Logo */}
            <View style={styles.logoWrap}>
              <Image source={appIdentity.logo} contentFit="cover" style={styles.logo} />
            </View>

            {/* Station info */}
            <Text style={styles.stationTitle}>Radio Fontana</Text>
            <Text style={styles.stationFreq}>98.8 FM · Istog, Kosovë</Text>

            {/* Equalizer */}
            <View style={styles.eqWrap}>
              <EqualizerBars bars={7} playing={isPlaying} variant="full" color="rgba(255,255,255,0.85)" />
            </View>

            {/* Status pill */}
            {isPlaying ? (
              <LiveBadge withDot variant="solid" />
            ) : isReconnecting || isBuffering ? (
              <View style={styles.connectingPill}>
                <Text style={styles.connectingText}>Po lidhet...</Text>
              </View>
            ) : (
              <View style={styles.offlinePill}>
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── Play / Pause button ──────────────────────────── */}
        <View style={styles.playSection}>
          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          >
            <LinearGradient
              colors={isActive ? ['#111827', '#1f2937'] : [colors.primary, '#b91c1c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playButtonGradient}
            >
              <Text style={styles.playButtonIcon}>
                {isPlaying ? '❙❙' : (isBuffering || isReconnecting) ? '···' : '▶'}
              </Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.playLabel}>
            {isPlaying ? 'Duke dëgjuar live' : isReconnecting || isBuffering ? 'Po lidhet me stream...' : 'Shtyp për të dëgjuar'}
          </Text>
        </View>

        {/* ── Info cards ───────────────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📻</Text>
            <Text style={styles.infoLabel}>Frekuenca</Text>
            <Text style={styles.infoValue}>98.8 FM</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoLabel}>Vendndodhja</Text>
            <Text style={styles.infoValue}>Istog, Kosovë</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🕐</Text>
            <Text style={styles.infoLabel}>Transmetim</Text>
            <Text style={styles.infoValue}>24/7</Text>
          </View>
        </View>

        {/* ── Facebook live embed ──────────────────────────── */}
        {showFbEmbed ? (
          <View style={styles.embedSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Facebook Live</Text>
            </View>
            <View style={styles.embedCard}>
              <WebView
                source={{ uri: liveData!.facebookUrl! }}
                style={styles.webView}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  topBarTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 18,
    color: colors.text,
    letterSpacing: -0.2,
  },

  // ── Hero card ──────────────────────────────────────────────
  heroCardOuter: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
    gap: 10,
    overflow: 'hidden',
  },
  decCircle1: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -80,
    right: -80,
  },
  decCircle2: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -50,
    left: -50,
  },
  logoWrap: {
    width: 110,
    height: 110,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    marginBottom: 4,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  stationTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  stationFreq: {
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: -4,
  },
  eqWrap: {
    marginVertical: 4,
  },
  connectingPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 2,
  },
  connectingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },
  offlinePill: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 2,
  },
  offlineText: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },

  // ── Play button ────────────────────────────────────────────
  playSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: 12,
  },
  playButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  playButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  playButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonIcon: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 26,
    lineHeight: 26,
    marginLeft: 3,
  },
  playLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ── Info cards ─────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoLabel: {
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  infoValue: {
    fontFamily: fonts.uiBold,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },

  // ── Facebook embed ─────────────────────────────────────────
  embedSection: {
    margin: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionAccent: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  embedCard: {
    height: 240,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
