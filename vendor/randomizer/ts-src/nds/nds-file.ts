/*----------------------------------------------------------------------------*/
/*--  nds-file.ts - an entry in the FAT/FNT filesystem                      --*/
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
import type { NDSRom } from "./nds-rom";

enum Extracted {
  NOT,
  TO_FILE,
  TO_RAM,
}

export class NDSFile {
  private parent: NDSRom;
  offset = 0;
  size = 0;
  fileID = 0;
  fullPath = "";
  private status: Extracted = Extracted.NOT;
  private extFilename = "";
  data: Uint8Array | null = null;
  originalCRC = 0;

  constructor(parent: NDSRom) {
    this.parent = parent;
  }

  getContents(): Uint8Array {
    if (this.status === Extracted.NOT) {
      // extract file
      this.parent.reopenROM();
      const fd = this.parent.getBaseRomFd();
      const buf = new Uint8Array(this.size);
      const bytesRead = fs.readSync(fd, buf, 0, this.size, this.offset);
      if (bytesRead !== this.size) {
        throw new Error(
          `Failed to read ${this.size} bytes at offset ${this.offset}`,
        );
      }
      this.originalCRC = FileFunctions.getCRC32(buf);
      if (this.parent.isWritingEnabled()) {
        // make a file
        const tmpDir = this.parent.getTmpFolder();
        this.extFilename = this.fullPath.replace(/[^A-Za-z0-9_]+/g, "");
        const tmpFile = path.join(tmpDir, this.extFilename);
        fs.writeFileSync(tmpFile, buf);
        this.status = Extracted.TO_FILE;
        this.data = null;
        return buf;
      } else {
        this.status = Extracted.TO_RAM;
        this.data = buf;
        return new Uint8Array(buf);
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
    return this.getContents();
  }
}
