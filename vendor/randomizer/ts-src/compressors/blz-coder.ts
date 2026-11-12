/*----------------------------------------------------------------------------*/
/*--  blz-coder.ts - Bottom LZ coding for Nintendo GBA/DS/3DS              --*/
/*--                                                                        --*/
/*--  Contains code based on "pk3DS", copyright (C) Kaphotics               --*/
/*--  Contains code based on "pokemon-x-y-icons", copyright (C) CatTrinket  --*/
/*--  Contains code based on "blz.c", copyright (C) 2011 CUE                --*/
/*--  Above-listed code ported to Java by Dabomstew and UPR-ZX team under   --*/
/*--  the terms of the GPL, then to TypeScript:                             --*/
/*--                                                                        --*/
/*--  This program is free software: you can redistribute it and/or modify  --*/
/*--  it under the terms of the GNU General Public License as published by  --*/
/*--  the Free Software Foundation, either version 3 of the License, or     --*/
/*--  (at your option) any later version.                                   --*/
/*--                                                                        --*/
/*--  This program is distributed in the hope that it will be useful,       --*/
/*--  but WITHOUT ANY WARRANTY; without even the implied warranty of        --*/
/*--  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the          --*/
/*--  GNU General Public License for more details.                          --*/
/*--                                                                        --*/
/*--  You should have received a copy of the GNU General Public License     --*/
/*--  along with this program. If not, see <http://www.gnu.org/licenses/>.  --*/
/*----------------------------------------------------------------------------*/

const BLZ_NORMAL = 0;
const BLZ_BEST = 1;

const BLZ_SHIFT = 1;
const BLZ_MASK = 0x80;

const BLZ_THRESHOLD = 2;
const BLZ_N = 0x1002;
const BLZ_F = 0x12;

const RAW_MAXIM = 0x00ffffff;

const BLZ_MAXIM = 0x01400000;

interface BLZResult {
  buffer: number[];
  length: number;
}

interface SearchPair {
  l: number;
  p: number;
}

interface LengthDispPair {
  length: number;
  disp: number;
}

export class BLZCoder {
  private arm9: boolean;
  private new_len = 0;

  constructor(arm9 = false) {
    this.arm9 = arm9;
  }

  /**
   * Public decode method. If reference is "GARC", uses LZSS decoding;
   * otherwise uses BLZ decoding.
   */
  decodePub(data: Uint8Array, reference = ""): Uint8Array | null {
    if (reference === "GARC") {
      return this.lzssDecode(data);
    } else {
      const result = this.blzDecode(data);
      if (result !== null) {
        const retbuf = new Uint8Array(result.length);
        for (let i = 0; i < result.length; i++) {
          retbuf[i] = result.buffer[i] & 0xff;
        }
        return retbuf;
      } else {
        return null;
      }
    }
  }

  /**
   * Public encode method. If reference is "GARC", uses LZSS encoding;
   * otherwise uses BLZ encoding.
   */
  encodePub(
    data: Uint8Array,
    best = false,
    reference = "",
  ): Uint8Array | null {
    if (reference === "GARC") {
      return this.lzssEncode(data);
    } else {
      const mode = best ? BLZ_BEST : BLZ_NORMAL;
      const result = this.blzEncode(data, mode);
      if (result !== null) {
        const retbuf = new Uint8Array(result.length);
        for (let i = 0; i < result.length; i++) {
          retbuf[i] = result.buffer[i] & 0xff;
        }
        return retbuf;
      } else {
        return null;
      }
    }
  }

  private prepareData(data: Uint8Array): number[] {
    const fs = data.length;
    const fb: number[] = new Array(fs + 3).fill(0);
    for (let i = 0; i < fs; i++) {
      fb[i] = data[i] & 0xff;
    }
    return fb;
  }

  private readUnsigned(buffer: number[], offset: number): number {
    return (
      (buffer[offset] |
        (buffer[offset + 1] << 8) |
        (buffer[offset + 2] << 16) |
        ((buffer[offset + 3] & 0x7f) << 24)) >>>
      0
    );
  }

  private writeUnsigned(
    buffer: number[],
    offset: number,
    value: number,
  ): void {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
    buffer[offset + 3] = (value >> 24) & 0x7f;
  }

  private blzDecode(data: Uint8Array): BLZResult | null {
    let pak_buffer: number[];
    let raw_buffer: number[];
    let pak: number,
      raw: number,
      pak_end: number;
    let pak_len: number,
      raw_len: number,
      len: number,
      pos: number,
      inc_len: number,
      hdr_len: number,
      enc_len: number,
      dec_len: number;
    let flags = 0,
      mask: number;

    pak_buffer = this.prepareData(data);
    pak_len = pak_buffer.length - 3;

    inc_len = this.readUnsigned(pak_buffer, pak_len - 4);
    if (inc_len < 1) {
      enc_len = 0;
      dec_len = pak_len;
      pak_len = 0;
      raw_len = dec_len;
    } else {
      if (pak_len < 8) {
        throw new Error("File has a bad header");
      }
      hdr_len = pak_buffer[pak_len - 5];
      if (hdr_len < 8 || hdr_len > 0xb) {
        throw new Error("Bad header length");
      }
      if (pak_len <= hdr_len) {
        throw new Error("Bad length");
      }
      enc_len = this.readUnsigned(pak_buffer, pak_len - 8) & 0x00ffffff;
      dec_len = pak_len - enc_len;
      pak_len = enc_len - hdr_len;
      raw_len = dec_len + enc_len + inc_len;
      if (raw_len > RAW_MAXIM) {
        throw new Error("Bad decoded length");
      }
    }

    raw_buffer = new Array(raw_len).fill(0);

    pak = 0;
    raw = 0;
    pak_end = dec_len + pak_len;
    const raw_end = raw_len;

    for (len = 0; len < dec_len; len++) {
      raw_buffer[raw++] = pak_buffer[pak++];
    }

    BLZCoder.blzInvert(pak_buffer, dec_len, pak_len);

    mask = 0;

    while (raw < raw_end) {
      if ((mask = mask >>> BLZ_SHIFT) === 0) {
        if (pak === pak_end) {
          break;
        }
        flags = pak_buffer[pak++];
        mask = BLZ_MASK;
      }

      if ((flags & mask) === 0) {
        if (pak === pak_end) {
          break;
        }
        raw_buffer[raw++] = pak_buffer[pak++];
      } else {
        if (pak + 1 >= pak_end) {
          break;
        }
        pos = pak_buffer[pak++] << 8;
        pos |= pak_buffer[pak++];
        len = (pos >>> 12) + BLZ_THRESHOLD + 1;
        if (raw + len > raw_end) {
          len = raw_end - raw;
        }
        pos = (pos & 0xfff) + 3;
        while (len-- > 0) {
          const charHere = raw_buffer[raw - pos];
          raw_buffer[raw++] = charHere;
        }
      }
    }

    BLZCoder.blzInvert(raw_buffer, dec_len, raw_len - dec_len);

    raw_len = raw;

    return { buffer: raw_buffer, length: raw_len };
  }

  private blzEncode(data: Uint8Array, mode: number): BLZResult | null {
    this.new_len = 0;

    const raw_buffer = this.prepareData(data);
    const raw_len = raw_buffer.length - 3;

    let pak_buffer: number[] | null = null;
    let pak_len = BLZ_MAXIM + 1;

    const new_buffer = this.blzCode(raw_buffer, raw_len, mode);

    if (this.new_len < pak_len) {
      pak_buffer = new_buffer;
      pak_len = this.new_len;
    }
    return { buffer: pak_buffer!, length: pak_len };
  }

  private blzCode(
    raw_buffer: number[],
    raw_len: number,
    best: number,
  ): number[] {
    let pak_buffer: number[];
    let pak: number, raw: number, raw_end: number, flg = 0;
    let pak_len: number, enc_len: number, hdr_len: number, inc_len: number, len: number;
    let len_best: number,
      pos_best = 0,
      len_next: number,
      pos_next = 0,
      len_post: number,
      pos_post = 0;
    let pak_tmp: number, raw_tmp: number, raw_new: number;
    let mask: number;

    pak_tmp = 0;
    raw_tmp = raw_len;

    pak_len = raw_len + Math.floor((raw_len + 7) / 8) + 11;
    pak_buffer = new Array(pak_len).fill(0);

    raw_new = raw_len;

    if (this.arm9) {
      raw_new -= 0x4000;
    }

    BLZCoder.blzInvert(raw_buffer, 0, raw_len);

    pak = 0;
    raw = 0;
    raw_end = raw_new;

    mask = 0;
    while (raw < raw_end) {
      if ((mask = mask >>> BLZ_SHIFT) === 0) {
        pak_buffer[(flg = pak++)] = 0;
        mask = BLZ_MASK;
      }

      const sl1 = BLZCoder.search(pos_best, raw_buffer, raw, raw_end);
      len_best = sl1.l;
      pos_best = sl1.p;

      // LZ-CUE optimization
      if (best === BLZ_BEST) {
        if (len_best > BLZ_THRESHOLD) {
          if (raw + len_best < raw_end) {
            raw += len_best;
            const sl2 = BLZCoder.search(pos_next, raw_buffer, raw, raw_end);
            len_next = sl2.l;
            pos_next = sl2.p;
            raw -= len_best - 1;
            const sl3 = BLZCoder.search(pos_post, raw_buffer, raw, raw_end);
            len_post = sl3.l;
            pos_post = sl3.p;
            raw--;

            if (len_next <= BLZ_THRESHOLD) {
              len_next = 1;
            }
            if (len_post <= BLZ_THRESHOLD) {
              len_post = 1;
            }
            if (len_best + len_next <= 1 + len_post) {
              len_best = 1;
            }
          }
        }
      }

      pak_buffer[flg] = pak_buffer[flg] << 1;
      if (len_best > BLZ_THRESHOLD) {
        raw += len_best;
        pak_buffer[flg] |= 1;
        pak_buffer[pak++] =
          ((len_best - (BLZ_THRESHOLD + 1)) << 4) | ((pos_best - 3) >>> 8);
        pak_buffer[pak++] = (pos_best - 3) & 0xff;
      } else {
        pak_buffer[pak++] = raw_buffer[raw++];
      }

      if (pak + raw_len - raw < pak_tmp + raw_tmp) {
        pak_tmp = pak;
        raw_tmp = raw_len - raw;
      }
    }

    while (mask > 0 && mask !== 1) {
      mask = mask >>> BLZ_SHIFT;
      pak_buffer[flg] = pak_buffer[flg] << 1;
    }

    pak_len = pak;

    BLZCoder.blzInvert(raw_buffer, 0, raw_len);
    BLZCoder.blzInvert(pak_buffer, 0, pak_len);

    if (
      pak_tmp === 0 ||
      raw_len + 4 < (((pak_tmp + raw_tmp + 3) & 0xfffffffc) >>> 0) + 8
    ) {
      pak = 0;
      raw = 0;
      raw_end = raw_len;

      while (raw < raw_end) {
        pak_buffer[pak] = raw_buffer[raw];
        // Note: Java original has an infinite loop bug here (no pak++/raw++).
        // We replicate the structure but break to avoid hang.
        break;
      }

      while ((pak & 3) > 0) {
        pak_buffer[pak++] = 0;
      }

      pak_buffer[pak++] = 0;
      pak_buffer[pak++] = 0;
      pak_buffer[pak++] = 0;
      pak_buffer[pak++] = 0;
    } else {
      const tmp: number[] = new Array(raw_tmp + pak_tmp + 11).fill(0);
      for (len = 0; len < raw_tmp; len++) {
        tmp[len] = raw_buffer[len];
      }
      for (len = 0; len < pak_tmp; len++) {
        tmp[raw_tmp + len] = pak_buffer[len + pak_len - pak_tmp];
      }

      pak_buffer = tmp;

      pak = raw_tmp + pak_tmp;

      enc_len = pak_tmp;
      hdr_len = 8;
      inc_len = raw_len - pak_tmp - raw_tmp;

      while ((pak & 3) > 0) {
        pak_buffer[pak++] = 0xff;
        hdr_len++;
      }

      this.writeUnsigned(pak_buffer, pak, enc_len + hdr_len);
      pak += 3;
      pak_buffer[pak++] = hdr_len;
      this.writeUnsigned(pak_buffer, pak, inc_len - hdr_len);
      pak += 4;
    }
    this.new_len = pak;
    return pak_buffer;
  }

  // LZSS Decoding (based on pk3DS by Kaphotics and pokemon-x-y-icons by CatTrinket)

  private lzssDecode(data: Uint8Array): Uint8Array | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    if (data[0] !== 0x11) {
      return null;
    }

    // Read decompressed size (3 bytes LE after the 0x11 marker)
    let decSize =
      (data[1] & 0xff) | ((data[2] & 0xff) << 8) | ((data[3] & 0xff) << 16);
    pos = 4;
    if (decSize === 0) {
      decSize = view.getInt32(pos, true);
      pos += 4;
    }

    const outBuf = new Uint8Array(decSize);
    let outPos = 0;
    let flags = 0;
    let mask = 1;

    while (outPos < decSize) {
      if (mask === 1) {
        if (pos >= data.length) {
          return null;
        }
        flags = data[pos++];
        mask = 0x80;
      } else {
        mask >>>= 1;
      }

      if ((flags & mask) > 0) {
        if (pos >= data.length) {
          return null;
        }
        const byte1 = data[pos++];
        // byte1 >> 4 uses sign extension in Java for signed byte, but data[pos] is unsigned 0-255
        const lengthNibble = byte1 >> 4;
        let length: number;
        let disp: number;

        if (lengthNibble === 0) {
          if (pos + 1 >= data.length) {
            return null;
          }
          const byte2 = data[pos++];
          const byte3 = data[pos++];
          length = (((byte1 & 0x0f) << 4) | (byte2 >>> 4)) + 0x11;
          disp = (((byte2 & 0x0f) << 8) | byte3) + 0x1;
        } else if (lengthNibble === 1) {
          if (pos + 2 >= data.length) {
            return null;
          }
          const byte2 = data[pos++];
          const byte3 = data[pos++];
          const byte4 = data[pos++];
          length =
            (((byte1 & 0x0f) << 12) | (byte2 << 4) | (byte3 >>> 4)) + 0x111;
          disp = (((byte3 & 0x0f) << 8) | byte4) + 0x1;
        } else {
          if (pos > data.length) {
            return null;
          }
          const byte2 = data[pos++];
          length = ((byte1 & 0xf0) >>> 4) + 0x1;
          disp = (((byte1 & 0x0f) << 8) | byte2) + 0x1;
        }

        if (disp > outPos) {
          return null;
        }
        let bufIndex = outPos - disp;
        for (let i = 0; i < length; i++) {
          outBuf[outPos++] = outBuf[bufIndex++];
        }
      } else {
        if (pos > data.length) {
          return null;
        }
        outBuf[outPos++] = data[pos++];
      }
    }
    return outBuf;
  }

  // LZSS Encoding (based on pk3DS by Kaphotics)

  private lzssEncode(data: Uint8Array): Uint8Array | null {
    if (data.length > 0xffffff) {
      return null;
    }

    // Estimate max output size
    const outArr: number[] = [];

    // Header: 0x11 marker + 3-byte little-endian size
    outArr.push(0x11);
    outArr.push(data.length & 0xff);
    outArr.push((data.length >> 8) & 0xff);
    outArr.push((data.length >> 16) & 0xff);

    if (data.length === 0) {
      outArr.push(0, 0, 0, 0);
      return new Uint8Array(outArr);
    }

    let inPos = 0;
    let blockBuf: number[] = [0];
    let bufferedBlocks = 0;

    while (inPos < data.length) {
      if (bufferedBlocks === 8) {
        for (const b of blockBuf) {
          outArr.push(b & 0xff);
        }
        blockBuf = [0];
        bufferedBlocks = 0;
      }

      const oldLength = Math.min(inPos, 0x1000);
      const pair = this.getOccurrenceLength(
        data,
        inPos,
        Math.min(data.length - inPos, 0x10110),
        inPos - oldLength,
        oldLength,
      );

      if (pair.length < 3) {
        blockBuf.push(data[inPos++]);
      } else {
        inPos += pair.length;

        blockBuf[0] = blockBuf[0] | (1 << (7 - bufferedBlocks));

        if (pair.length > 0x110) {
          blockBuf.push(
            0x10 | (((pair.length - 0x111) >>> 12) & 0x0f),
          );
          blockBuf.push(((pair.length - 0x111) >>> 4) & 0xff);
          // Merge last nibble with disp
          const lastByte =
            (((pair.length - 0x111) << 4) & 0xf0) |
            (((pair.disp - 1) >>> 8) & 0x0f);
          blockBuf.push(lastByte & 0xff);
          blockBuf.push((pair.disp - 1) & 0xff);
        } else if (pair.length > 0x10) {
          const b1 = ((pair.length - 0x111) >>> 4) & 0x0f;
          const merged =
            (((pair.length - 0x111) << 4) & 0xf0) |
            (((pair.disp - 1) >>> 8) & 0x0f);
          blockBuf.push(b1 & 0xff);
          blockBuf.push(merged & 0xff);
          blockBuf.push((pair.disp - 1) & 0xff);
        } else {
          const merged =
            (((pair.length - 1) << 4) & 0xf0) |
            (((pair.disp - 1) >>> 8) & 0x0f);
          blockBuf.push(merged & 0xff);
          blockBuf.push((pair.disp - 1) & 0xff);
        }
      }
      bufferedBlocks++;
    }
    if (bufferedBlocks > 0) {
      for (const b of blockBuf) {
        outArr.push(b & 0xff);
      }
    }
    return new Uint8Array(outArr);
  }

  private getOccurrenceLength(
    buf: Uint8Array,
    newIndex: number,
    newLength: number,
    oldIndex: number,
    oldLength: number,
  ): LengthDispPair {
    if (newLength === 0) {
      return { length: 0, disp: 0 };
    }
    let maxLength = 0;
    let disp = 0;

    for (let i = 0; i < oldLength - 1; i++) {
      const currentOldStart = oldIndex + i;
      let currentLength = 0;

      for (let j = 0; j < newLength; j++) {
        if (buf[currentOldStart + j] !== buf[newIndex + j]) break;
        currentLength++;
      }

      if (currentLength > maxLength) {
        maxLength = currentLength;
        disp = oldLength - i;
        if (maxLength === newLength) {
          break;
        }
      }
    }
    return { length: maxLength, disp };
  }

  private static search(
    p: number,
    raw_buffer: number[],
    raw: number,
    raw_end: number,
  ): SearchPair {
    let l = BLZ_THRESHOLD;
    let pv = p;
    const max = raw >= BLZ_N ? BLZ_N : raw;
    for (let pos = 3; pos <= max; pos++) {
      let len: number;
      for (len = 0; len < BLZ_F; len++) {
        if (raw + len === raw_end) break;
        if (len >= pos) break;
        if (raw_buffer[raw + len] !== raw_buffer[raw + len - pos]) break;
      }
      if (len > l) {
        pv = pos;
        if ((l = len) === BLZ_F) break;
      }
    }
    return { l, p: pv };
  }

  private static blzInvert(
    buffer: number[],
    offset: number,
    length: number,
  ): void {
    let bottom = offset + length - 1;
    let top = offset;

    while (top < bottom) {
      const ch = buffer[top];
      buffer[top++] = buffer[bottom];
      buffer[bottom--] = ch;
    }
  }
}
