import path from 'node:path';
import type { DownloadWallpaperDeps, DownloadWallpaperResult } from './download.models.js';
import type { StoredImageMetadata } from './storage.models.js';

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFilenameSegment(segment: string): string {
  return segment.replace(UNSAFE_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

export function buildDownloadFilename(metadata: StoredImageMetadata): string {
  return `${metadata.date}_${sanitizeFilenameSegment(metadata.title)}.jpg`;
}

export async function downloadWallpaper(
  metadata: StoredImageMetadata,
  imagePath: string,
  deps: DownloadWallpaperDeps,
): Promise<DownloadWallpaperResult> {
  const destinationPath = path.join(deps.downloadsFolder, buildDownloadFilename(metadata));
  await deps.copyFile(imagePath, destinationPath);
  return { destinationPath };
}
