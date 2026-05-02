# Radio Fontana — Android App

Mobile app for **Radio Fontana 98.8 FM**, a local radio station based in Istog, Kosovo. Built with Expo/React Native. Streams live audio, displays news from a Sanity CMS backend, and shows the weekly broadcast schedule.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Expo (React Native) | ~54.0.34 |
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
| Haptics | expo-haptics | ~15.0.7 |
| Safe Area | react-native-safe-area-context | ~5.6.0 |
| Screen | react-native-screens | ~4.16.0 |
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
│   ├── logoandroid.jpg         # Main station logo used by splash and in-app branding
│   ├── images/
│   │   ├── logoandroid.png     # PNG copy of logo
│   │   └── lockscreen-artwork.png # Square high-res media notification artwork
│   ├── adaptive-icon-foreground.png # Android adaptive icon foreground
│   ├── adaptive-icon.png       # Legacy adaptive icon
│   ├── icon.png                # App launcher icon
│   ├── splash-icon.png         # Legacy splash image
│   └── favicon.png             # Web favicon
│
├── lib/                        # Shared utilities such as bounded image prefetching
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
# Custom dev client (required for RNTP audio, MMKV, and native features)
npm start             # or: npm run start:dev-client

# Expo Go (UI-only; native radio playback is unavailable here)
npm run start:go

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
1. **Stream URL source of truth** — Native and web audio services now read `appIdentity.streamUrl`; future stream callers should keep using that token instead of hard-coding the URL.

2. **iOS audio behavior still needs physical validation** — iOS background mode is configured, but lock-screen / interruption behavior must be tested on a real iPhone before App Store work.

### 🟡 Warnings
3. **`@react-navigation/bottom-tabs` and `@react-navigation/native`** — Direct dependencies may be redundant because Expo Router handles navigation, but they should only be removed after an Expo Router dependency check.

4. **`expo-constants` (18.0.13)** — Direct dependency is not imported in source files, but it is also used transitively by Expo packages, so removal is low priority.

5. **`expo-linking`** — Installed as a package but `Linking` is imported directly from React Native in `na-kontakto.tsx` and from `expo-linking` in `[slug].tsx`. Inconsistent usage.

6. **Article font loading is lazy** — Merriweather loads on the article screen instead of at root for startup performance. Validate first article open on low-end Android so the fallback-to-final font swap feels acceptable.

7. **`as never` type casts on router.push calls** — Several screens use `router.push(path as never)` to bypass Expo Router typed routes. These work but suppress TypeScript's route validation. Regenerating `.expo/types` would allow removing them.

8. **17 moderate npm audit vulnerabilities** — Run `npm audit` to review. Most are likely in dev/transitive dependencies.

---

## Dependencies Summary

### Used & Required
All current `expo-*` packages in `package.json`, `react`, `react-native`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-mmkv`, `@shopify/flash-list`, `@tanstack/react-query`, `@expo-google-fonts/*`, `@expo/vector-icons`

### Potentially Removable
| Package | Reason |
|---|---|
| `@react-navigation/bottom-tabs` | Redundant — Expo Router handles tabs |
| `@react-navigation/native` | Redundant — Expo Router handles navigation |
| `expo-constants` | Not imported in any source file |

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
| Icon | `./assets/icon.png` |
| Adaptive icon | `./assets/adaptive-icon-foreground.png` / bg `#ffffff` |
| Splash | `./assets/logoandroid.jpg` / contain / bg `#ffffff` |
| New Architecture | Enabled |
| Edge-to-edge | Enabled (Android) |
| Predictive back | Disabled (Android) |
| Plugins | expo-router, expo-dev-client, expo-font |
