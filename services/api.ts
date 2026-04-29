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
  isFeatured: boolean;
  views?: number;
  mainImageUrl?: string;
  thumbhash?: string;
  categories: string[];
  categorySlugs?: string[];
  author?: string;
  body?: PortableTextBlock[];
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
  "isFeatured": coalesce(isFeatured, false),
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

  // Keep aspect ratio 16:9. AUDIT FIX P4.17 + P8.29: drop the conflicting
  // `fm=webp` so `auto=format` can serve AVIF on supporting clients (~30 %
  // smaller than WebP). Sanity respects the Accept header to negotiate.
  const h = Math.round(width * 0.5625);
  return `${url}?w=${width}&h=${h}&auto=format&fit=crop&q=75`;
}

export async function fetchHeroPost(signal?: AbortSignal): Promise<Post | null> {
  const query = `*[_type == "post" && (coalesce(isFeatured, false) == true || coalesce(breaking, false) == true)] | order(publishedAt desc)[0] { ${postProjection} }`;
  return sanityFetch<Post | null>(query, undefined, { signal });
}

export async function fetchBreakingPosts(signal?: AbortSignal): Promise<Post[]> {
  const query = `*[_type == "post" && coalesce(breaking, false) == true] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit: 8 }, { signal });
  return data ?? [];
}

const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  '': '',
  'te gjitha': '',
  'të gjitha': '',
  lajme: 'lajme',
  politike: 'politike',
  'politikë': 'politike',
  sport: 'sport',
  teknologji: 'teknologji',
  showbiz: 'showbiz',
  shendetesi: 'shendetesi',
  'shëndetësi': 'shendetesi',
  biznes: 'biznes',
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
  signal?: AbortSignal,
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
  }, { signal });

  return data ?? [];
}

export async function fetchLocalPosts(limit = 12, signal?: AbortSignal): Promise<Post[]> {
  const query = `*[_type == "post" && !('nga-bota' in array::compact(coalesce(categories[]->slug.current, []) + coalesce([category->slug.current], [])))] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit }, { signal });
  return data ?? [];
}

// fetchPopularPosts is kept (web home page still uses it) but native does not.
export async function fetchPopularPosts(limit = 12, signal?: AbortSignal): Promise<Post[]> {
  const query = `*[_type == "post"] | order(coalesce(views, 0) desc, publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { limit }, { signal });
  return data ?? [];
}

export async function fetchPostBySlug(slug: string, signal?: AbortSignal): Promise<Post | null> {
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
  const raw = await sanityFetch<(Post & { content?: Post['body'] }) | null>(query, { slug }, { signal });
  if (!raw) return null;
  // Prefer `body`; fall back to `content` if body is empty/missing.
  const body = (raw.body && raw.body.length > 0) ? raw.body : (raw.content ?? []);
  return { ...raw, body } as Post;
}

export async function fetchRelatedPosts(slug: string, categories: string[] = [], signal?: AbortSignal): Promise<Post[]> {
  const category = categories[0] ?? '';
  const query = `*[_type == "post" && slug.current != $slug && ($category in array::compact(coalesce(categories[]->title, []) + [category->title]) || $category == "")] | order(publishedAt desc)[0...$limit] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { slug, category, limit: 6 }, { signal });
  return data ?? [];
}


