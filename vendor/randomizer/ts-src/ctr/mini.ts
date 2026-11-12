/*----------------------------------------------------------------------------*/
/*--  mini.ts - class for packing/unpacking Mini archives                   --*/
/*--                                                                        --*/
/*--  Code based on "pk3DS", copyright (C) Kaphotics                        --*/
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

export class Mini {
  static packMini(fileData: Uint8Array[], identifier: string): Uint8Array {
    const headerBytes = new Uint8Array(4);
    headerBytes[0] = identifier.charCodeAt(0);
    headerBytes[1] = identifier.charCodeAt(1);
    // Write count as LE 16-bit
    headerBytes[2] = fileData.length & 0xff;
    headerBytes[3] = (fileData.length >> 8) & 0xff;

    const count = fileData.length;
    const dataOffset = 4 + 4 + count * 4;

    const offsetEntries: number[] = [];
    const dataChunks: Uint8Array[] = [];
    let currentDataSize = 0;

    for (let i = 0; i < count; i++) {
      const fileOffset = currentDataSize + dataOffset;
      offsetEntries.push(fileOffset);
      dataChunks.push(fileData[i]);
      currentDataSize += fileData[i].length;
      // Pad with zeroes until len % 4 == 0
      const padding = (4 - (currentDataSize % 4)) % 4;
      if (padding > 0) {
        dataChunks.push(new Uint8Array(padding));
        currentDataSize += padding;
      }
    }
    // Cap offset
    offsetEntries.push(currentDataSize + dataOffset);

    // Build offset map
    const offsetMap = new Uint8Array((count + 1) * 4);
    for (let i = 0; i <= count; i++) {
      FileFunctions.writeFullInt(offsetMap, i * 4, offsetEntries[i]);
    }

    // Assemble final output
    const totalSize = dataOffset + currentDataSize;
    const result = new Uint8Array(totalSize);
    result.set(headerBytes, 0);
    result.set(offsetMap, 4);
    let pos = dataOffset;
    for (const chunk of dataChunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  static unpackMini(
    fileData: Uint8Array,
    identifier: string
  ): Uint8Array[] | null {
    if (!fileData || fileData.length < 4) {
      return null;
    }

    if (
      identifier.charCodeAt(0) !== fileData[0] ||
      identifier.charCodeAt(1) !== fileData[1]
    ) {
      return null;
    }

    const count = FileFunctions.read2ByteInt(fileData, 2);
    let ctr = 4;
    let start = FileFunctions.readFullInt(fileData, ctr);
    ctr += 4;
    const returnData: Uint8Array[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const end = FileFunctions.readFullInt(fileData, ctr);
      ctr += 4;
      const len = end - start;
      const data = new Uint8Array(len);
      data.set(fileData.subarray(start, start + len));
      returnData[i] = data;
      start = end;
    }
    return returnData;
  }
}
