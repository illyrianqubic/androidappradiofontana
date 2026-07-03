import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

export default function NewsSlugRedirect() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const resolved = Array.isArray(slug) ? slug[0] : slug;
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    if (!resolved) {
      router.replace('/(tabs)/news');
    } else {
      router.replace(`/article/${resolved}`);
    }
  }, [resolved, router]);

  return null;
}
