/*----------------------------------------------------------------------------*/
/*--  nds-rom.ts - base class for opening/saving NDS ROMs                   --*/
/*--  Code based on "Nintendo DS rom tool", copyright (C) DevkitPro         --*/
/*--  Original Code by Rafael Vuijk, Dave Murphy, Alexei Karpenko           --*/
/*--                                                                        --*/
/*--  Ported to Java by Dabomstew under the terms of the GPL:               --*/
/*--  Ported to TypeScript from Java.                                       --*/
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

import * as fs from "fs";
import * as path from "path";
import { FileFunctions } from "../utils/file-functions";
import { SysConstants } from "../utils/sys-constants";
import { crc16Calculate } from "./crc16";
import { NDSFile } from "./nds-file";
import { NDSY9Entry } from "./nds-y9-entry";
import { BLZCoder } from "../compressors/blz-coder";
import { RomFunctions } from "../utils/rom-functions";

const ARM9_ALIGN = 0x1ff;
const ARM7_ALIGN = 0x1ff;
const FNT_ALIGN = 0x1ff;
const FAT_ALIGN = 0x1ff;
const BANNER_ALIGN = 0x1ff;
const FILE_ALIGN = 0x1ff;

export class NDSRom {
  private romCode = "";
  private version = 0;
  private romFilename: string;
  private baseRomFd: number | null = null;
  private romOpen = false;
  private files = new Map<string, NDSFile>();
  private filesByID = new Map<number, NDSFile>();
  private arm9overlaysByFileID = new Map<number, NDSY9Entry>();
  private arm9overlays: NDSY9Entry[] = [];
  private fat: Uint8Array = new Uint8Array(0);
  private _tmpFolder = "";
  private _writingEnabled = false;
  private arm9_open = false;
  private arm9_changed = false;
  private arm9_has_footer = false;
  private arm9_compressed = false;
  private arm9_ramoffset = 0;
  private arm9_szoffset = 0;
  private arm9_footer: Uint8Array = new Uint8Array(0);
  private arm9_ramstored: Uint8Array | null = null;
  private originalArm9CRC = 0;

  constructor(filename: string) {
    this.romFilename = filename;
    this.baseRomFd = fs.openSync(filename, "r");
    this.romOpen = true;

    // TMP folder
    const rawFilename = path.basename(filename);
    let dataFolder =
      "tmp_" + rawFilename.substring(0, rawFilename.lastIndexOf("."));
    dataFolder = dataFolder.replace(/[^A-Za-z0-9_]+/g, "");
    const tmpFolderPath = path.join(SysConstants.ROOT_PATH, dataFolder);
    try {
      fs.mkdirSync(tmpFolderPath, { recursive: true });
      // Test if writable
      fs.accessSync(tmpFolderPath, fs.constants.W_OK);
      this._writingEnabled = true;
      this._tmpFolder = tmpFolderPath + path.sep;
    } catch {
      this._writingEnabled = false;
    }

    this.readFileSystem();
    this.arm9_open = false;
    this.arm9_changed = false;
    this.arm9_ramstored = null;
  }

  reopenROM(): void {
    if (!this.romOpen) {
      this.baseRomFd = fs.openSync(this.romFilename, "r");
      this.romOpen = true;
    }
  }

  closeROM(): void {
    if (this.romOpen && this.baseRomFd !== null) {
      fs.closeSync(this.baseRomFd);
      this.baseRomFd = null;
      this.romOpen = false;
    }
  }

  getBaseRomFd(): number {
    if (this.baseRomFd === null) {
      throw new Error("ROM is not open");
    }
    return this.baseRomFd;
  }

  private readFileSystem(): void {
    const fd = this.getBaseRomFd();

    // read rom code
    const sig = new Uint8Array(4);
    fs.readSync(fd, sig, 0, 4, 0x0c);
    this.romCode = new TextDecoder("ascii").decode(sig);

    // read version
    const vbuf = new Uint8Array(1);
    fs.readSync(fd, vbuf, 0, 1, 0x1e);
    this.version = vbuf[0];

    // arm9 ram offset
    this.arm9_ramoffset = readFromFd(fd, 0x28, 4);

    // FNT/FAT offsets
    const fntOffset = readFromFd(fd, 0x40, 4);
    // fntSize at 0x44 not needed
    const fatOffset = readFromFd(fd, 0x48, 4);
    const fatSize = readFromFd(fd, 0x4c, 4);

    // Read full FAT table
    this.fat = new Uint8Array(fatSize);
    fs.readSync(fd, this.fat, 0, fatSize, fatOffset);

    const directoryPaths = new Map<number, string>();
    directoryPaths.set(0xf000, "");
    const dircount = readFromFd(fd, fntOffset + 0x6, 2);
    this.files = new Map();
    this.filesByID = new Map();

    // read fnt table
    const subTableOffsets: number[] = new Array(dircount);
    const firstFileIDs: number[] = new Array(dircount);
    const parentDirIDs: number[] = new Array(dircount);

    // Read the entire FNT main table at once
    const fntMainSize = dircount * 8;
    const fntMain = new Uint8Array(fntMainSize);
    fs.readSync(fd, fntMain, 0, fntMainSize, fntOffset);

    for (let i = 0; i < dircount && i < 0x1000; i++) {
      subTableOffsets[i] = readFromByteArr(fntMain, i * 8, 4) + fntOffset;
      firstFileIDs[i] = readFromByteArr(fntMain, i * 8 + 4, 2);
      parentDirIDs[i] = readFromByteArr(fntMain, i * 8 + 6, 2);
    }

    // get dirnames
    const directoryNames: (string | null)[] = new Array(dircount).fill(null);
    const filenames = new Map<number, string>();
    const fileDirectories = new Map<number, number>();
    for (let i = 0; i < dircount && i < 0x1000; i++) {
      this.firstPassDirectory(
        fd,
        i,
        subTableOffsets[i],
        firstFileIDs[i],
        directoryNames,
        filenames,
        fileDirectories,
      );
    }

    // get full dirnames
    for (let i = 1; i < dircount && i < 0x1000; i++) {
      const dirname = directoryNames[i];
      if (dirname !== null) {
        const parts: string[] = [];
        let curDir = i;
        let current: string | null = dirname;
        while (current !== null && current.length > 0) {
          parts.unshift(current);
          const parentDir = parentDirIDs[curDir];
          if (parentDir >= 0xf001 && parentDir <= 0xffff) {
            curDir = parentDir - 0xf000;
            current = directoryNames[curDir];
          } else {
            break;
          }
        }
        directoryPaths.set(i + 0xf000, parts.join("/"));
      } else {
        directoryPaths.set(i + 0xf000, "");
      }
    }

    // parse files
    for (const [fileID, filename] of filenames) {
      const directory = fileDirectories.get(fileID)!;
      const dirPath = directoryPaths.get(directory + 0xf000) || "";
      const fullFilename = dirPath.length > 0 ? dirPath + "/" + filename : filename;
      const nf = new NDSFile(this);
      const start = readFromByteArr(this.fat, fileID * 8, 4);
      const end = readFromByteArr(this.fat, fileID * 8 + 4, 4);
      nf.offset = start;
      nf.size = end - start;
      nf.fullPath = fullFilename;
      nf.fileID = fileID;
      this.files.set(fullFilename, nf);
      this.filesByID.set(fileID, nf);
    }

    // arm9 overlays
    const arm9_ovl_table_offset = readFromFd(fd, 0x50, 4);
    const arm9_ovl_table_size = readFromFd(fd, 0x54, 4);
    const arm9_ovl_count = (arm9_ovl_table_size / 32) | 0;
    const y9table = new Uint8Array(arm9_ovl_table_size);
    this.arm9overlays = new Array(arm9_ovl_count);
    this.arm9overlaysByFileID = new Map();

    if (arm9_ovl_table_size > 0) {
      fs.readSync(fd, y9table, 0, arm9_ovl_table_size, arm9_ovl_table_offset);
    }

    // parse overlays
    for (let i = 0; i < arm9_ovl_count; i++) {
      const overlay = new NDSY9Entry(this);
      const fileID = readFromByteArr(y9table, i * 32 + 24, 4);
      const start = readFromByteArr(this.fat, fileID * 8, 4);
      const end = readFromByteArr(this.fat, fileID * 8 + 4, 4);
      overlay.offset = start;
      overlay.size = end - start;
      overlay.original_size = end - start;
      overlay.fileID = fileID;
      overlay.overlay_id = i;
      overlay.ram_address = readFromByteArr(y9table, i * 32 + 4, 4);
      overlay.ram_size = readFromByteArr(y9table, i * 32 + 8, 4);
      overlay.bss_size = readFromByteArr(y9table, i * 32 + 12, 4);
      overlay.static_start = readFromByteArr(y9table, i * 32 + 16, 4);
      overlay.static_end = readFromByteArr(y9table, i * 32 + 20, 4);
      overlay.compressed_size = readFromByteArr(y9table, i * 32 + 28, 3);
      overlay.compress_flag = y9table[i * 32 + 31] & 0xff;
      this.arm9overlays[i] = overlay;
      this.arm9overlaysByFileID.set(fileID, overlay);
    }
  }

  saveTo(filename: string): void {
    this.reopenROM();
    const srcFd = this.getBaseRomFd();

    // Initialize new ROM
    const dstFd = fs.openSync(filename, "w+");

    try {
      const headersize = readFromFd(srcFd, 0x84, 4);
      copyFd(srcFd, dstFd, 0, 0, headersize);
      let dstPos = headersize;

      // arm9
      const arm9_offset = (dstPos + ARM9_ALIGN) & ~ARM9_ALIGN;
      const old_arm9_offset = readFromFd(srcFd, 0x20, 4);
      let arm9_size = readFromFd(srcFd, 0x2c, 4);

      if (this.arm9_open && this.arm9_changed) {
        // custom arm9
        let newARM9 = this.getARM9();
        if (this.arm9_compressed) {
          // The `arm9=true` constructor flag is critical: it tells BLZ to
          // leave the first 0x4000 bytes uncompressed. The DS CPU executes
          // from the start of the ARM9 before any decompression runtime is
          // active, so compressing those bytes would crash on boot (white
          // screen). Also `best=true` matches the Java saver.
          const encoded = new BLZCoder(true).encodePub(newARM9, true, "arm9.bin");
          if (encoded === null) {
            throw new Error("BLZ compression of ARM9 failed");
          }
          newARM9 = encoded;
          if (this.arm9_szoffset > 0) {
            const newValue = newARM9.length + this.arm9_ramoffset;
            writeToByteArr(newARM9, this.arm9_szoffset, 4, newValue);
          }
        }
        arm9_size = newARM9.length;
        writeAt(dstFd, arm9_offset, newARM9);
        dstPos = arm9_offset + newARM9.length;
        if (this.arm9_has_footer) {
          writeAt(dstFd, dstPos, this.arm9_footer);
          dstPos += this.arm9_footer.length;
        }
      } else {
        // copy arm9+footer
        copyFd(srcFd, dstFd, old_arm9_offset, arm9_offset, arm9_size + 12);
        dstPos = arm9_offset + arm9_size + 12;
      }

      // arm9 ovl
      const arm9_ovl_offset = dstPos;
      const arm9_ovl_size = this.arm9overlays.length * 32;
      // don't write arm9 ovl yet
      dstPos += arm9_ovl_size;

      // arm7
      const arm7_offset = (dstPos + ARM7_ALIGN) & ~ARM7_ALIGN;
      const old_arm7_offset = readFromFd(srcFd, 0x30, 4);
      const arm7_size = readFromFd(srcFd, 0x3c, 4);
      copyFd(srcFd, dstFd, old_arm7_offset, arm7_offset, arm7_size);
      dstPos = arm7_offset + arm7_size;

      // arm7 ovl
      const arm7_ovl_offset = dstPos;
      const old_arm7_ovl_offset = readFromFd(srcFd, 0x58, 4);
      const arm7_ovl_size = readFromFd(srcFd, 0x5c, 4);
      copyFd(srcFd, dstFd, old_arm7_ovl_offset, arm7_ovl_offset, arm7_ovl_size);
      dstPos = arm7_ovl_offset + arm7_ovl_size;

      // banner
      const banner_offset = (dstPos + BANNER_ALIGN) & ~BANNER_ALIGN;
      const old_banner_offset = readFromFd(srcFd, 0x68, 4);
      const banner_size = 0x840;
      copyFd(srcFd, dstFd, old_banner_offset, banner_offset, banner_size);
      dstPos = banner_offset + banner_size;

      // filename table (doesn't change)
      const fnt_offset = (dstPos + FNT_ALIGN) & ~FNT_ALIGN;
      const old_fnt_offset = readFromFd(srcFd, 0x40, 4);
      const fnt_size = readFromFd(srcFd, 0x44, 4);
      copyFd(srcFd, dstFd, old_fnt_offset, fnt_offset, fnt_size);
      dstPos = fnt_offset + fnt_size;

      // make space for the FAT table
      const fat_offset = (dstPos + FAT_ALIGN) & ~FAT_ALIGN;
      const fat_size = this.fat.length;

      // Now for actual files
      const newfat = new Uint8Array(fat_size);
      const y9table = new Uint8Array(this.arm9overlays.length * 32);
      let base_offset = fat_offset + fat_size;
      const filecount = (fat_size / 8) | 0;

      for (let fid = 0; fid < filecount; fid++) {
        const offset_of_file = (base_offset + FILE_ALIGN) & ~FILE_ALIGN;
        let file_len = 0;
        let copiedCustom = false;

        if (this.filesByID.has(fid)) {
          const customContents = this.filesByID.get(fid)!.getOverrideContents();
          if (customContents !== null) {
            writeAt(dstFd, offset_of_file, customContents);
            copiedCustom = true;
            file_len = customContents.length;
          }
        }

        if (this.arm9overlaysByFileID.has(fid)) {
          const entry = this.arm9overlaysByFileID.get(fid)!;
          const overlay_id = entry.overlay_id;
          const customContents = entry.getOverrideContents();
          if (customContents !== null) {
            writeAt(dstFd, offset_of_file, customContents);
            copiedCustom = true;
            file_len = customContents.length;
          }
          // fill in y9 table
          writeToByteArr(y9table, overlay_id * 32, 4, overlay_id);
          writeToByteArr(y9table, overlay_id * 32 + 4, 4, entry.ram_address);
          writeToByteArr(y9table, overlay_id * 32 + 8, 4, entry.ram_size);
          writeToByteArr(y9table, overlay_id * 32 + 12, 4, entry.bss_size);
          writeToByteArr(y9table, overlay_id * 32 + 16, 4, entry.static_start);
          writeToByteArr(y9table, overlay_id * 32 + 20, 4, entry.static_end);
          writeToByteArr(y9table, overlay_id * 32 + 24, 4, fid);
          writeToByteArr(y9table, overlay_id * 32 + 28, 3, entry.compressed_size);
          writeToByteArr(y9table, overlay_id * 32 + 31, 1, entry.compress_flag);
        }

        if (!copiedCustom) {
          // copy from original ROM
          const file_starts = readFromByteArr(this.fat, fid * 8, 4);
          const file_ends = readFromByteArr(this.fat, fid * 8 + 4, 4);
          file_len = file_ends - file_starts;
          copyFd(srcFd, dstFd, file_starts, offset_of_file, file_len);
        }

        // write to new FAT
        writeToByteArr(newfat, fid * 8, 4, offset_of_file);
        writeToByteArr(newfat, fid * 8 + 4, 4, offset_of_file + file_len);
        base_offset = offset_of_file + file_len;
      }

      // write new FAT table
      writeAt(dstFd, fat_offset, newfat);

      // write y9 table
      writeAt(dstFd, arm9_ovl_offset, y9table);

      // tidy up ending
      let newfilesize = (base_offset + 3) & ~3;
      const application_end_offset = newfilesize;
      if (newfilesize !== base_offset) {
        const zeroBuf = new Uint8Array(1);
        fs.writeSync(dstFd, zeroBuf, 0, 1, newfilesize - 1);
      }

      // calculate device capacity
      newfilesize |= newfilesize >> 16;
      newfilesize |= newfilesize >> 8;
      newfilesize |= newfilesize >> 4;
      newfilesize |= newfilesize >> 2;
      newfilesize |= newfilesize >> 1;
      newfilesize++;
      if (newfilesize <= 128 * 1024) {
        newfilesize = 128 * 1024;
      }
      let devcap = -18;
      let x = newfilesize;
      while (x !== 0) {
        x >>>= 1;
        devcap++;
      }
      const devicecap = devcap < 0 ? 0 : devcap;

      // Update offsets in ROM header
      writeIntAt(dstFd, 0x20, 4, arm9_offset);
      writeIntAt(dstFd, 0x2c, 4, arm9_size);
      writeIntAt(dstFd, 0x30, 4, arm7_offset);
      writeIntAt(dstFd, 0x3c, 4, arm7_size);
      writeIntAt(dstFd, 0x40, 4, fnt_offset);
      writeIntAt(dstFd, 0x48, 4, fat_offset);
      writeIntAt(dstFd, 0x50, 4, arm9_ovl_offset);
      writeIntAt(dstFd, 0x58, 4, arm7_ovl_offset);
      writeIntAt(dstFd, 0x68, 4, banner_offset);
      writeIntAt(dstFd, 0x80, 4, application_end_offset);
      writeIntAt(dstFd, 0x14, 1, devicecap);

      // Update header CRC
      const headerForCRC = new Uint8Array(0x15e);
      fs.readSync(dstFd, headerForCRC, 0, 0x15e, 0);
      const crc = crc16Calculate(headerForCRC, 0, 0x15e);
      writeIntAt(dstFd, 0x15e, 2, crc & 0xffff);
    } finally {
      fs.closeSync(dstFd);
      this.closeROM();
    }
  }

  getCode(): string {
    return this.romCode;
  }

  getVersion(): number {
    return this.version;
  }

  // returns null if file doesn't exist
  getFile(filename: string): Uint8Array | null {
    const f = this.files.get(filename);
    if (f) {
      return f.getContents();
    }
    return null;
  }

  getOverlay(number: number): Uint8Array | null {
    if (number >= 0 && number < this.arm9overlays.length) {
      return this.arm9overlays[number].getContents();
    }
    return null;
  }

  getOverlayAddress(number: number): number {
    if (number >= 0 && number < this.arm9overlays.length) {
      return this.arm9overlays[number].ram_address;
    }
    return -1;
  }

  getARM9(): Uint8Array {
    const fd = this.getBaseRomFd();
    if (!this.arm9_open) {
      this.arm9_open = true;
      this.reopenROM();
      const arm9_offset = readFromFd(fd, 0x20, 4);
      const arm9_size = readFromFd(fd, 0x2c, 4);
      let arm9 = new Uint8Array(arm9_size);
      fs.readSync(fd, arm9, 0, arm9_size, arm9_offset);
      this.originalArm9CRC = FileFunctions.getCRC32(arm9);

      // footer check
      const nitrocodeBuf = new Uint8Array(4);
      fs.readSync(fd, nitrocodeBuf, 0, 4, arm9_offset + arm9_size);
      const nitrocode = readFromByteArr(nitrocodeBuf, 0, 4);
      if (nitrocode === 0xdec00621) {
        // found a footer
        this.arm9_footer = new Uint8Array(12);
        writeToByteArr(this.arm9_footer, 0, 4, 0xdec00621);
        fs.readSync(fd, this.arm9_footer, 4, 8, arm9_offset + arm9_size + 4);
        this.arm9_has_footer = true;
      } else {
        this.arm9_has_footer = false;
      }

      // Any extras?
      while (
        readFromByteArr(arm9, arm9.length - 12, 4) === 0xdec00621 ||
        (readFromByteArr(arm9, arm9.length - 12, 4) === 0 &&
          readFromByteArr(arm9, arm9.length - 8, 4) === 0 &&
          readFromByteArr(arm9, arm9.length - 4, 4) === 0)
      ) {
        if (!this.arm9_has_footer) {
          this.arm9_has_footer = true;
          this.arm9_footer = new Uint8Array(0);
        }
        const newfooter = new Uint8Array(this.arm9_footer.length + 12);
        newfooter.set(arm9.subarray(arm9.length - 12));
        newfooter.set(this.arm9_footer, 12);
        this.arm9_footer = newfooter;
        arm9 = arm9.subarray(0, arm9.length - 12);
      }

      // Compression check
      this.arm9_compressed = false;
      this.arm9_szoffset = 0;
      if (arm9[arm9.length - 5] >= 0x08 && arm9[arm9.length - 5] <= 0x0b) {
        const compSize = readFromByteArr(arm9, arm9.length - 8, 3);
        if (
          compSize > ((arm9.length * 9) / 10) &&
          compSize < ((arm9.length * 11) / 10)
        ) {
          this.arm9_compressed = true;
          // The compressed ARM9 contains a 4-byte little-endian record of
          // its own final (post-decompression) size in RAM, referenced as
          // `arm9.length + arm9_ramoffset`. On save we need to rewrite this
          // value with the new (re-compressed) length, so remember the
          // offset of the record now while we still have the compressed
          // image in hand.
          const compLength = new Uint8Array(4);
          writeToByteArr(compLength, 0, 4, arm9.length + this.arm9_ramoffset);
          const foundOffsets = RomFunctions.search(arm9, compLength);
          if (foundOffsets.length === 1) {
            this.arm9_szoffset = foundOffsets[0];
          } else {
            throw new Error(
              "Could not locate ARM9 size offset in the compressed image. May be a bad ROM.",
            );
          }
        }
      }

      if (this.arm9_compressed) {
        const decoded = new BLZCoder(false).decodePub(arm9, "arm9.bin");
        if (decoded === null) {
          throw new Error("BLZ decompression of ARM9 failed");
        }
        // Wrap in a fresh Uint8Array to normalize the ArrayBuffer variance
        // (decodePub returns Uint8Array<ArrayBufferLike>, arm9 is Uint8Array<ArrayBuffer>).
        arm9 = new Uint8Array(decoded);
      }

      // Store the arm9
      if (this._writingEnabled) {
        const arm9file = path.join(this._tmpFolder, "arm9.bin");
        fs.writeFileSync(arm9file, arm9);
        this.arm9_ramstored = null;
        return arm9;
      } else {
        this.arm9_ramstored = arm9;
        return new Uint8Array(arm9);
      }
    } else {
      if (this._writingEnabled) {
        return new Uint8Array(
          fs.readFileSync(path.join(this._tmpFolder, "arm9.bin")),
        );
      } else {
        return new Uint8Array(this.arm9_ramstored!);
      }
    }
  }

  writeFile(filename: string, data: Uint8Array): void {
    const f = this.files.get(filename);
    if (f) {
      f.writeOverride(data);
    }
  }

  writeOverlay(number: number, data: Uint8Array): void {
    if (number >= 0 && number <= this.arm9overlays.length) {
      this.arm9overlays[number].writeOverride(data);
    }
  }

  writeARM9(arm9: Uint8Array): void {
    if (!this.arm9_open) {
      this.getARM9();
    }
    this.arm9_changed = true;
    if (this._writingEnabled) {
      fs.writeFileSync(path.join(this._tmpFolder, "arm9.bin"), arm9);
    } else {
      this.arm9_ramstored = new Uint8Array(arm9);
    }
  }

  private firstPassDirectory(
    fd: number,
    dir: number,
    subTableOffset: number,
    firstFileID: number,
    directoryNames: (string | null)[],
    filenames: Map<number, string>,
    fileDirectories: Map<number, number>,
  ): void {
    // Read the entire subtable into memory first
    // We don't know the exact size, so read a generous chunk
    const chunkSize = 4096;
    const chunk = new Uint8Array(chunkSize);
    const bytesRead = fs.readSync(fd, chunk, 0, chunkSize, subTableOffset);

    let pos = 0;
    let currentFileID = firstFileID;
    while (pos < bytesRead) {
      const control = chunk[pos];
      if (control === 0x00) {
        break;
      }
      pos++;
      const namelen = control & 0x7f;
      const rawname = chunk.subarray(pos, pos + namelen);
      const name = new TextDecoder("ascii").decode(rawname);
      pos += namelen;
      if ((control & 0x80) > 0x00) {
        // sub-directory
        const subDirectoryID = readFromByteArr(chunk, pos, 2);
        pos += 2;
        directoryNames[subDirectoryID - 0xf000] = name;
      } else {
        const fileID = currentFileID++;
        filenames.set(fileID, name);
        fileDirectories.set(fileID, dir);
      }
    }
  }

  getTmpFolder(): string {
    return this._tmpFolder;
  }

  isWritingEnabled(): boolean {
    return this._writingEnabled;
  }

  getArm9Overlays(): NDSY9Entry[] {
    return this.arm9overlays;
  }

  getFilesMap(): Map<string, NDSFile> {
    return this.files;
  }
}

// -- Helper functions --

function readFromByteArr(
  data: Uint8Array,
  offset: number,
  size: number,
): number {
  let result = 0;
  for (let i = 0; i < size; i++) {
    result |= (data[i + offset] & 0xff) << (i * 8);
  }
  return result >>> 0;
}

function writeToByteArr(
  data: Uint8Array,
  offset: number,
  size: number,
  value: number,
): void {
  for (let i = 0; i < size; i++) {
    data[offset + i] = (value >> (i * 8)) & 0xff;
  }
}

function readFromFd(fd: number, offset: number, size: number): number {
  const buf = new Uint8Array(size);
  fs.readSync(fd, buf, 0, size, offset);
  return readFromByteArr(buf, 0, size);
}

function writeAt(fd: number, offset: number, data: Uint8Array): void {
  fs.writeSync(fd, data, 0, data.length, offset);
}

function writeIntAt(
  fd: number,
  offset: number,
  size: number,
  value: number,
): void {
  const buf = new Uint8Array(size);
  writeToByteArr(buf, 0, size, value);
  fs.writeSync(fd, buf, 0, size, offset);
}

function copyFd(
  srcFd: number,
  dstFd: number,
  srcOffset: number,
  dstOffset: number,
  bytes: number,
): void {
  const bufSize = Math.min(256 * 1024, bytes);
  const buf = new Uint8Array(bufSize);
  let remaining = bytes;
  let srcPos = srcOffset;
  let dstPos = dstOffset;
  while (remaining > 0) {
    const toRead = Math.min(remaining, bufSize);
    const read = fs.readSync(srcFd, buf, 0, toRead, srcPos);
    fs.writeSync(dstFd, buf, 0, read, dstPos);
    srcPos += read;
    dstPos += read;
    remaining -= read;
  }
}
