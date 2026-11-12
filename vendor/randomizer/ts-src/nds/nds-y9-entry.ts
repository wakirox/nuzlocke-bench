/*----------------------------------------------------------------------------*/
/*--  nds-y9-entry.ts - an entry in the arm9 overlay system                 --*/
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
import { BLZCoder } from "../compressors/blz-coder";
import type { NDSRom } from "./nds-rom";

enum Extracted {
  NOT,
  TO_FILE,
  TO_RAM,
}

export class NDSY9Entry {
  private parent: NDSRom;
  offset = 0;
  size = 0;
  original_size = 0;
  fileID = 0;
  overlay_id = 0;
  ram_address = 0;
  ram_size = 0;
  bss_size = 0;
  static_start = 0;
  static_end = 0;
  compressed_size = 0;
  compress_flag = 0;
  private status: Extracted = Extracted.NOT;
  private extFilename = "";
  data: Uint8Array | null = null;
  originalCRC = 0;
  private decompressed_data = false;

  constructor(parent: NDSRom) {
    this.parent = parent;
  }

  getContents(): Uint8Array {
    if (this.status === Extracted.NOT) {
      // extract file
      this.parent.reopenROM();
      const fd = this.parent.getBaseRomFd();
      const buf = new Uint8Array(this.original_size);
      const bytesRead = fs.readSync(fd, buf, 0, this.original_size, this.offset);
      if (bytesRead !== this.original_size) {
        throw new Error(
          `Failed to read ${this.original_size} bytes at offset ${this.offset}`,
        );
      }
      this.originalCRC = FileFunctions.getCRC32(buf);

      let result: Uint8Array = buf;
      // Overlays can be BLZ-compressed. The NDS `y9` table stores both the
      // original (compressed) size and a separate "decompressed" size, but
      // when `compress_flag` is set and `original_size == compressed_size`
      // (i.e. the y9 entry still reflects the compressed image), we need to
      // decompress it before handing it back to callers. Mirrors Java
      // NDSY9Entry.getContents.
      if (
        this.compress_flag !== 0 &&
        this.original_size === this.compressed_size &&
        this.compressed_size !== 0
      ) {
        const decoded = new BLZCoder(false).decodePub(buf, `overlay ${this.overlay_id}`);
        if (decoded === null) {
          throw new Error(`BLZ decompression failed for overlay ${this.overlay_id}`);
        }
        result = new Uint8Array(decoded);
        this.decompressed_data = true;
      }

      if (this.parent.isWritingEnabled()) {
        const tmpDir = this.parent.getTmpFolder();
        const fullPath = `overlay_${String(this.overlay_id).padStart(4, "0")}`;
        this.extFilename = fullPath.replace(/[^A-Za-z0-9_]+/g, "");
        const tmpFile = path.join(tmpDir, this.extFilename);
        fs.writeFileSync(tmpFile, result);
        this.status = Extracted.TO_FILE;
        this.data = null;
        return result;
      } else {
        this.status = Extracted.TO_RAM;
        this.data = result;
        return new Uint8Array(result);
      }
    } else if (this.status === Extracted.TO_RAM) {
      return new Uint8Array(this.data!);
    } else {
      const tmpDir = this.parent.getTmpFolder();
      return new Uint8Array(
        fs.readFileSync(path.join(tmpDir, this.extFilename)),
      );
    }
  }

  writeOverride(data: Uint8Array): void {
    if (this.status === Extracted.NOT) {
      // temp extract
      this.getContents();
    }
    this.size = data.length;
    if (this.status === Extracted.TO_FILE) {
      const tmpDir = this.parent.getTmpFolder();
      fs.writeFileSync(path.join(tmpDir, this.extFilename), data);
    } else {
      this.data = new Uint8Array(data);
    }
  }

  // returns null if no override
  getOverrideContents(): Uint8Array | null {
    if (this.status === Extracted.NOT) {
      return null;
    }
    let buf: Uint8Array = this.getContents();
    // If we decompressed this overlay on load, re-compress before handing
    // the bytes back to the ROM saver so the game's own overlay loader can
    // decompress it at runtime. Mirrors Java NDSY9Entry.getOverrideContents.
    if (this.decompressed_data) {
      const encoded = new BLZCoder(false).encodePub(buf, false, `overlay ${this.overlay_id}`);
      if (encoded === null) {
        throw new Error(`BLZ re-compression failed for overlay ${this.overlay_id}`);
      }
      buf = new Uint8Array(encoded);
      this.compressed_size = buf.length;
    }
    return buf;
  }
}
