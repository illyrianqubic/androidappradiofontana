// M-C3: bounded image prefetch queue. Without a cap, rapid card taps (or a
// future "prefetch visible posts" pass) can fire 10+ concurrent CDN requests
// that compete with the on-screen image bind for the same socket pool. Cap
// at 3 in-flight; further requests queue and drain as slots free up. Newest
// requests jump the queue (LIFO) because the most recent tap is the most
// likely navigation target.
import { Image } from 'expo-image';

const MAX_CONCURRENT = 3;
let inFlight = 0;
const stack: string[] = [];
const seen = new Set<string>();

function drain(): void {
  while (inFlight < MAX_CONCURRENT && stack.length > 0) {
    const url = stack.pop();
    if (!url) continue;
    inFlight += 1;
    Image.prefetch(url)
      .catch(() => undefined)
      .finally(() => {
        inFlight -= 1;
        seen.delete(url);
        drain();
      });
  }
}

export function queueImagePrefetch(url: string | null | undefined): void {
  if (!url || seen.has(url)) return;
  seen.add(url);
  stack.push(url);
  drain();
}
