// Encodes a BGRA bitmap (Electron's nativeImage.toBitmap() on Windows) as an
// uncompressed 24-bit bottom-up BMP.
export function encodeBmp(bgra: Buffer, width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const headerSize = 14 + 40;
  const out = Buffer.alloc(headerSize + pixelDataSize);

  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(headerSize + pixelDataSize, 2);
  out.writeUInt32LE(headerSize, 10);

  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width * 4;
    const dstRow = headerSize + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const src = srcRow + x * 4;
      const dst = dstRow + x * 3;
      out[dst] = bgra[src];
      out[dst + 1] = bgra[src + 1];
      out[dst + 2] = bgra[src + 2];
    }
  }

  return out;
}
