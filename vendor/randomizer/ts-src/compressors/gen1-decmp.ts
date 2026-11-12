/**
 * Pokemon Gen 1 sprite decompressor
 * Source: https://github.com/pret/pokemon-reverse-engineering-tools/blob/master/pokemontools/pic.py
 * (and gfx.py for flatten())
 * Ported to Java by Dabomstew, then to TypeScript.
 */

class BitStream {
  private data: Uint8Array;
  private offset: number;
  private bitsLeft: number;
  private bufVal: number;

  // prettier-ignore
  private static readonly bmask: number[] = [
    0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff,
    0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff, 0xffff,
    0x1ffff, 0x3ffff, 0x7ffff, 0xfffff, 0x1fffff, 0x3fffff, 0x7fffff,
    0xffffff, 0x1ffffff, 0x3ffffff, 0x7ffffff, 0xfffffff,
    0x1fffffff, 0x3fffffff, 0x7fffffff, 0xffffffff,
  ];

  constructor(data: Uint8Array, baseOffset = 0) {
    this.data = data;
    this.offset = baseOffset - 1;
    this.bitsLeft = 0;
    this.bufVal = -1;
  }

  next(): number {
    if (this.bitsLeft === 0) {
      this.offset++;
      this.bufVal = this.data[this.offset] & 0xff;
      if (this.offset >= this.data.length) {
        return -1;
      }
      this.bitsLeft = 8;
    }

    const retval = this.bufVal >> (this.bitsLeft - 1);
    this.bufVal &= BitStream.bmask[this.bitsLeft - 1];
    this.bitsLeft--;

    return retval;
  }
}

function bitflip(x: number, n: number): number {
  let r = 0;
  let xv = x;
  let nv = n;
  while (nv > 0) {
    r = (r << 1) | (xv & 1);
    xv >>= 1;
    nv -= 1;
  }
  return r;
}

// prettier-ignore
const table2: number[][] = [
  [0x0, 0x1, 0x3, 0x2, 0x7, 0x6, 0x4, 0x5, 0xf, 0xe, 0xc, 0xd, 0x8, 0x9, 0xb, 0xa],
  [0xf, 0xe, 0xc, 0xd, 0x8, 0x9, 0xb, 0xa, 0x0, 0x1, 0x3, 0x2, 0x7, 0x6, 0x4, 0x5],
  [0x0, 0x8, 0xc, 0x4, 0xe, 0x6, 0x2, 0xa, 0xf, 0x7, 0x3, 0xb, 0x1, 0x9, 0xd, 0x5],
  [0xf, 0x7, 0x3, 0xb, 0x1, 0x9, 0xd, 0x5, 0x0, 0x8, 0xc, 0x4, 0xe, 0x6, 0x2, 0xa],
];

const table1: number[] = new Array(16);
const table3: number[] = new Array(16);

for (let i = 0; i < 16; i++) {
  table1[i] = (2 << i) - 1;
  table3[i] = bitflip(i, 4);
}

const tilesize = 8;

export class Gen1Decmp {
  private bs: BitStream;
  private mirror: boolean;
  private planar: boolean;
  private data: Uint8Array | null;
  private sizex!: number;
  private sizey!: number;
  private size!: number;
  private ramorder!: number;

  constructor(input: Uint8Array, baseOffset: number);
  constructor(
    input: Uint8Array,
    baseOffset: number,
    mirror: boolean,
    planar: boolean,
  );
  constructor(
    input: Uint8Array,
    baseOffset: number,
    mirror = false,
    planar = true,
  ) {
    this.bs = new BitStream(input, baseOffset);
    this.mirror = mirror;
    this.planar = planar;
    this.data = null;
  }

  decompress(): void {
    const rams: (Uint8Array | null)[] = [null, null];

    this.sizex = this.readint(4) * tilesize;
    this.sizey = this.readint(4);

    this.size = this.sizex * this.sizey;

    this.ramorder = this.readbit();

    const r1 = this.ramorder;
    const r2 = this.ramorder ^ 1;

    this.fillram(rams, r1);
    let mode = this.readbit();
    if (mode === 1) {
      mode += this.readbit();
    }
    this.fillram(rams, r2);

    rams[0] = this.bitgroupsToBytes(rams[0]!);
    rams[1] = this.bitgroupsToBytes(rams[1]!);

    if (mode === 0) {
      this.decode(rams[0]!);
      this.decode(rams[1]!);
    } else if (mode === 1) {
      this.decode(rams[r1]!);
      this.xorBuffers(rams[r1]!, rams[r2]!);
    } else if (mode === 2) {
      this.decode(rams[r2]!, false);
      this.decode(rams[r1]!);
      this.xorBuffers(rams[r1]!, rams[r2]!);
    }

    if (this.planar) {
      this.data = new Uint8Array(this.size * 2);
      for (let i = 0; i < rams[0]!.length; i++) {
        this.data[i * 2] = rams[0]![i];
        this.data[i * 2 + 1] = rams[1]![i];
      }
    } else {
      const tmpdata = new Uint8Array(this.size * 8);
      const r0S = new BitStream(rams[0]!);
      const r1S = new BitStream(rams[1]!);
      for (let i = 0; i < tmpdata.length; i++) {
        tmpdata[i] = r0S.next() | (r1S.next() << 1);
      }
      this.data = this.bitgroupsToBytes(tmpdata);
    }
  }

  transpose(): void {
    if (this.data === null) {
      return;
    }
    const tiles = this.data.length / 16;
    const width = this.sizex / tilesize;
    const height = this.sizey;

    const newData = new Uint8Array(this.data.length);
    for (let tile = 0; tile < tiles; tile++) {
      const oldTileX = tile % width;
      const oldTileY = Math.floor(tile / width);
      const newTileNum = oldTileX * height + oldTileY;
      newData.set(
        this.data.subarray(tile * 16, tile * 16 + 16),
        newTileNum * 16,
      );
    }
    this.data = newData;
  }

  getData(): Uint8Array | null {
    return this.data;
  }

  getFlattenedData(): Uint8Array | null {
    if (this.data === null) return null;
    return flatten(this.data);
  }

  getWidth(): number {
    return this.sizex;
  }

  getHeight(): number {
    return this.sizey * tilesize;
  }

  private fillram(rams: (Uint8Array | null)[], rOffset: number): void {
    const size = this.size * 4;
    rams[rOffset] = new Uint8Array(size);
    let rleMode = this.readbit() === 0;
    let written = 0;
    while (written < size) {
      if (rleMode) {
        written += this.readRleChunk(rams[rOffset]!, written);
      } else {
        written += this.readDataChunk(rams[rOffset]!, written, size);
      }
      rleMode = !rleMode;
    }
    rams[rOffset] = this.deinterlaceBitgroups(rams[rOffset]!);
  }

  private deinterlaceBitgroups(bits: Uint8Array): Uint8Array {
    const l = new Uint8Array(bits.length);
    let offs = 0;
    for (let y = 0; y < this.sizey; y++) {
      for (let x = 0; x < this.sizex; x++) {
        let i = 4 * y * this.sizex + x;
        for (let j = 0; j < 4; j++) {
          l[offs++] = bits[i];
          i += this.sizex;
        }
      }
    }
    return l;
  }

  private readRleChunk(ram: Uint8Array, baseOffset: number): number {
    let i = 0;
    while (this.readbit() === 1) {
      i++;
    }

    let n = table1[i];
    const a = this.readint(i + 1);
    n += a;

    for (i = 0; i < n; i++) {
      ram[baseOffset + i] = 0;
    }
    return n;
  }

  private readDataChunk(
    ram: Uint8Array,
    baseOffset: number,
    size: number,
  ): number {
    let written = 0;
    while (true) {
      const bitgroup = this.readint(2);
      if (bitgroup === 0) {
        break;
      }
      ram[baseOffset + written] = bitgroup;
      written++;

      if (baseOffset + written >= size) {
        break;
      }
    }
    return written;
  }

  private readbit(): number {
    return this.bs.next();
  }

  private readint(count: number): number {
    return Gen1Decmp.readintFromStream(this.bs, count);
  }

  private static readintFromStream(strm: BitStream, count: number): number {
    let n = 0;
    let c = count;
    while (c > 0) {
      n <<= 1;
      n |= strm.next();
      c -= 1;
    }
    return n;
  }

  private bitgroupsToBytes(bits: Uint8Array): Uint8Array {
    const limiter = bits.length - 3;
    const ret = new Uint8Array(Math.floor(bits.length / 4));
    for (let i = 0; i < limiter; i += 4) {
      const n = (bits[i] << 6) | (bits[i + 1] << 4) | (bits[i + 2] << 2) | bits[i + 3];
      ret[Math.floor(i / 4)] = n & 0xff;
    }
    return ret;
  }

  private decode(ram: Uint8Array, mirror?: boolean): void {
    const useMirror = mirror !== undefined ? mirror : this.mirror;
    for (let x = 0; x < this.sizex; x++) {
      let bit = 0;
      for (let y = 0; y < this.sizey; y++) {
        const i = y * this.sizex + x;
        let a = ((ram[i] & 0xff) >> 4) & 0x0f;
        let b = ram[i] & 0x0f;

        a = table2[bit][a];
        bit = a & 1;
        if (useMirror) {
          a = table3[a];
        }

        b = table2[bit][b];
        bit = b & 1;
        if (useMirror) {
          b = table3[b];
        }

        ram[i] = ((a << 4) | b) & 0xff;
      }
    }
  }

  private xorBuffers(
    ram1: Uint8Array,
    ram2: Uint8Array,
    mirror?: boolean,
  ): void {
    const useMirror = mirror !== undefined ? mirror : this.mirror;
    for (let i = 0; i < ram2.length; i++) {
      if (useMirror) {
        let a = ((ram2[i] & 0xff) >> 4) & 0x0f;
        let b = ram2[i] & 0x0f;
        a = table3[a];
        b = table3[b];
        ram2[i] = ((a << 4) | b) & 0xff;
      }

      ram2[i] = ((ram2[i] & 0xff) ^ (ram1[i] & 0xff)) & 0xff;
    }
  }
}

function flatten(planar: Uint8Array): Uint8Array {
  const strips = new Uint8Array(planar.length * 4);
  for (let j = 0; j < Math.floor(planar.length / 2); j++) {
    const bottom = planar[j * 2] & 0xff;
    const top = planar[j * 2 + 1] & 0xff;
    const strip = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      strip[7 - i] = ((bottom >>> i) & 1) + (((top * 2) >>> i) & 2);
    }
    strips.set(strip, j * 8);
  }
  return strips;
}
