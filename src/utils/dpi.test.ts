import { describe, expect, it } from 'vitest';
import { readDpiFromBlob, readDpiFromBytes } from './dpi';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const bytesOf = (s: string) => [...s].map(c => c.charCodeAt(0));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...bytesOf(type), ...data, 0, 0, 0, 0];
const phys = (pixelsPerMeter: number, unit: number) =>
  pngChunk('pHYs', [...be32(pixelsPerMeter), ...be32(pixelsPerMeter), unit]);
const png = (...chunks: number[][]) =>
  new Uint8Array([...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...chunks.flat(), ...pngChunk('IEND', [])]);

const jfif = (units: number, density: number) =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), ...bytesOf('JFIF'), 0x00, 1, 1, units, ...be16(density), ...be16(density), 0, 0,
    0xff, 0xd9,
  ]);

describe('readDpiFromBytes (PNG)', () => {
  it('reads pHYs in pixels per meter', () => {
    expect(readDpiFromBytes(png(phys(11811, 1)))).toBe(300);
  });

  it('ignores pHYs with unknown unit', () => {
    expect(readDpiFromBytes(png(phys(11811, 0)))).toBeNull();
  });

  it('returns null without pHYs', () => {
    expect(readDpiFromBytes(png())).toBeNull();
  });

  it('stops at IDAT', () => {
    expect(readDpiFromBytes(png(pngChunk('IDAT', [0]), phys(11811, 1)))).toBeNull();
  });

  it('rejects out-of-range values', () => {
    expect(readDpiFromBytes(png(phys(100, 1)))).toBeNull();
  });
});

describe('readDpiFromBytes (JPEG)', () => {
  it('reads JFIF density in dpi', () => {
    expect(readDpiFromBytes(jfif(1, 300))).toBe(300);
  });

  it('converts dots per cm', () => {
    expect(readDpiFromBytes(jfif(2, 118))).toBe(300);
  });

  it('returns null for aspect-ratio-only density', () => {
    expect(readDpiFromBytes(jfif(0, 1))).toBeNull();
  });

  it('returns null without APP0', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, ...be16(4), 0, 0, 0xff, 0xda, 0, 2]);
    expect(readDpiFromBytes(bytes)).toBeNull();
  });
});

describe('readDpiFromBytes (other)', () => {
  it('returns null for unknown formats', () => {
    expect(readDpiFromBytes(new Uint8Array(bytesOf('RIFF....WEBP')))).toBeNull();
    expect(readDpiFromBytes(new Uint8Array([]))).toBeNull();
  });
});

describe('readDpiFromBlob', () => {
  it('reads from a blob', async () => {
    expect(await readDpiFromBlob(new Blob([png(phys(11811, 1))]))).toBe(300);
  });
});
