/*----------------------------------------------------------------------------*/
/*--  garc-archive.ts - class for packing/unpacking GARC archives           --*/
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

const VER_4 = 0x0400;
const VER_6 = 0x0600;
const GARC_HEADER_SIZE_4 = 0x1c;
const GARC_HEADER_SIZE_6 = 0x24;
const GARC_MAGIC = "CRAG";
const FATO_MAGIC = "OTAF";
const FATB_MAGIC = "BTAF";
const FIMB_MAGIC = "BMIF";

interface GARCFrame {
  headerSize: number;
  endianness: number;
  version: number;
  dataOffset: number;
  fileSize: number;
  contentLargestPadded: number;
  contentLargestUnpadded: number;
  contentPadToNearest: number;
}

interface FATOFrame {
  headerSize: number;
  entryCount: number;
  padding: number;
  entries: number[];
}

interface FATBEntry {
  vector: number;
  isFolder: boolean;
  subEntries: Map<number, FATBSubEntry>;
}

interface FATBSubEntry {
  start: number;
  end: number;
  length: number;
}

interface FATBFrame {
  headerSize: number;
  fileCount: number;
  entries: FATBEntry[];
}

interface FIMBFrame {
  headerSize: number;
  dataSize: number;
  files: Map<number, Uint8Array>[];
}

function readString(buf: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(buf.getUint8(offset + i));
  }
  return s;
}

export class GARCArchive {
  public files: Map<number, Uint8Array>[] = [];
  private isCompressed: Map<number, boolean> = new Map();
  private version: number = 0;
  private skipDecompression: boolean = true;

  private garc!: GARCFrame;
  private fato!: FATOFrame;
  private fatb!: FATBFrame;
  private fimb!: FIMBFrame;

  constructor();
  constructor(data: Uint8Array, skipDecompression: boolean);
  constructor(data?: Uint8Array, skipDecompression?: boolean) {
    if (data !== undefined) {
      this.skipDecompression = skipDecompression ?? true;
      const success = this.readFrames(data);
      if (!success) {
        throw new Error("Invalid GARC file");
      }
      this.files = this.fimb.files;
    }
  }

  private readFrames(data: Uint8Array): boolean {
    if (data.length <= 0) {
      return false;
    }
    const buf = Buffer.from(data);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let pos = 0;

    // GARC header
    const magic = readString(view, pos, 4);
    pos += 4;
    if (magic !== GARC_MAGIC) {
      return false;
    }

    this.garc = {
      headerSize: 0,
      endianness: 0,
      version: 0,
      dataOffset: 0,
      fileSize: 0,
      contentLargestPadded: 0,
      contentLargestUnpadded: 0,
      contentPadToNearest: 4,
    };

    this.garc.headerSize = view.getInt32(pos, true);
    pos += 4;
    this.garc.endianness = view.getInt16(pos, true);
    pos += 2;
    this.garc.version = view.getInt16(pos, true);
    pos += 2;
    const frameCount = view.getInt32(pos, true);
    pos += 4;
    if (frameCount !== 4) {
      return false;
    }
    this.garc.dataOffset = view.getInt32(pos, true);
    pos += 4;
    this.garc.fileSize = view.getInt32(pos, true);
    pos += 4;

    if (this.garc.version === VER_4) {
      this.garc.contentLargestUnpadded = view.getInt32(pos, true);
      pos += 4;
      this.garc.contentPadToNearest = 4;
      this.version = 4;
    } else if (this.garc.version === VER_6) {
      this.garc.contentLargestPadded = view.getInt32(pos, true);
      pos += 4;
      this.garc.contentLargestUnpadded = view.getInt32(pos, true);
      pos += 4;
      this.garc.contentPadToNearest = view.getInt32(pos, true);
      pos += 4;
      this.version = 6;
    } else {
      return false;
    }

    // FATO header
    const fatoMagic = readString(view, pos, 4);
    pos += 4;
    if (fatoMagic !== FATO_MAGIC) {
      return false;
    }

    this.fato = {
      headerSize: 0,
      entryCount: 0,
      padding: 0,
      entries: [],
    };
    this.fato.headerSize = view.getInt32(pos, true);
    pos += 4;
    this.fato.entryCount = view.getInt16(pos, true);
    pos += 2;
    this.fato.padding = view.getInt16(pos, true);
    pos += 2;
    this.fato.entries = new Array(this.fato.entryCount);
    for (let i = 0; i < this.fato.entryCount; i++) {
      this.fato.entries[i] = view.getInt32(pos, true);
      pos += 4;
    }

    // FATB header
    const fatbMagic = readString(view, pos, 4);
    pos += 4;
    if (fatbMagic !== FATB_MAGIC) {
      return false;
    }

    this.fatb = {
      headerSize: 0,
      fileCount: 0,
      entries: [],
    };
    this.fatb.headerSize = view.getInt32(pos, true);
    pos += 4;
    this.fatb.fileCount = view.getInt32(pos, true);
    pos += 4;
    this.fatb.entries = new Array(this.fatb.fileCount);
    for (let i = 0; i < this.fatb.fileCount; i++) {
      const entry: FATBEntry = {
        vector: view.getInt32(pos, true),
        isFolder: false,
        subEntries: new Map(),
      };
      pos += 4;
      let bitVector = entry.vector;
      let counter = 0;
      for (let b = 0; b < 32; b++) {
        const exists = (bitVector & 1) === 1;
        bitVector >>>= 1;
        if (!exists) continue;
        const subEntry: FATBSubEntry = {
          start: view.getInt32(pos, true),
          end: view.getInt32(pos + 4, true),
          length: view.getInt32(pos + 8, true),
        };
        pos += 12;
        entry.subEntries.set(b, subEntry);
        counter++;
      }
      entry.isFolder = counter > 1;
      this.fatb.entries[i] = entry;
    }

    // FIMB header
    const fimbMagic = readString(view, pos, 4);
    pos += 4;
    if (fimbMagic !== FIMB_MAGIC) {
      return false;
    }

    this.fimb = {
      headerSize: 0,
      dataSize: 0,
      files: [],
    };
    this.fimb.headerSize = view.getInt32(pos, true);
    pos += 4;
    this.fimb.dataSize = view.getInt32(pos, true);
    pos += 4;

    for (let i = 0; i < this.fatb.fileCount; i++) {
      const entry = this.fatb.entries[i];
      const files: Map<number, Uint8Array> = new Map();
      for (const [k, subEntry] of entry.subEntries) {
        const fileStart = this.garc.dataOffset + subEntry.start;
        const compressed =
          data[fileStart] === 0x11 && !this.skipDecompression;
        const file = new Uint8Array(subEntry.length);
        file.set(data.subarray(fileStart, fileStart + subEntry.length));
        if (compressed) {
          // BLZ decompression not implemented in TS port; store raw
          files.set(k, file);
          this.isCompressed.set(i, true);
        } else {
          files.set(k, file);
          this.isCompressed.set(i, false);
        }
      }
      this.fimb.files.push(files);
    }
    return true;
  }

  updateFiles(files: Map<number, Uint8Array>[]): void {
    this.fimb.files = files;
  }

  getBytes(): Uint8Array {
    const garcHeaderSize =
      this.garc.version === VER_4 ? GARC_HEADER_SIZE_4 : GARC_HEADER_SIZE_6;

    // Build FIMB payload and collect metadata for FATO/FATB
    const fimbChunks: Uint8Array[] = [];
    let fimbPayloadSize = 0;

    const fatbEntries: {
      bitVector: number;
      fimbStartOffset: number;
      fimbEndOffset: number;
      totalLength: number;
    }[] = [];

    const fatoEntries: number[] = [];

    let largestSize = 0;
    let largestPadded = 0;

    // We need to compute FATB size first to know offsets for FATO entries
    // FATB header = 12 bytes, each entry = 4 (vector) + n*12 (subentries)
    let fatbBodySize = 0;
    for (let i = 0; i < this.fimb.files.length; i++) {
      const directory = this.fimb.files[i];
      fatbBodySize += 4; // vector
      fatbBodySize += directory.size * 12; // subentries
    }
    const fatbTotalSize = 12 + fatbBodySize;

    let fimbOffset = 0;
    let fatbOffset = 0; // tracks position within FATB body (after 12-byte header)

    for (let i = 0; i < this.fimb.files.length; i++) {
      const directory = this.fimb.files[i];
      let bitVector = 0;
      let totalLength = 0;

      const startOffset = fimbPayloadSize;

      for (const [k, file] of directory) {
        bitVector |= 1 << k;
        // Note: compression not re-applied in TS port
        fimbChunks.push(file);
        totalLength += file.length;
        fimbPayloadSize += file.length;
      }

      let paddingRequired = totalLength % this.garc.contentPadToNearest;
      if (paddingRequired !== 0) {
        paddingRequired = this.garc.contentPadToNearest - paddingRequired;
      }

      if (totalLength > largestSize) {
        largestSize = totalLength;
      }
      if (totalLength + paddingRequired > largestPadded) {
        largestPadded = totalLength + paddingRequired;
      }

      if (paddingRequired > 0) {
        const paddingBuf = new Uint8Array(paddingRequired);
        paddingBuf.fill(this.fato.padding & 0xff);
        fimbChunks.push(paddingBuf);
        fimbPayloadSize += paddingRequired;
      }

      fatoEntries.push(fatbOffset);
      fatbEntries.push({
        bitVector,
        fimbStartOffset: fimbOffset,
        fimbEndOffset: fimbPayloadSize,
        totalLength,
      });

      fatbOffset += 4 + directory.size * 12; // move past this entry in FATB
      fimbOffset = fimbPayloadSize;
    }

    // Build FATO buffer
    const fatoHeaderSize = 12 + this.fato.entryCount * 4;
    const fatoBuf = Buffer.alloc(fatoHeaderSize);
    fatoBuf.write(FATO_MAGIC, 0, 4, "ascii");
    fatoBuf.writeInt32LE(fatoHeaderSize, 4);
    fatoBuf.writeInt16LE(this.fato.entryCount, 8);
    fatoBuf.writeInt16LE(this.fato.padding, 10);
    for (let i = 0; i < this.fato.entryCount; i++) {
      fatoBuf.writeInt32LE(fatoEntries[i], 12 + i * 4);
    }

    // Build FATB buffer
    const fatbBuf = Buffer.alloc(fatbTotalSize);
    fatbBuf.write(FATB_MAGIC, 0, 4, "ascii");
    fatbBuf.writeInt32LE(fatbTotalSize, 4);
    fatbBuf.writeInt32LE(this.fatb.fileCount, 8);
    let fatbPos = 12;
    for (const entry of fatbEntries) {
      fatbBuf.writeInt32LE(entry.bitVector, fatbPos);
      fatbPos += 4;
      fatbBuf.writeInt32LE(entry.fimbStartOffset, fatbPos);
      fatbPos += 4;
      fatbBuf.writeInt32LE(entry.fimbEndOffset, fatbPos);
      fatbPos += 4;
      fatbBuf.writeInt32LE(entry.totalLength, fatbPos);
      fatbPos += 4;
    }

    // Build FIMB header
    const fimbHeaderSize = 12;
    const fimbHeaderBuf = Buffer.alloc(fimbHeaderSize);
    fimbHeaderBuf.write(FIMB_MAGIC, 0, 4, "ascii");
    fimbHeaderBuf.writeInt32LE(fimbHeaderSize, 4);
    fimbHeaderBuf.writeInt32LE(fimbPayloadSize, 8);

    // Build GARC header
    const dataOffset =
      garcHeaderSize + fatoHeaderSize + fatbTotalSize + fimbHeaderSize;
    const garcBuf = Buffer.alloc(garcHeaderSize);
    garcBuf.write(GARC_MAGIC, 0, 4, "ascii");
    garcBuf.writeInt32LE(garcHeaderSize, 4);
    garcBuf.writeUInt16LE(0xfeff, 8);
    garcBuf.writeUInt16LE(
      this.version === 4 ? VER_4 : VER_6,
      10
    );
    garcBuf.writeInt32LE(4, 12);
    garcBuf.writeInt32LE(dataOffset, 16);
    garcBuf.writeInt32LE(dataOffset + fimbOffset, 20);
    if (this.garc.version === VER_4) {
      garcBuf.writeInt32LE(largestSize, 24);
    } else if (this.garc.version === VER_6) {
      garcBuf.writeInt32LE(largestPadded, 24);
      garcBuf.writeInt32LE(largestSize, 28);
      garcBuf.writeInt32LE(this.garc.contentPadToNearest, 32);
    }

    // Concatenate everything
    const totalSize = dataOffset + fimbPayloadSize;
    const result = new Uint8Array(totalSize);
    result.set(new Uint8Array(garcBuf.buffer, garcBuf.byteOffset, garcBuf.length), 0);
    let offset = garcHeaderSize;
    result.set(new Uint8Array(fatoBuf.buffer, fatoBuf.byteOffset, fatoBuf.length), offset);
    offset += fatoHeaderSize;
    result.set(new Uint8Array(fatbBuf.buffer, fatbBuf.byteOffset, fatbBuf.length), offset);
    offset += fatbTotalSize;
    result.set(new Uint8Array(fimbHeaderBuf.buffer, fimbHeaderBuf.byteOffset, fimbHeaderBuf.length), offset);
    offset += fimbHeaderSize;
    for (const chunk of fimbChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  getFile(index: number, subIndex: number = 0): Uint8Array {
    return this.fimb.files[index].get(subIndex)!;
  }

  setFile(index: number, data: Uint8Array): void {
    this.fimb.files[index].set(0, data);
  }

  getDirectory(index: number): Map<number, Uint8Array> {
    return this.fimb.files[index];
  }

  get fileCount(): number {
    return this.fimb.files.length;
  }

  get garcVersion(): number {
    return this.version;
  }
}
