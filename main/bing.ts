import type {
  BingImageEntry,
  DisplaySize,
  FetchImpl,
  HPImageArchiveResponse,
  ImageResolution,
  StoredImageMetadata,
} from './bing.models.js';

const KNOWN_RESOLUTIONS: { resolution: ImageResolution; width: number; height: number }[] = [
  { resolution: '1024x768', width: 1024, height: 768 },
  { resolution: '1280x720', width: 1280, height: 720 },
  { resolution: '1366x768', width: 1366, height: 768 },
  { resolution: '1920x1080', width: 1920, height: 1080 },
  { resolution: '1920x1200', width: 1920, height: 1200 },
];

const UHD_THRESHOLD = { width: 3840, height: 2160 };

export async function fetchBingImages(fetchImpl: FetchImpl, market: string): Promise<BingImageEntry[]> {
  const url = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=${market}`;
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`HPImageArchive request failed for market ${market}: HTTP ${response.status}`);
  }

  const body = (await response.json()) as HPImageArchiveResponse;
  return body.images;
}

export async function fetchBingImagesWithFallback(fetchImpl: FetchImpl): Promise<BingImageEntry[]> {
  const primary = await fetchBingImages(fetchImpl, 'de-CH');
  if (primary.length > 0) {
    return primary;
  }

  return fetchBingImages(fetchImpl, 'de-DE');
}

export function resolveImageResolution(display: DisplaySize): ImageResolution {
  if (display.width >= UHD_THRESHOLD.width && display.height >= UHD_THRESHOLD.height) {
    return 'UHD';
  }

  const fitting = KNOWN_RESOLUTIONS.filter(
    (candidate) => candidate.width <= display.width && candidate.height <= display.height,
  );

  if (fitting.length === 0) {
    return KNOWN_RESOLUTIONS[0].resolution;
  }

  return fitting.reduce((best, candidate) => (candidate.width > best.width ? candidate : best)).resolution;
}

export function buildImageUrl(entry: BingImageEntry, resolution: ImageResolution): string {
  return `https://www.bing.com${entry.urlbase}_${resolution}.jpg`;
}

const COPYRIGHT_ATTRIBUTION_PATTERN = /\s*\(([^()]*)\)\s*$/;

export async function downloadImage(fetchImpl: FetchImpl, url: string): Promise<ArrayBuffer> {
  const response = await fetchImpl(url);

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
