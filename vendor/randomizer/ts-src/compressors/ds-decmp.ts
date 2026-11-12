// MODIFIED DSDECMP-JAVA SOURCE FOR RANDOMIZER'S NEEDS
// License is below
//
// Copyright (c) 2010 Nick Kraayenbrink
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import { FileFunctions } from "../utils/file-functions.js";

export class DSDecmp {
  static decompress(data: Uint8Array, offset = 0): Uint8Array | null {
    switch (data[offset] & 0xff) {
      case 0x10:
        return DSDecmp.decompress10LZ(data, offset);
      case 0x11:
        return DSDecmp.decompress11LZ(data, offset);
      default:
        return null;
    }
  }

  private static decompress10LZ(data: Uint8Array, offset: number): Uint8Array {
    offset++;
    let length =
      (data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16);
    offset += 3;
    if (length === 0) {
      length = FileFunctions.readFullIntBigEndian(data, offset);
      offset += 4;
    }

    const outData = new Uint8Array(length);
    let curr_size = 0;
    let flags: number;
    let flag: boolean;
    let disp: number, n: number, b: number, cdest: number;

    while (curr_size < outData.length) {
      flags = data[offset++] & 0xff;
      for (let i = 0; i < 8; i++) {
        flag = (flags & (0x80 >> i)) > 0;
        if (flag) {
          b = data[offset++] & 0xff;
          n = b >> 4;
          disp = (b & 0x0f) << 8;
          disp |= data[offset++] & 0xff;
          n += 3;
          cdest = curr_size;
          if (disp > curr_size) {
            throw new Error("Cannot go back more than already written");
          }
          for (let j = 0; j < n; j++) {
            outData[curr_size++] = outData[cdest - disp - 1 + j];
          }
          if (curr_size > outData.length) break;
        } else {
          b = data[offset++] & 0xff;
          if (curr_size < outData.length) {
            outData[curr_size++] = b;
          } else {
            if (b === 0) break;
          }
          if (curr_size > outData.length) break;
        }
      }
    }
    return outData;
  }

  private static decompress11LZ(data: Uint8Array, offset: number): Uint8Array {
    offset++;
    let length =
      (data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16);
    offset += 3;
    if (length === 0) {
      length = FileFunctions.readFullIntBigEndian(data, offset);
      offset += 4;
    }

    const outData = new Uint8Array(length);
    let curr_size = 0;
    let flags: number;
    let flag: boolean;
    let b1: number,
      bt: number,
      b2: number,
      b3: number,
      len: number,
      disp: number,
      cdest: number;

    while (curr_size < outData.length) {
      flags = data[offset++] & 0xff;

      for (let i = 0; i < 8 && curr_size < outData.length; i++) {
        flag = (flags & (0x80 >> i)) > 0;
        if (flag) {
          b1 = data[offset++] & 0xff;

          switch (b1 >> 4) {
            case 0:
              // ab cd ef => len = bc + 0x11, disp = def
              len = b1 << 4;
              bt = data[offset++] & 0xff;
              len |= bt >> 4;
              len += 0x11;

              disp = (bt & 0x0f) << 8;
              b2 = data[offset++] & 0xff;
              disp |= b2;
              break;

            case 1:
              // ab cd ef gh => len = bcde + 0x111, disp = fgh
              bt = data[offset++] & 0xff;
              b2 = data[offset++] & 0xff;
              b3 = data[offset++] & 0xff;

              len = (b1 & 0xf) << 12;
              len |= bt << 4;
              len |= b2 >> 4;
              len += 0x111;
              disp = (b2 & 0x0f) << 8;
              disp |= b3;
              break;

            default:
              // ab cd => len = a + 1, disp = bcd
              len = (b1 >> 4) + 1;
              disp = (b1 & 0x0f) << 8;
              b2 = data[offset++] & 0xff;
              disp |= b2;
              break;
          }

          if (disp > curr_size) {
            throw new Error("Cannot go back more than already written");
          }

          cdest = curr_size;
          for (let j = 0; j < len && curr_size < outData.length; j++) {
            outData[curr_size++] = outData[cdest - disp - 1 + j];
          }

          if (curr_size > outData.length) break;
        } else {
          outData[curr_size++] = data[offset++];
          if (curr_size > outData.length) break;
        }
      }
    }
    return outData;
  }
}
