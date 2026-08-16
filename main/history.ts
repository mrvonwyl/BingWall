import path from 'node:path';
import type { GetHistoryDeps, HistoryItem, PruneOrphanedImagesDeps } from './history.models.js';

export async function getHistory(deps: GetHistoryDeps): Promise<HistoryItem[]> {
  const entries = await deps.readMetadata(deps.dataFolder);

  return entries.map((metadata) => ({
    metadata,
    imagePath: path.join(deps.dataFolder, `${metadata.date}.jpg`),
  }));
}

export async function pruneOrphanedImages(deps: PruneOrphanedImagesDeps): Promise<string[]> {
  const retainedDates = new Set(deps.entries.map((entry) => entry.date));
  const dates = await deps.listImageDates(deps.dataFolder);
  const orphaned = dates.filter((date) => !retainedDates.has(date));

  for (const date of orphaned) {
    await deps.deleteImage(deps.dataFolder, date);
  }

  return orphaned;
}
