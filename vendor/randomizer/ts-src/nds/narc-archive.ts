/*----------------------------------------------------------------------------*/
/*--  narc-archive.ts - class for packing/unpacking NARC archives           --*/
/*--                                                                        --*/
/*--  Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team          --*/
/*--  Originally part of "Universal Pokemon Randomizer" by Dabomstew        --*/
/*--  Pokemon and any associated names and the like are                     --*/
/*--  trademark and (C) Nintendo 1996-2020.                                 --*/
/*--                                                                        --*/
/*--  The custom code written here is licensed under the terms of the GPL:  --*/
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

export class NARCArchive {
  private filenames: (string | null)[] = [];
  files: Uint8Array[] = [];
  private hasFilenames = false;

  constructor();
  constructor(data: Uint8Array);
  constructor(data?: Uint8Array) {
    if (data === undefined) {
      // creates a new empty NARC with no filenames by default
      return;
    }

    const frames = this.readNitroFrames(data);
    if (!frames.has("FATB") || !frames.has("FNTB") || !frames.has("FIMG")) {
      throw new Error("Not a valid narc file");
    }

    // File contents
    const fatbframe = frames.get("FATB")!;
    const fimgframe = frames.get("FIMG")!;
    const fileCount = readLong(fatbframe, 0);
    for (let i = 0; i < fileCount; i++) {
      const startOffset = readLong(fatbframe, 4 + i * 8);
      const endOffset = readLong(fatbframe, 8 + i * 8);
      const length = endOffset - startOffset;
      const thisFile = new Uint8Array(length);
      thisFile.set(fimgframe.subarray(startOffset, startOffset + length));
      this.files.push(thisFile);
    }

    // Filenames?
    const fntbframe = frames.get("FNTB")!;
    const unk1 = readLong(fntbframe, 0);
    if (unk1 === 8) {
      // Filenames exist
      this.hasFilenames = true;
      let offset = 8;
      for (let i = 0; i < fileCount; i++) {
        const fnLength = fntbframe[offset] & 0xff;
        offset++;
        const filenameBytes = fntbframe.subarray(offset, offset + fnLength);
        const filename = new TextDecoder("ascii").decode(filenameBytes);
        this.filenames.push(filename);
        offset += fnLength;
      }
    } else {
      this.hasFilenames = false;
      for (let i = 0; i < fileCount; i++) {
        this.filenames.push(null);
      }
    }
  }

  getBytes(): Uint8Array {
    // Get bytes required for FIMG frame
    let bytesRequired = 0;
    for (const file of this.files) {
      bytesRequired += Math.ceil(file.length / 4.0) * 4;
    }

    // FIMG frame & FATB frame build
    // 4 for numentries, 8*size for entries, 8 for nitro header
    const fatbFrame = new Uint8Array(4 + this.files.length * 8 + 8);
    // bytesRequired + 8 for nitro header
    const fimgFrame = new Uint8Array(bytesRequired + 8);

    // Nitro headers
    fatbFrame[0] = 0x42; // 'B'
    fatbFrame[1] = 0x54; // 'T'
    fatbFrame[2] = 0x41; // 'A'
    fatbFrame[3] = 0x46; // 'F'
    writeLong(fatbFrame, 4, fatbFrame.length);

    fimgFrame[0] = 0x47; // 'G'
    fimgFrame[1] = 0x4d; // 'M'
    fimgFrame[2] = 0x49; // 'I'
    fimgFrame[3] = 0x46; // 'F'
    writeLong(fimgFrame, 4, fimgFrame.length);

    let offset = 0;
    writeLong(fatbFrame, 8, this.files.length);
    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];
      const bytesRequiredForFile = Math.ceil(file.length / 4.0) * 4;
      fimgFrame.set(file, offset + 8);
      for (let filler = file.length; filler < bytesRequiredForFile; filler++) {
        fimgFrame[offset + 8 + filler] = 0xff;
      }
      writeLong(fatbFrame, 12 + i * 8, offset);
      writeLong(fatbFrame, 16 + i * 8, offset + file.length);
      offset += bytesRequiredForFile;
    }

    // FNTB Frame
    let bytesForFNTBFrame = 16;
    if (this.hasFilenames) {
      for (const filename of this.filenames) {
        bytesForFNTBFrame +=
          new TextEncoder().encode(filename!).length + 1;
      }
    }
    const fntbFrame = new Uint8Array(bytesForFNTBFrame);

    fntbFrame[0] = 0x42; // 'B'
    fntbFrame[1] = 0x54; // 'T'
    fntbFrame[2] = 0x4e; // 'N'
    fntbFrame[3] = 0x46; // 'F'
    writeLong(fntbFrame, 4, fntbFrame.length);

    if (this.hasFilenames) {
      writeLong(fntbFrame, 8, 8);
      writeLong(fntbFrame, 12, 0x10000);
      let fntbOffset = 16;
      for (const filename of this.filenames) {
        const fntbFilename = new TextEncoder().encode(filename!);
        fntbFrame[fntbOffset] = fntbFilename.length;
        fntbFrame.set(fntbFilename, fntbOffset + 1);
        fntbOffset += 1 + fntbFilename.length;
      }
    } else {
      writeLong(fntbFrame, 8, 4);
      writeLong(fntbFrame, 12, 0x10000);
    }

    // Now for the actual Nitro file
    const nitrolength =
      16 + fatbFrame.length + fntbFrame.length + fimgFrame.length;
    const nitroFile = new Uint8Array(nitrolength);
    nitroFile[0] = 0x4e; // 'N'
    nitroFile[1] = 0x41; // 'A'
    nitroFile[2] = 0x52; // 'R'
    nitroFile[3] = 0x43; // 'C'
    writeWord(nitroFile, 4, 0xfffe);
    writeWord(nitroFile, 6, 0x0100);
    writeLong(nitroFile, 8, nitrolength);
    writeWord(nitroFile, 12, 0x10);
    writeWord(nitroFile, 14, 3);
    nitroFile.set(fatbFrame, 16);
    nitroFile.set(fntbFrame, 16 + fatbFrame.length);
    nitroFile.set(
      fimgFrame,
      16 + fatbFrame.length + fntbFrame.length,
    );

    return nitroFile;
  }

  private readNitroFrames(data: Uint8Array): Map<string, Uint8Array> {
    // Read the number of frames
    const frameCount = readWord(data, 0x0e);

    // each frame
    let offset = 0x10;
    const frames = new Map<string, Uint8Array>();
    for (let i = 0; i < frameCount; i++) {
      // Read magic in reversed order (little-endian stored as reversed ASCII)
      const magic = new Uint8Array([
        data[offset + 3],
        data[offset + 2],
        data[offset + 1],
        data[offset],
      ]);
      const magicS = new TextDecoder("ascii").decode(magic);

      let frame_size = readLong(data, offset + 4);
      // Patch for BB/VW and other DS hacks which don't update
      // the size of their expanded NARCs correctly
      if (i === frameCount - 1 && offset + frame_size < data.length) {
        frame_size = data.length - offset;
      }
      const frame = new Uint8Array(frame_size - 8);
      frame.set(data.subarray(offset + 8, offset + frame_size));
      frames.set(magicS, frame);
      offset += frame_size;
    }
    return frames;
  }
}

function readWord(data: Uint8Array, offset: number): number {
  return (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
}

function readLong(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16) |
      ((data[offset + 3] & 0xff) << 24)) >>>
    0
  );
}

function writeWord(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function writeLong(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}
