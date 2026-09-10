import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
};

type Rgba = [number, number, number, number];

export function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.set(pixel(x, y), y * stride + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED: Rgba = [220, 40, 40, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const inRect = (x: number, y: number, x0: number, y0: number, w: number, h: number) =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

/** 兩個 120 px 正方形，相距 60 px（300 dpi 時約 5 mm），預設參數下會橋接成一條刀模 */
export const twoSquaresPng = () =>
  makePng(400, 240, (x, y) => (inRect(x, y, 40, 60, 120, 120) || inRect(x, y, 220, 60, 120, 120) ? RED : CLEAR));

/** 400×400 圖中央一個 200 px 正方形（100..300） */
export const singleSquarePng = () =>
  makePng(400, 400, (x, y) => (inRect(x, y, 100, 100, 200, 200) ? RED : CLEAR));

/** 完全不透明（白底）的圖 */
export const opaquePng = () =>
  makePng(200, 200, (x, y) => (inRect(x, y, 50, 50, 100, 100) ? RED : WHITE));

/** 模擬 remove.bg 回傳的去背結果 */
export const cutoutPng = () =>
  makePng(200, 200, (x, y) => (inRect(x, y, 50, 50, 100, 100) ? RED : CLEAR));

export const pngFile = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });
