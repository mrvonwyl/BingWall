export type BingImageEntry = {
  startdate: string;
  urlbase: string;
  copyright: string;
  copyrightlink: string;
  title: string;
};

export type HPImageArchiveResponse = {
  images: BingImageEntry[];
};

export type FetchImpl = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export type DisplaySize = {
  width: number;
  height: number;
};

export type ImageResolution = '1024x768' | '1280x720' | '1366x768' | '1920x1080' | '1920x1200' | 'UHD';

export type StoredImageMetadata = {
  date: string;
  title: string;
  description: string;
  copyright: string;
  copyrightlink: string;
};
