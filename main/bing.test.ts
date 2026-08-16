import { describe, expect, it, vi } from 'vitest';
import {
  buildImageUrl,
  downloadImage,
  fetchBingImages,
  fetchBingImagesWithFallback,
  resolveImageResolution,
  toStoredMetadata,
} from './bing.js';
import type { HPImageArchiveResponse } from './bing.models.js';

const sampleResponse: HPImageArchiveResponse = {
  images: [
    {
      startdate: '20260810',
      urlbase: '/th?id=OHR.Sample_EN-US1234567890',
      copyright: 'Sample copyright (© Someone)',
      copyrightlink: 'https://www.bing.com/search?q=sample',
      title: 'Sample title',
    },
  ],
};

describe('fetchBingImages', () => {
  it('fetches the HPImageArchive endpoint for the given market and returns its images', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('mkt=de-CH');
      expect(url).toContain('n=8');
      return { ok: true, status: 200, json: async () => sampleResponse, arrayBuffer: async () => new ArrayBuffer(0) };
    });

    const images = await fetchBingImages(fetchImpl, 'de-CH');

    expect(images).toEqual(sampleResponse.images);
  });
});

describe('fetchBingImagesWithFallback', () => {
  it('falls back to de-DE when de-CH returns no images', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('mkt=de-CH')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ images: [] }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }

      expect(url).toContain('mkt=de-DE');
      return { ok: true, status: 200, json: async () => sampleResponse, arrayBuffer: async () => new ArrayBuffer(0) };
    });

    const images = await fetchBingImagesWithFallback(fetchImpl);

    expect(images).toEqual(sampleResponse.images);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses de-CH images directly when available', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleResponse,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    const images = await fetchBingImagesWithFallback(fetchImpl);

    expect(images).toEqual(sampleResponse.images);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('resolveImageResolution', () => {
  it('defaults to UHD when the display is at or above 4K', () => {
    expect(resolveImageResolution({ width: 3840, height: 2160 })).toBe('UHD');
  });

  it('picks the closest known resolution not exceeding the display size', () => {
    expect(resolveImageResolution({ width: 1920, height: 1080 })).toBe('1920x1080');
    expect(resolveImageResolution({ width: 1366, height: 768 })).toBe('1366x768');
  });

  it('falls back to the smallest known resolution for very small displays', () => {
    expect(resolveImageResolution({ width: 320, height: 240 })).toBe('1024x768');
  });
});

describe('buildImageUrl', () => {
  it('appends the resolution suffix to the urlbase on bing.com', () => {
    const url = buildImageUrl(sampleResponse.images[0], 'UHD');

    expect(url).toBe('https://www.bing.com/th?id=OHR.Sample_EN-US1234567890_UHD.jpg');
  });
});

describe('toStoredMetadata', () => {
  it('splits the description out of the copyright attribution and formats the date', () => {
    const entry = {
      ...sampleResponse.images[0],
      startdate: '20260816',
      title: 'Where swans started a legend',
      copyright: 'Ruins of Ross Errilly Friary, County Galway, Ireland (© Maria Janus/Shutterstock)',
    };

    expect(toStoredMetadata(entry)).toEqual({
      date: '2026-08-16',
      title: 'Where swans started a legend',
      description: 'Ruins of Ross Errilly Friary, County Galway, Ireland',
      copyright: '© Maria Janus/Shutterstock',
      copyrightlink: entry.copyrightlink,
    });
  });
});

describe('downloadImage', () => {
  it('fetches the given url and returns the response body as an ArrayBuffer', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe('https://www.bing.com/image.jpg');
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => bytes };
    });

    const result = await downloadImage(fetchImpl, 'https://www.bing.com/image.jpg');

    expect(result).toBe(bytes);
  });

  it('throws when the download fails', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(downloadImage(fetchImpl, 'https://www.bing.com/missing.jpg')).rejects.toThrow(
      'Image download failed',
    );
  });
});
