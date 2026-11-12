/*----------------------------------------------------------------------------*/
/*--  amx.ts - class for handling AMX script archives                       --*/
/*--                                                                        --*/
/*--  Contains code based on "pk3DS", copyright (C) Kaphotics               --*/
/*--  Contains code based on "pkNX", copyright (C) Kaphotics                --*/
/*--  Contains code based on "poketools", copyright (C) FireyFly            --*/
/*--  Additional contributions by the UPR-ZX team                           --*/
/*--                                                                        --*/
/*--  Ported to TypeScript by UPR-ZX Team under the terms of the GPL:       --*/
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

import { FileFunctions } from "../utils/file-functions.js";

const AMX_MAGIC = 0x0a0af1e0;

export class AMX {
  public decData: Uint8Array;
  public scriptOffset: number = 0;

  private length: number = 0;
  private scriptInstrStart: number = 0;
  private scriptMovementStart: number = 0;
  private finalOffset: number = 0;
  private allocatedMemory: number = 0;
  private compLength: number = 0;
  private ptrOffset: number = 0;
  private ptrCount: number = 0;
  private extraData: Uint8Array;

  /**
   * Construct from raw AMX data, optionally selecting a specific script
   * by index within the data.
   */
  constructor(data: Uint8Array, scriptNum?: number) {
    this.decData = new Uint8Array(0);
    this.extraData = new Uint8Array(0);

    if (scriptNum !== undefined) {
      let found = 0;
      for (let i = 0; i < data.length - 3; i++) {
        const val = FileFunctions.readFullInt(data, i);
        if (val === AMX_MAGIC) {
          if (found === scriptNum) {
            const len = FileFunctions.readFullInt(data, i - 4);
            this.readHeaderAndDecompress(data.subarray(i - 4, i - 4 + len));
            this.scriptOffset = i - 4;
            break;
          } else {
            found++;
          }
        }
      }
    } else {
      this.readHeaderAndDecompress(data);
    }
  }

  private readHeaderAndDecompress(encData: Uint8Array): void {
    this.length = FileFunctions.readFullInt(encData, 0);
    const magic = FileFunctions.readFullInt(encData, 4);
    if (magic !== AMX_MAGIC) {
      throw new Error("Invalid AMX magic");
    }

    this.ptrOffset = FileFunctions.read2ByteInt(encData, 8);
    this.ptrCount = FileFunctions.read2ByteInt(encData, 0x0a);

    this.scriptInstrStart = FileFunctions.readFullInt(encData, 0x0c);
    this.scriptMovementStart = FileFunctions.readFullInt(encData, 0x10);
    this.finalOffset = FileFunctions.readFullInt(encData, 0x14);
    this.allocatedMemory = FileFunctions.readFullInt(encData, 0x18);

    this.compLength = this.length - this.scriptInstrStart;
    const compressedBytes = encData.subarray(
      this.scriptInstrStart,
      this.length
    );
    const decompLength = this.finalOffset - this.scriptInstrStart;

    this.decData = AMX.decompressBytes(compressedBytes, decompLength);
    this.extraData = new Uint8Array(
      encData.subarray(0x1c, this.scriptInstrStart)
    );
  }

  /** Credit to FireyFly */
  private static decompressBytes(
    data: Uint8Array,
    length: number
  ): Uint8Array {
    const code = new Uint8Array(length);
    let i = 0;
    let j = 0;
    let x = 0;
    let f = 0;
    while (i < code.length) {
      const b = data[f++];
      const v = b & 0x7f;
      if (++j === 1) {
        x = (((v >>> 6 === 0 ? 1 : 0) - 1) << 6) | v;
      } else {
        x = (x << 7) | (v & 0xff);
      }
      if ((b & 0x80) !== 0) continue;
      code[i++] = x & 0xff;
      code[i++] = (x >>> 8) & 0xff;
      code[i++] = (x >>> 16) & 0xff;
      code[i++] = (x >>> 24) & 0xff;
      j = 0;
    }
    return code;
  }

  getBytes(): Uint8Array {
    const compressed = this.compressScript(this.decData);
    const totalSize =
      0x1c + this.extraData.length + compressed.length;

    const result = new Uint8Array(totalSize);
    const view = new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength
    );

    view.setInt32(0, totalSize, true); // length (updated to actual size)
    view.setInt32(4, AMX_MAGIC, true);
    view.setInt16(8, this.ptrOffset, true);
    view.setInt16(10, this.ptrCount, true);
    view.setInt32(0x0c, this.scriptInstrStart, true);
    view.setInt32(0x10, this.scriptMovementStart, true);
    view.setInt32(0x14, this.finalOffset, true);
    view.setInt32(0x18, this.allocatedMemory, true);

    result.set(this.extraData, 0x1c);
    result.set(compressed, 0x1c + this.extraData.length);

    return result;
  }

  private compressScript(data: Uint8Array): Uint8Array {
    if (data.length % 4 !== 0) {
      throw new Error("Script data length must be a multiple of 4");
    }
    const view = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength
    );
    const chunks: Uint8Array[] = [];
    let pos = 0;

    while (pos < data.length) {
      const instructionTemp = view.getInt32(pos, true);
      const instruction = BigInt(instructionTemp) & 0xffffffffn;
      const sign = (instruction & 0x80000000n) > 0n;

      const shadowTemp = sign ? ~instructionTemp : instructionTemp;
      let shadow = BigInt(shadowTemp) & 0xffffffffn;
      let instr = instruction;

      const bytes: number[] = [];
      do {
        const least7 = Number(instr & 0x7fn);
        let byteVal = least7;
        if (bytes.length > 0) {
          byteVal |= 0x80;
        }
        bytes.push(byteVal & 0xff);
        instr >>= 7n;
        shadow >>= 7n;
      } while (shadow !== 0n);

      if (bytes.length < 5) {
        const signBit = sign ? 0x40 : 0x00;
        if ((bytes[bytes.length - 1] & 0x40) !== signBit) {
          bytes.push(sign ? 0xff : 0x80);
        }
      }

      // Reverse for endianness
      bytes.reverse();

      chunks.push(new Uint8Array(bytes));
      pos += 4;
    }

    // Concatenate all chunks
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
}
