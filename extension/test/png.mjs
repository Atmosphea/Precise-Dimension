// A small PNG reader for the tests (8-bit RGB / RGBA, not interlaced), so screenshots can be
// checked pixel by pixel.
import zlib from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8;
  let w = 0, h = 0, type = 0, depth = 0, interlace = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const t = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (t === 'IDAT') idat.push(data);
    else if (t === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG ${depth}/${type}/${interlace}`);
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const line = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(line);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (line + 1)];
    const src = raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1));
    const cur = out.subarray(y * line, (y + 1) * line);
    for (let i = 0; i < line; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return {
    w,
    h,
    at(x, y) {
      const i = (Math.round(y) * w + Math.round(x)) * bpp;
      return [out[i], out[i + 1], out[i + 2]];
    },
  };
}
