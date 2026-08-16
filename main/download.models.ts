export type DownloadWallpaperDeps = {
  downloadsFolder: string;
  copyFile: (source: string, destination: string) => Promise<void>;
};

export type DownloadWallpaperResult = {
  destinationPath: string;
};
