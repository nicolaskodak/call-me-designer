import { isValidDpi } from '../units';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const METERS_PER_INCH = 0.0254;
const CM_PER_INCH = 2.54;
const DPI_HEADER_BYTES = 256 * 1024;

const u32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const ascii = (b: Uint8Array, o: number, n: number): string =>
  String.fromCharCode(...b.subarray(o, o + n));

const isPng = (b: Uint8Array) => b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
const isJpeg = (b: Uint8Array) => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8;

const validOrNull = (dpi: number): number | null => (isValidDpi(dpi) ? dpi : null);

function readPngDpi(b: Uint8Array): number | null {
  let offset = 8;
  while (offset + 12 <= b.length) {
    const length = u32(b, offset);
    const type = ascii(b, offset + 4, 4);
    const data = offset + 8;
    if (type === 'pHYs' && length >= 9 && data + 9 <= b.length) {
      const unit = b[data + 8];
      return unit === 1 ? validOrNull(Math.round(u32(b, data) * METERS_PER_INCH)) : null;
    }
    // pHYs 規定要在 IDAT 之前
    if (type === 'IDAT' || type === 'IEND') return null;
    offset = data + length + 4;
  }
  return null;
}

function readJfifDensity(b: Uint8Array, offset: number): number | null {
  const units = b[offset + 11];
  const density = u16(b, offset + 12);
  if (units === 1) return validOrNull(density);
  if (units === 2) return validOrNull(Math.round(density * CM_PER_INCH));
  return null;
}

function readJpegDpi(b: Uint8Array): number | null {
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1; // 填充位元組
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // SOS 或 EOI 之後不會再有 APP0
    if (marker === 0xe0 && offset + 16 <= b.length && ascii(b, offset + 4, 5) === 'JFIF\0') {
      return readJfifDensity(b, offset);
    }
    offset += 2 + u16(b, offset + 2);
  }
  return null;
}

export function readDpiFromBytes(bytes: Uint8Array): number | null {
  if (isPng(bytes)) return readPngDpi(bytes);
  if (isJpeg(bytes)) return readJpegDpi(bytes);
  return null;
}

export async function readDpiFromBlob(blob: Blob): Promise<number | null> {
  const buffer = await blob.slice(0, DPI_HEADER_BYTES).arrayBuffer();
  return readDpiFromBytes(new Uint8Array(buffer));
}
