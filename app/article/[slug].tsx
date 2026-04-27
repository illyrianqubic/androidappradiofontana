// Root-level article detail screen.
// Registered in the root Stack so navigating here from any tab does NOT
// switch tabs or flash an intermediate screen. The component is identical
// to the one used inside the news tab stack — it reads params via
// useLocalSearchParams so the [slug] dynamic segment maps automatically.
export { default } from '../(tabs)/news/[slug]';
