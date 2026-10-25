import type {
  BingImageEntry,
  FetchImpl,
  HPImageArchiveResponse,
  ImageResolution,
  Market,
  StoredImageMetadata,
} from './bing.models.js';

export async function fetchBingImages(fetchImpl: FetchImpl, market: string, signal?: AbortSignal): Promise<BingImageEntry[]> {
  const url = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=${market}`;
  const response = await fetchImpl(url, { signal });

  if (!response.ok) {
    throw new Error(`HPImageArchive request failed for market ${market}: HTTP ${response.status}`);
  }

  const body = (await response.json()) as HPImageArchiveResponse;
  return body.images;
}

// de-CH is not a documented Bing market, so it falls back to de-DE if it ever comes back empty.
const FALLBACK_MARKETS: Partial<Record<Market, Market>> = {
  'de-CH': 'de-DE',
};

export async function fetchBingImagesWithFallback(
  fetchImpl: FetchImpl,
  market: Market,
  signal?: AbortSignal,
): Promise<BingImageEntry[]> {
  const primary = await fetchBingImages(fetchImpl, market, signal);
  const fallback = FALLBACK_MARKETS[market];
  if (primary.length > 0 || !fallback) {
    return primary;
  }

  return fetchBingImages(fetchImpl, fallback, signal);
}

export function buildImageUrl(entry: BingImageEntry, resolution: ImageResolution): string {
  return `https://www.bing.com${entry.urlbase}_${resolution}.jpg`;
}

const COPYRIGHT_ATTRIBUTION_PATTERN = /\s*\(([^()]*)\)\s*$/;

export async function downloadImage(fetchImpl: FetchImpl, url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetchImpl(url, { signal });

  if (!response.ok) {
    throw new Error(`Image download failed for ${url}: HTTP ${response.status}`);
  }

  return response.arrayBuffer();
}

export function toStoredMetadata(entry: BingImageEntry): StoredImageMetadata {
  const attributionMatch = entry.copyright.match(COPYRIGHT_ATTRIBUTION_PATTERN);
  const description = attributionMatch ? entry.copyright.slice(0, attributionMatch.index).trim() : entry.copyright;
  const copyright = attributionMatch ? attributionMatch[1].trim() : entry.copyright;

  return {
    date: `${entry.startdate.slice(0, 4)}-${entry.startdate.slice(4, 6)}-${entry.startdate.slice(6, 8)}`,
    title: entry.title,
    description,
    copyright,
    copyrightlink: entry.copyrightlink,
  };
}
