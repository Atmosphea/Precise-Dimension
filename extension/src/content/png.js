// Writes a PNG a strip at a time, so a full-page screenshot can be any height. (A browser
// canvas tops out at roughly 16,000–32,000 pixels, which a long page at retina resolution
// passes easily.) Rows go through the browser's own zlib compressor as they arrive.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export class PngWriter {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.rows = 0;
    this.prev = new Uint8Array(width * 3); // last row written, for the "up" filter
    const cs = new CompressionStream('deflate'); // zlib format, which is what PNG wants
    this.writer = cs.writable.getWriter();
    this.parts = [];
    const reader = cs.readable.getReader();
    this.drained = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        this.parts.push(value);
      }
    })();
  }

  // rgba: pixels straight from getImageData (width × rows × 4). Stored as RGB: screenshots are opaque.
  async addRows(rgba, rows) {
    const w = this.w;
    const line = 1 + w * 3;
    const out = new Uint8Array(line * rows);
    const prev = this.prev;
    for (let y = 0; y < rows; y++) {
      let o = y * line;
      out[o++] = 2; // filter: difference from the row above (great for flat page backgrounds)
      let si = y * w * 4;
      for (let p = 0; p < w * 3; p += 3) {
        const r = rgba[si];
        const g = rgba[si + 1];
        const b = rgba[si + 2];
        out[o] = r - prev[p];
        out[o + 1] = g - prev[p + 1];
        out[o + 2] = b - prev[p + 2];
        prev[p] = r;
        prev[p + 1] = g;
        prev[p + 2] = b;
        o += 3;
        si += 4;
      }
    }
    this.rows += rows;
    await this.writer.write(out);
  }

  async finish() {
    if (this.rows !== this.h) throw new Error(`PNG got ${this.rows} of ${this.h} rows`);
    await this.writer.close();
    await this.drained;
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, this.w);
    dv.setUint32(4, this.h);
    ihdr[8] = 8; // bits per channel
    ihdr[9] = 2; // RGB
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
    // one IDAT chunk per compressed piece (they're simply joined back together when read)
    let pending = [];
    let size = 0;
    const flush = () => {
      if (!size) return;
      const data = new Uint8Array(size);
      let o = 0;
      for (const p of pending) {
        data.set(p, o);
        o += p.length;
      }
      parts.push(chunk('IDAT', data));
      pending = [];
      size = 0;
    };
    for (const p of this.parts) {
      pending.push(p);
      size += p.length;
      if (size >= 1 << 20) flush();
    }
    flush();
    parts.push(chunk('IEND', new Uint8Array(0)));
    this.parts = [];
    return new Blob(parts, { type: 'image/png' });
  }
}
