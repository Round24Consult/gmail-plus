// Draws the toolbar icon (blue rounded square with a white plus) as PNGs, no image libraries needed.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLUE = [11, 87, 208];
function shape(u, v) {
  // u, v in [0, 1]. Rounded square with a plus cut in white.
  const m = 0.04, r = 0.22;
  const x = Math.min(u - m, 1 - m - u), y = Math.min(v - m, 1 - m - v);
  if (x < 0 || y < 0) return null;
  if (x < r && y < r && (r - x) ** 2 + (r - y) ** 2 > r * r) return null;
  const bar = 0.075, len = 0.27;
  const du = Math.abs(u - 0.5), dv = Math.abs(v - 0.5);
  if ((du < bar && dv < len) || (dv < bar && du < len)) return 'white';
  return 'blue';
}
function draw(size) {
  const S = 4; // 4x4 supersampling for smooth edges
  return png(size, (px, py) => {
    let blue = 0, white = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const s = shape((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
      if (s === 'blue') blue++; else if (s === 'white') white++;
    }
    const n = S * S, cover = (blue + white) / n;
    if (!cover) return [0, 0, 0, 0];
    const w = white / (blue + white);
    return [0, 1, 2].map((i) => Math.round(BLUE[i] * (1 - w) + 255 * w)).concat(Math.round(cover * 255));
  });
}
for (const size of [16, 48, 128]) writeFileSync(`static/icons/${size}.png`, draw(size));
console.log('Wrote static/icons/16.png, 48.png, 128.png');
