import { appIdentity } from '../design-tokens';

const projectId = 'ksakxvtt';
const dataset = 'production';
const apiVersion = '2024-01-01';
// C-A1: use the CDN host (apicdn.sanity.io) so requests are served from edge
// caches with full HTTP caching headers. The query-origin host (api.sanity.io)
// is uncached and rate-limited; with 70k+ concurrent users a cold-start storm
// would exceed the per-project request budget within seconds.
const sanityBaseUrl = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}`;

export const defaultCategories = [
  'Të Gjitha',
  'Kosovë',
  'Botë',
  'Sport',
  'Teknologji',
  'Showbiz',
  'Shëndetësi',
] as const;

export const defaultThumbhash = '/wAqAP8J+IiEeHeAiHh5eIeHeA==';

type PortableTextSpan = {
  _type: 'span';
  _key: string;
  text: string;
  marks?: string[];
};

export type PortableTextBlock = {
  _type: string;
  _key: string;
  style?: string;
  children?: PortableTextSpan[];
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs?: Array<{ _key: string; _type: string; href?: string }>;
  imageUrl?: string;
  caption?: string;
  alt?: string;
};

export type Post = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt: string;
  breaking: boolean;
  views?: number;
  mainImageUrl?: string;
  thumbhash?: string;
  categories: string[];
  categorySlugs?: string[];
  author?: string;
  body?: PortableTextBlock[];
};

export type Author = {
  _id: string;
  name: string;
  slug?: string;
  imageUrl?: string;
};

type LiveStream = {
  isLive: boolean;
  title: string;
  subtitle: string;
  facebookUrl?: string;
  streamUrl: string;
};

type SanityResponse<T> = {
  result: T;
};

async function sanityFetch<T>(
  query: string,
  params?: Record<string, unknown>,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  // X-6: Fastly's URL cache key is bounded (~4 KB practical cap before some
  // CDN paths fall back to origin). Long GROQ projections (especially
  // multi-section bundles) URL-encode to >2 KB and risk cache-key truncation
  // — which silently bypasses edge caching, defeating C-A1. We POST any
  // query whose URL form would exceed 1.5 KB; smaller queries stay GET so
  // browsers / proxies still benefit from URL-level caching.
  const encodedQuery = encodeURIComponent(query);
  let getUrl = `${sanityBaseUrl}?query=${encodedQuery}`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      getUrl += `&${encodeURIComponent(`$${key}`)}=${encodeURIComponent(JSON.stringify(value))}`;
    }
  }
  const usePost = getUrl.length > 1500;

  // 8s timeout via AbortController. If the caller passed its own signal we
  // honour it as well — abort if either fires.
  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      usePost ? sanityBaseUrl : getUrl,
      usePost
        ? {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, params: params ?? {} }),
            signal: controller.signal,
          }
        : {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
    );

    if (!response.ok) {
      throw new Error(`Sanity request failed: ${response.status}`);
    }

    const payload = (await response.json()) as SanityResponse<T>;
    return payload.result;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

const postProjection = `
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  "breaking": coalesce(breaking, false),
  "views": coalesce(views, 0),
  "mainImageUrl": mainImage.asset->url,
  "thumbhash": mainImage.asset->metadata.thumbhash,
  "categories": array::compact(coalesce(categories[]->title, []) + [category->title]),
  "categorySlugs": array::compact(coalesce(categories[]->slug.current, []) + [category->slug.current]),
  "author": author->name
`;

export function buildSanityImageUrl(url?: string, width = 800) {
  if (!url) {
    return undefined;
  }

  // Keep aspect ratio 16:9. Use WebP for ~30% smaller payloads on supported clients.
  const h = Math.round(width * 0.5625);
  return `${url}?w=${width}&h=${h}&auto=format&fit=crop&q=75&fm=webp`;
}

export async function fetchHeroPost(): Promise<Post | null> {
  const query = `*[_type == "post"] | order(publishedAt desc)[0] { ${postProjection} }`;
  return sanityFetch<Post | null>(query);
}

export async function fetchBreakingPosts(): Promise<Post[]> {
  const query = `*[_type == "post" && coalesce(breaking, false) == true] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit: 8 });
  return data ?? [];
}

const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  '': '',
  'te gjitha': '',
  'të gjitha': '',
  lajme: 'lajme',
  sport: 'sport',
  teknologji: 'teknologji',
  showbiz: 'showbiz',
  shendetesi: 'shendetesi',
  'shëndetësi': 'shendetesi',
  'nga bota': 'nga-bota',
  'nga-bota': 'nga-bota',
};

function resolveCategorySlug(category: string): string {
  const normalized = category.trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  if (Object.prototype.hasOwnProperty.call(CATEGORY_SLUG_ALIASES, normalized)) {
    return CATEGORY_SLUG_ALIASES[normalized] || '';
  }

  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

export async function fetchLatestPosts(
  category = '',
  search = '',
  limit = 20,
): Promise<Post[]> {
  const categorySlug = resolveCategorySlug(category);
  const categorySlugs = categorySlug ? [categorySlug] : [];

  const categoryFilter =
    categorySlugs.length > 0
      ? '&& count(array::compact(coalesce(categories[]->slug.current, []) + [category->slug.current])[@ in $categorySlugs]) > 0'
      : '';
  const searchFilter = search.trim()
    ? `&& (title match $search || excerpt match $search)`
    : '';

  const query = `*[_type == "post" ${categoryFilter} ${searchFilter}] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, {
    categorySlugs,
    search: `*${search.trim()}*`,
    limit,
  });

  return data ?? [];
}

export async function fetchLocalPosts(limit = 12): Promise<Post[]> {
  const query = `*[_type == "post" && !('nga-bota' in array::compact(coalesce(categories[]->slug.current, []) + coalesce([category->slug.current], [])))] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit });
  return data ?? [];
}

export async function fetchPopularPosts(limit = 12): Promise<Post[]> {
  const query = `*[_type == "post"] | order(coalesce(views, 0) desc, publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit });
  return data ?? [];
}

// M-C8: batched home bundle. Single Sanity GROQ projection returns all five
// home-tab payloads in one network round-trip. Reduces cold-start fan-out
// from 5 requests/device → 1, cutting Sanity origin/CDN hits at 70k users by
// ~80 % and saving 4 TLS handshakes per device.
export type HomeBundle = {
  hero: Post | null;
  breaking: Post[];
  latest: Post[];
  popular: Post[];
  local: Post[];
};

export async function fetchHomeBundle(): Promise<HomeBundle> {
  const query = `{
    "hero": *[_type == "post"] | order(publishedAt desc)[0] { ${postProjection} },
    "breaking": *[_type == "post" && coalesce(breaking, false) == true] | order(publishedAt desc)[0...8] { ${postProjection} },
    "latest": *[_type == "post"] | order(publishedAt desc)[0...18] { ${postProjection} },
    "popular": *[_type == "post"] | order(coalesce(views, 0) desc, publishedAt desc)[0...8] { ${postProjection} },
    "local": *[_type == "post" && !('nga-bota' in array::compact(coalesce(categories[]->slug.current, []) + coalesce([category->slug.current], [])))] | order(publishedAt desc)[0...12] { ${postProjection} }
  }`;
  const data = await sanityFetch<HomeBundle>(query);
  return {
    hero: data?.hero ?? null,
    breaking: data?.breaking ?? [],
    latest: data?.latest ?? [],
    popular: data?.popular ?? [],
    local: data?.local ?? [],
  };
}

export async function fetchPostBySlug(slug: string): Promise<Post | null> {
  // Project both `body` and `content` arrays and coalesce client-side.
  // The previous `select(count(coalesce(body, [])) > 0 => body, content)[]{...}`
  // returned null when projecting through a select() in some Sanity API
  // versions, causing the article body to render empty. Splitting the two
  // projections makes the fallback deterministic.
  // Project body blocks. For text blocks (`_type == "block"`) explicitly list
  // every portable-text field so the CDN response can never omit children/
  // marks/style/listItem. The `_type == "image"` branch resolves the asset
  // URL. The default `...` branch passes through any other custom block
  // type unchanged so the renderer can decide what to do with it.
  const itemProjection = `{
    _key,
    _type,
    _type == "block" => {
      _key,
      _type,
      style,
      listItem,
      level,
      markDefs,
      "children": children[]{ _key, _type, text, marks }
    },
    _type == "image" => {
      _key,
      _type,
      "imageUrl": asset->url,
      "caption": coalesce(caption, alt, ""),
      "alt": alt
    },
    !(_type in ["block", "image"]) => { ... }
  }`;
  const query = `*[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    "breaking": coalesce(breaking, false),
    "views": coalesce(views, 0),
    "mainImageUrl": mainImage.asset->url,
    "thumbhash": mainImage.asset->metadata.thumbhash,
    "categories": array::compact(coalesce(categories[]->title, []) + [category->title]),
    "categorySlugs": array::compact(coalesce(categories[]->slug.current, []) + [category->slug.current]),
    "author": author->name,
    "body": body[] ${itemProjection},
    "content": content[] ${itemProjection}
  }`;
  const raw = await sanityFetch<(Post & { content?: Post['body'] }) | null>(query, { slug });
  if (!raw) return null;
  // Prefer `body`; fall back to `content` if body is empty/missing.
  const body = (raw.body && raw.body.length > 0) ? raw.body : (raw.content ?? []);
  // Debug: confirm we are receiving complete blocks. Logs once per fetch.
  // eslint-disable-next-line no-console
  console.log(
    `[fetchPostBySlug] slug=${slug} body.len=${raw.body?.length ?? 0} content.len=${raw.content?.length ?? 0} chosen.len=${body.length} types=${body.map((b) => b._type).join(',')}`,
  );
  return { ...raw, body } as Post;
}

export async function fetchRelatedPosts(slug: string, categories: string[] = []): Promise<Post[]> {
  const category = categories[0] ?? '';
  const query = `*[_type == "post" && slug.current != $slug && ($category in array::compact(coalesce(categories[]->title, []) + [category->title]) || $category == "")] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { slug, category, limit: 6 });
  return data ?? [];
}

export async function fetchAuthors(): Promise<Author[]> {
  const query = `*[_type == "author"] | order(name asc) {
    _id,
    "name": name,
    "slug": slug.current,
    "imageUrl": image.asset->url
  }`;

  try {
    const authors = await sanityFetch<Author[]>(query);
    return (authors ?? []).filter((item) => item.name?.trim());
  } catch {
    // Author documents unavailable — surface empty list rather than running a
    // full-table post scan that does not scale at concurrent-user volume.
    return [];
  }
}

export async function fetchLiveStream(): Promise<LiveStream> {
  const query = `*[_type == "liveStream"][0] {
    "isLive": coalesce(isLive, true),
    "title": coalesce(title, "Radio Fontana 98.8 FM"),
    "subtitle": coalesce(subtitle, "Istog, Kosovë"),
    "facebookUrl": facebookUrl,
    "streamUrl": coalesce(streamUrl, "${appIdentity.streamUrl}")
  }`;

  try {
    const data = await sanityFetch<LiveStream | null>(query);
    if (!data) {
      throw new Error('No liveStream document found');
    }
    return data;
  } catch {
    return {
      isLive: true,
      title: appIdentity.stationName,
      subtitle: appIdentity.location,
      facebookUrl: '',
      streamUrl: appIdentity.streamUrl,
    };
  }
}
