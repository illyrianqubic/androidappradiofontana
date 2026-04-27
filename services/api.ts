import { appIdentity } from '../design-tokens';

const projectId = 'ksakxvtt';
const dataset = 'production';
const apiVersion = '2024-01-01';
const sanityBaseUrl = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`;

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
  featured?: boolean;
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
): Promise<T> {
  const encodedQuery = encodeURIComponent(query);
  let url = `${sanityBaseUrl}?query=${encodedQuery}`;

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url += `&${encodeURIComponent(`$${key}`)}=${encodeURIComponent(JSON.stringify(value))}`;
    }
  }

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });

  if (!response.ok) {
    throw new Error(`Sanity request failed: ${response.status}`);
  }

  const payload = (await response.json()) as SanityResponse<T>;
  return payload.result;
}

const postProjection = `
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  "breaking": coalesce(breaking, false),
  "featured": coalesce(featured, false),
  "views": coalesce(views, 0),
  "mainImageUrl": mainImage.asset->url,
  "thumbhash": mainImage.asset->metadata.thumbhash,
  "categories": array::compact(coalesce(categories[]->title, []) + [category->title]),
  "categorySlugs": array::compact(coalesce(categories[]->slug.current, []) + [category->slug.current]),
  "author": author->name,
  "body": select(count(coalesce(body, [])) > 0 => body, content)
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
  const query = `*[_type == "post" && coalesce(breaking, false) == true] | order(publishedAt desc)[0...8] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query);
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
    ? `&& (title match $search || excerpt match $search || pt::text(select(count(coalesce(body, [])) > 0 => body, content)) match $search)`
    : '';

  const query = `*[_type == "post" ${categoryFilter} ${searchFilter}] | order(publishedAt desc)[0...${limit}] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, {
    categorySlugs,
    search: `*${search.trim()}*`,
  });

  return data ?? [];
}

export async function fetchFeaturedPosts(limit = 10): Promise<Post[]> {
  const query = `*[_type == "post" && coalesce(featured, false) == true] | order(publishedAt desc)[0...${limit}] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query);
  return data ?? [];
}

export async function fetchPopularPosts(limit = 12): Promise<Post[]> {
  const query = `*[_type == "post"] | order(coalesce(views, 0) desc, publishedAt desc)[0...${limit}] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query);
  return data ?? [];
}

export async function fetchPostBySlug(slug: string): Promise<Post | null> {
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
    "body": select(count(coalesce(body, [])) > 0 => body, content)[]{
      ...,
      _type == "image" => {
        ...,
        "imageUrl": asset->url,
        "caption": coalesce(caption, alt, ""),
        "alt": alt
      }
    }
  }`;
  return sanityFetch<Post | null>(query, { slug });
}

export async function fetchRelatedPosts(slug: string, categories: string[] = []): Promise<Post[]> {
  const category = categories[0] ?? '';
  const query = `*[_type == "post" && slug.current != $slug && ($category in array::compact(coalesce(categories[]->title, []) + [category->title]) || $category == "")] | order(publishedAt desc)[0...6] { ${postProjection} }`;
  const data = await sanityFetch<Post[]>(query, { slug, category });
  return data ?? [];
}

export async function fetchCategories(): Promise<string[]> {
  const query = `*[_type == "category"] | order(orderRank asc, title asc) { "title": title }`;

  try {
    const categories = await sanityFetch<Array<{ title: string }>>(query);
    const titles = categories.map((item) => item.title).filter(Boolean);
    return ['Të Gjitha', ...titles];
  } catch {
    return [...defaultCategories];
  }
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
    const fallbackQuery = `array::unique(*[_type == "post" && defined(author->name)].author->name)`;
    const names = await sanityFetch<string[]>(fallbackQuery);
    return (names ?? []).map((name, index) => ({
      _id: `fallback-author-${index}`,
      name,
    }));
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
