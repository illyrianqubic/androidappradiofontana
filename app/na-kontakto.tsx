import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { appIdentity, colors, fonts } from '../design-tokens';

function TikTokIcon({ size = 20, color = '#010101' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </Svg>
  );
}

const openURL = (url: string) =>
  Linking.canOpenURL(url)
    .then((ok) => { if (ok) Linking.openURL(url); })
    .catch(() => undefined);

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topBarH = insets.top + 58;
  const bottomInsetOffset = insets.bottom + 196;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, [router]);

  return (
    <View style={S.screen}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <View style={[S.topBar, { paddingTop: insets.top }]}>
        <Pressable onPress={goBack} style={S.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Image source={appIdentity.logo} contentFit="cover" style={S.topBarLogo} />
        <Text style={S.topBarTitle}>Na Kontakto</Text>
      </View>

      <ScrollView
        contentContainerStyle={[S.scroll, { paddingTop: topBarH + 20, paddingBottom: bottomInsetOffset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <View style={S.hero}>
          <View style={S.heroBadge}>
            <View style={S.heroBadgeDot} />
            <Text style={S.heroBadgeText}>RTV FONTANA</Text>
          </View>
          <Text style={S.heroTitle}>Na Kontakto</Text>
          <Text style={S.heroSub}>
            Jemi gjithmonë të gatshëm t'ju ndihmojmë. Kontaktoni redaksinë tonë
            për lajme, reklama ose bashkëpunime.
          </Text>
        </View>

        {/* ── Contact info ─────────────────────────────────────────────── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Informacioni i Kontaktit</Text>

          {/* Phone 1 */}
          <Pressable
            style={({ pressed }) => [S.card, pressed && S.cardPressed]}
            onPress={() => openURL('tel:+38344150027')}
          >
            <View style={[S.cardIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="call-outline" size={20} color="#4338CA" />
            </View>
            <View style={S.cardBody}>
              <Text style={S.cardLabel}>Telefon 1</Text>
              <Text style={S.cardValue}>+383 44 150 027</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </Pressable>

          {/* Phone 2 */}
          <Pressable
            style={({ pressed }) => [S.card, pressed && S.cardPressed]}
            onPress={() => openURL('tel:+38344141294')}
          >
            <View style={[S.cardIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="call-outline" size={20} color="#4338CA" />
            </View>
            <View style={S.cardBody}>
              <Text style={S.cardLabel}>Telefon 2</Text>
              <Text style={S.cardValue}>+383 44 141 294</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </Pressable>

          {/* Email */}
          <Pressable
            style={({ pressed }) => [S.card, pressed && S.cardPressed]}
            onPress={() => openURL('mailto:rtvfontana@gmail.com')}
          >
            <View style={[S.cardIcon, { backgroundColor: '#FEF9C3' }]}>
              <Ionicons name="mail-outline" size={20} color="#854D0E" />
            </View>
            <View style={S.cardBody}>
              <Text style={S.cardLabel}>Email</Text>
              <Text style={S.cardValue}>rtvfontana@gmail.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </Pressable>

          {/* Location */}
          <Pressable
            style={({ pressed }) => [S.card, pressed && S.cardPressed]}
            onPress={() => openURL('https://maps.google.com/?q=Istog,Kosovo')}
          >
            <View style={[S.cardIcon, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="location-outline" size={20} color="#15803D" />
            </View>
            <View style={S.cardBody}>
              <Text style={S.cardLabel}>Vendndodhja</Text>
              <Text style={S.cardValue}>Istog, Kosovë</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </Pressable>

          {/* Hours */}
          <View style={S.card}>
            <View style={[S.cardIcon, { backgroundColor: '#FFF7ED' }]}>
              <Ionicons name="time-outline" size={20} color="#C2410C" />
            </View>
            <View style={S.cardBody}>
              <Text style={S.cardLabel}>Orari i Punës</Text>
              <Text style={S.cardValue}>08:00 – 20:00</Text>
            </View>
            <View style={S.openBadge}>
              <Text style={S.openBadgeText}>HAPUR</Text>
            </View>
          </View>
        </View>

        {/* ── Social media ─────────────────────────────────────────────── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Na Ndiqni</Text>

          <View style={S.socialGrid}>
            <Pressable
              style={({ pressed }) => [S.socialBtn, { backgroundColor: '#1877F2' }, pressed && S.socialBtnPressed]}
              onPress={() => openURL('https://www.facebook.com/rtvfontanalive')}
            >
              <MaterialCommunityIcons name="facebook" size={22} color="#FFFFFF" />
              <Text style={S.socialLabel}>Facebook</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [S.socialBtn, { backgroundColor: '#E4405F' }, pressed && S.socialBtnPressed]}
              onPress={() => openURL('https://www.instagram.com/rtvfontana/')}
            >
              <MaterialCommunityIcons name="instagram" size={22} color="#FFFFFF" />
              <Text style={S.socialLabel}>Instagram</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [S.socialBtn, { backgroundColor: '#FF0000' }, pressed && S.socialBtnPressed]}
              onPress={() => openURL('https://www.youtube.com/@RTVFontana')}
            >
              <MaterialCommunityIcons name="youtube" size={22} color="#FFFFFF" />
              <Text style={S.socialLabel}>YouTube</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [S.socialBtn, { backgroundColor: '#010101' }, pressed && S.socialBtnPressed]}
              onPress={() => openURL('https://www.tiktok.com/@rtvfontanalive')}
            >
              <TikTokIcon size={22} color="#FFFFFF" />
              <Text style={S.socialLabel}>TikTok</Text>
            </Pressable>
          </View>
        </View>

        <Text style={S.copyright}>© 2026 RTV Fontana · Të gjitha të drejtat e rezervuara</Text>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },

  // ── Top bar ─────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    height: undefined,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  topBarLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  topBarTitle: {
    flex: 1,
    fontFamily: fonts.uiBold,
    fontSize: 17,
    color: colors.text,
    letterSpacing: -0.2,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: 16,
  },

  // ── Hero ────────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  heroBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  heroBadgeText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 21,
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },

  // ── Cards ───────────────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: colors.redTint,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardLabel: {
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 3,
  },
  cardValue: {
    fontFamily: fonts.uiBold,
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.1,
  },
  openBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  openBadgeText: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    color: '#065F46',
    letterSpacing: 0.5,
  },

  // ── Social grid ─────────────────────────────────────────────────────────────
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    minWidth: '46%',
    flex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  socialBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  socialLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  copyright: {
    textAlign: 'center',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
    marginBottom: 8,
  },
});
