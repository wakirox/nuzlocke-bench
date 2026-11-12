/*----------------------------------------------------------------------------*/
/*--  romfs-file.ts - an entry in the romfs filesystem                      --*/
/*--                                                                        --*/
/*--  Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team          --*/
/*--  Pokemon and any associated names and the like are                      --*/
/*--  trademark and (C) Nintendo 1996-2020.                                  --*/
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

import * as fs from "fs";
import * as path from "path";
import { FileFunctions } from "../utils/file-functions.js";

enum Extracted {
  NOT,
  TO_FILE,
  TO_RAM,
}

/**
 * Interface for the parent NCCH that provides ROM access.
 * This avoids circular dependency with NCCH.
 */
export interface RomfsFileParent {
  reopenROM(): void;
  getBaseRomFd(): number;
  isWritingEnabled(): boolean;
  getTmpFolder(): string;
}

export class RomfsFile {
  private parent: RomfsFileParent;
  public offset: number = 0;
  public size: number = 0;
  public fullPath: string = "";
  private status: Extracted = Extracted.NOT;
  private extFilename: string = "";
  public data: Uint8Array | null = null;
  public fileChanged: boolean = false;
  public originalCRC: number = 0;

  constructor(parent: RomfsFileParent) {
    this.parent = parent;
  }

  getContents(): Uint8Array {
    if (this.status === Extracted.NOT) {
      this.parent.reopenROM();
      const fd = this.parent.getBaseRomFd();
      const buf = Buffer.alloc(this.size);
      fs.readSync(fd, buf, 0, this.size, this.offset);
      const data = new Uint8Array(buf);
      this.originalCRC = FileFunctions.getCRC32(data);

      if (this.parent.isWritingEnabled()) {
        const tmpDir = this.parent.getTmpFolder();
        this.extFilename = this.fullPath.replace(/[^A-Za-z0-9_.]+/g, "");
        const tmpFile = path.join(tmpDir, this.extFilename);
        fs.writeFileSync(tmpFile, data);
        this.status = Extracted.TO_FILE;
        this.data = null;
        return data;
      } else {
        this.status = Extracted.TO_RAM;
        this.data = data;
        const copy = new Uint8Array(data.length);
        copy.set(data);
        return copy;
      }
    } else if (this.status === Extracted.TO_RAM) {
      const copy = new Uint8Array(this.data!.length);
      copy.set(this.data!);
      return copy;
    } else {
      const tmpDir = this.parent.getTmpFolder();
      return FileFunctions.readFileFullyIntoBuffer(
        path.join(tmpDir, this.extFilename)
      );
    }
  }

  writeOverride(data: Uint8Array): void {
    if (this.status === Extracted.NOT) {
      this.getContents();
    }
    this.fileChanged = true;
    this.size = data.length;
    if (this.status === Extracted.TO_FILE) {
      const tmpDir = this.parent.getTmpFolder();
      fs.writeFileSync(path.join(tmpDir, this.extFilename), data);
    } else {
      if (this.data !== null && this.data.length === data.length) {
        this.data.set(data);
      } else {
        this.data = new Uint8Array(data.length);
        this.data.set(data);
      }
    }
  }

  /** Returns null if no override */
  getOverrideContents(): Uint8Array | null {
    if (this.status === Extracted.NOT) {
      return null;
    }
    return this.getContents();
  }
}
