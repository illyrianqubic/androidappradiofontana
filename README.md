# Radio Fontana — Android App

Mobile app for **Radio Fontana 98.8 FM**, a local radio station based in Istog, Kosovo. Built with Expo/React Native. Streams live audio, displays news from a Sanity CMS backend, and shows the weekly broadcast schedule.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Expo (React Native) | ~54.0.33 |
| React | React | 19.1.0 |
| React Native | React Native | 0.81.5 |
| Language | TypeScript | ~5.9.2 |
| Navigation | Expo Router (file-based) | ~6.0.23 |
| Audio | expo-audio | ~1.1.1 |
| Animations | react-native-reanimated | ~4.1.1 |
| Gestures | react-native-gesture-handler | ~2.28.0 |
| Lists | @shopify/flash-list | 2.0.2 |
| Data Fetching | @tanstack/react-query | ^5.90.5 |
| Query Persistence | @tanstack/react-query-persist-client | ^5.90.5 |
| Storage | react-native-mmkv | ^3.2.0 |
| CMS | Sanity.io (project: ksakxvtt, dataset: production) | REST API |
| Images | expo-image | ~3.0.10 |
| Fonts | Inter + Merriweather (via @expo-google-fonts) | ^0.4.1 |
| Icons | @expo/vector-icons (Ionicons + MaterialCommunityIcons) | ^15.1.1 |
| Gradients | expo-linear-gradient | ~15.0.7 |
| Notifications | expo-notifications | ~0.32.13 |
| Web Embeds | react-native-webview | 13.15.0 |
| Blur | expo-blur | ~15.0.7 |
| Haptics | expo-haptics | ~15.0.7 |
| Safe Area | react-native-safe-area-context | ~5.6.0 |
| Screen | react-native-screens | ~4.16.0 |
| Keep Awake | expo-keep-awake | ~15.0.8 |
| Skia | @shopify/react-native-skia | 2.2.12 |
| Worklets | react-native-worklets | 0.5.1 |
| Web Support | react-native-web + @expo/metro-runtime | ^0.21.0 / ~6.1.2 |

**Architecture:** React Native New Architecture enabled (`newArchEnabled: true`).

---

## Project Structure

```
androidappradiofontana/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root layout — providers, fonts, splash, MiniPlayer, HamburgerDrawer
│   ├── _layout.web.tsx         # Web-specific root layout (mirrors native)
│   ├── player.tsx              # Full-screen audio player modal (slide_from_bottom)
│   ├── rreth-nesh.tsx          # "About Us" static info screen
│   ├── na-kontakto.tsx         # Contact screen with phone/email/social links
│   ├── programi.tsx            # Full weekly broadcast schedule screen
│   ├── article/                # (empty — article routing handled in tabs/news)
│   └── (tabs)/                 # Bottom tab group
│       ├── _layout.tsx         # Tab bar config — 3 tabs (home, live, news)
│       ├── index.tsx           # Home screen — hero post, breaking ticker, popular rail, latest grid
│       ├── index.web.tsx       # Web home screen variant
│       ├── live.tsx            # Live radio screen — player, FB live embed, today's schedule
│       ├── library.tsx         # Library tab (href: null — hidden from tab bar)
│       └── news/
│           ├── _layout.tsx     # News stack layout
│           ├── index.tsx       # News feed — category tabs, search, FlashList
│           └── [slug].tsx      # Article detail — hero image, body blocks, related posts
│
├── components/
│   ├── AppBootSkeleton.tsx     # Skeleton loading screen shown during initial font/data load
│   ├── BreakingBanner.tsx      # Auto-dismissing banner for breaking news (slides in, 8s timer)
│   ├── EqualizerBars.tsx       # Animated audio equalizer bars (Animated API, full/mini variants)
│   ├── FullPlayer.tsx          # Expanded audio player UI with schedule, metadata, controls
│   ├── HamburgerButton.tsx     # Animated 3-line → X icon using Reanimated interpolateColor
│   ├── HamburgerDrawer.tsx     # Right-side drawer — navigation, categories, social, contact
│   ├── LaunchSplash.tsx        # Custom splash screen with logo and animated progress bar
│   ├── LiveBadge.tsx           # "LIVE" badge component (solid/outline variants)
│   ├── LiveDot.tsx             # Animated pulsing red dot for live indicator
│   ├── MiniPlayer.tsx          # Floating mini audio player — swipe up to expand, hides with drawer
│   ├── NewsCard.tsx            # News article card (image, title, excerpt, author, timestamp)
│   ├── RelativeTime.tsx        # Formats timestamps as relative ("2 orë më parë")
│   ├── SkeletonCard.tsx        # Shimmer skeleton placeholder for loading states
│   └── StickyTopBar.tsx        # Absolute-positioned header bar used across screens
│
├── context/
│   └── DrawerContext.tsx       # DrawerProvider + useDrawer() hook (open/close/toggle state)
│
├── services/
│   ├── api.ts                  # All Sanity CMS queries — posts, hero, breaking, related, categories
│   ├── audio.ts                # AudioProvider + useAudio() hook — expo-audio, reconnect logic
│   ├── audio.web.ts            # Web audio implementation (mirrors native API)
│   ├── storage.ts              # MMKV-backed persistent storage — bookmarks, history, query cache
│   └── storage.web.ts          # Web storage (localStorage with in-memory fallback)
│
├── constants/
│   └── schedule.ts             # Full weekly broadcast schedule data (Mon–Sun, typed)
│
├── assets/
│   ├── logoandroid.jpg         # Main station logo (used for app icon, splash, adaptive icon)
│   ├── images/
│   │   └── logoandroid.png     # PNG copy of logo (generated for icon pipeline)
│   ├── adaptive-icon.png       # Legacy adaptive icon (superseded by logoandroid.jpg)
│   ├── icon.png                # Legacy app icon (used for notification icon)
│   ├── splash-icon.png         # Legacy splash image
│   └── favicon.png             # Web favicon
│
├── lib/                        # Empty — reserved for future shared utilities
│
├── design-tokens.ts            # Central design system — colors, spacing, radius, fonts, elevation
├── app.json                    # Expo config — icons, splash, permissions, plugins
├── babel.config.js             # Babel with expo preset + reanimated plugin
├── tsconfig.json               # TypeScript strict mode, path alias @/*
├── index.ts                    # Entry — registers gesture handler + expo-router entry
└── package.json                # v2.0.0
```

---

## Key Architecture Decisions

### Data Flow
- **Sanity CMS** (project `ksakxvtt`) serves all news content via GROQ queries over REST
- **TanStack Query** handles all remote data — 5-minute stale time, 24-hour garbage collection, offline-first mode
- Query cache is persisted to MMKV (native) / localStorage (web) via `@tanstack/react-query-persist-client`
- Stream URL: `https://live.radiostreaming.al:8010/stream.mp3`

### Navigation
- File-based routing with **Expo Router v6**
- 3 visible tabs: Kryefaqja (home), Drejtpërdrejt (live), Lajme (news)
- Full-screen player opens as a modal (`presentation: 'modal'`)
- Right-side hamburger drawer managed by `DrawerContext`

### Audio
- `expo-audio` with automatic reconnect logic (backoff delays: 1s, 2s, 4s, 8s, 16s, 30s)
- `AudioProvider` wraps the entire app and exposes `useAudio()` hook
- Web variant (`audio.web.ts`) mirrors the same API surface

### Storage
- MMKV with encryption key `radio-fontana-988fm` on native
- Graceful fallback to in-memory Map when MMKV bindings unavailable (Expo Go)
- Web uses `localStorage` with in-memory fallback

### Design System
All design constants live in `design-tokens.ts`:
- **Colors:** primary `#dc2626` (red), surface `#FFFFFF`, text `#111827`, muted `#6B7280`
- **Fonts:** Inter (UI) + Merriweather (article body)
- **Spacing:** xs=6, sm=10, md=14, lg=18, xl=24, xxl=32
- **Radius:** card=14, button=11, pill=9999

---

## Running Locally

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- For Android: Android Studio + emulator or physical device with [Expo Go](https://expo.dev/go) or dev client

### Install dependencies
```bash
cd androidappradiofontana
npm install
```

### Start dev server
```bash
# Expo Go (fastest — no native build needed)
npm start             # or: npx expo start --go --lan

# Custom dev client (required for MMKV, expo-audio native features)
npm run start:dev-client

# Web
npm run web
```

### TypeScript check
```bash
npm run typecheck
```

### Build for Android
```bash
npm run android       # npx expo run:android
```

---

## Deployment

### EAS Build (recommended)
```bash
npm install -g eas-cli
eas login
eas build --platform android
```

### Web (static export)
```bash
npx expo export --platform web
# Output in dist/
```

The web bundle uses Metro static output (`"output": "static"` in `app.json`).

### OTA Updates
The project uses Expo's runtime version policy (`"policy": "appVersion"`). OTA updates are delivered when the version matches. Cache timeout is set to `0` (immediate update check).

---

## Issues & Warnings Found

### 🔴 Active Issues
1. **`na-kontakto.tsx` has placeholder contact info** — phone `+383 49 000 000`, email `info@rtvfontana.com`, and social URLs (`https://facebook.com`, `https://instagram.com`) are generic/incorrect placeholders. The `HamburgerDrawer` uses the correct number (`+383 44 150 027`) and email (`rtvfontana@gmail.com`). These should be unified.

2. **`notification.icon` uses legacy `./assets/icon.png`** — The `app.json` sets the main icon to `./assets/logoandroid.jpg` but the notification icon still points to the old `./assets/icon.png`. Should be updated for visual consistency.

3. **`app/article/` folder is empty** — The directory exists but contains no files. Article routing is handled inside `app/(tabs)/news/[slug].tsx`. The empty folder can be removed.

4. **`lib/` directory is empty** — Reserved but unused. Can be removed or used for shared utilities.

5. **`fetchAuthors` imported in `news/index.tsx` but `fetchAuthors` does not exist in `api.ts`** — This will cause a runtime error on the news screen. Either the function needs to be added to `api.ts` or the import should be removed.

### 🟡 Warnings
6. **`@shopify/react-native-skia` (2.2.12) is installed but not used** in any component. This is a heavy native dependency (~15 MB) that adds build time and app size without benefit. Should be removed.

7. **`react-native-worklets` (0.5.1)** — Installed as a dependency of Skia. If Skia is removed, this can be removed too.

8. **`@react-navigation/bottom-tabs` and `@react-navigation/native`** — Installed but navigation is handled entirely by Expo Router. These are redundant dependencies.

9. **`expo-constants` (18.0.13)** — Installed but not imported anywhere in the codebase.

10. **`expo-blur`** — Installed but not actively used in any component.

11. **`expo-linking`** — Installed as a package but `Linking` is imported directly from React Native in `na-kontakto.tsx` and from `expo-linking` in `[slug].tsx`. Inconsistent usage.

12. **`Merriweather_700Bold` is loaded but only `articleBold` font alias is defined** — The font token `fonts.articleBold` is never actually applied in the article renderer (`[slug].tsx`); all body text uses `articleRegular`.

13. **Hard-coded stream URL duplication** — `STREAM_URL` is defined in both `services/audio.ts` (as a local const) and `design-tokens.ts` (`appIdentity.streamUrl`). The audio service does not use the token — both should reference the same source.

14. **`as never` type casts on router.push calls** — Several screens use `router.push(path as never)` to bypass Expo Router typed routes. These work but suppress TypeScript's route validation. Regenerating `.expo/types` would allow removing them.

15. **18 moderate npm audit vulnerabilities** — Run `npm audit` to review. Most are likely in dev/transitive dependencies.

---

## Dependencies Summary

### Used & Required
All `expo-*` packages, `react`, `react-native`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-mmkv`, `react-native-webview`, `@shopify/flash-list`, `@tanstack/react-query`, `@expo-google-fonts/*`, `@expo/vector-icons`

### Potentially Removable
| Package | Reason |
|---|---|
| `@shopify/react-native-skia` | Installed but not used anywhere |
| `react-native-worklets` | Only needed by Skia |
| `@react-navigation/bottom-tabs` | Redundant — Expo Router handles tabs |
| `@react-navigation/native` | Redundant — Expo Router handles navigation |
| `expo-constants` | Not imported in any source file |
| `expo-blur` | Not used in any component |

---

## Environment

No `.env` file is used. The Sanity project ID (`ksakxvtt`), dataset, and API version are hard-coded in `services/api.ts`. For production hardening, these should be moved to environment variables.

---

## App Configuration Summary (`app.json`)

| Field | Value |
|---|---|
| Name | Radio Fontana |
| Package | `com.radiofontana.app` |
| Version | 2.0.0 |
| Bundle scheme | `radiofontana://` |
| Orientation | Portrait only |
| Icon | `./assets/logoandroid.jpg` |
| Adaptive icon | `./assets/logoandroid.jpg` / bg `#ffffff` |
| Splash | `./assets/logoandroid.jpg` / contain / bg `#ffffff` |
| New Architecture | Enabled |
| Edge-to-edge | Enabled (Android) |
| Predictive back | Disabled (Android) |
| Plugins | expo-router, expo-dev-client, expo-font, expo-notifications, expo-audio |
