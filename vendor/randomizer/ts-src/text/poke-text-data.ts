/*----------------------------------------------------------------------------*/
/*--  poke-text-data.ts - decodes gen4 games text into Unicode               --*/
/*--  Code derived from "thenewpoketext", copyright (C) loadingNOW           --*/
/*--  Ported to TypeScript                                                   --*/
/*----------------------------------------------------------------------------*/

import { tb, ensureInitialized } from "./unicode-parser";

export interface PointerEntry {
  ptr: number;
  chars: number;
}

export class PokeTextData {
  private data: Buffer;
  private ptrlist: PointerEntry[] = [];
  public strlist: string[] = [];
  public compressFlag = false;

  constructor(data: Buffer | Uint8Array) {
    this.data = Buffer.from(data);
  }

  get(): Buffer {
    return this.data;
  }

  private read16(ofs: number): number {
    return (this.data[ofs] & 0xff) | ((this.data[ofs + 1] & 0xff) << 8);
  }

  private write16(d: number, ofs: number): void {
    this.data[ofs] = d & 0xff;
    this.data[ofs + 1] = (d >> 8) & 0xff;
  }

  private read32(ofs: number): number {
    return (
      (this.data[ofs] & 0xff) |
      ((this.data[ofs + 1] & 0xff) << 8) |
      ((this.data[ofs + 2] & 0xff) << 16) |
      ((this.data[ofs + 3] & 0xff) << 24)
    );
  }

  private write32(d: number, ofs: number): void {
    this.data[ofs] = d & 0xff;
    this.data[ofs + 1] = (d >> 8) & 0xff;
    this.data[ofs + 2] = (d >> 16) & 0xff;
    this.data[ofs + 3] = (d >> 24) & 0xff;
  }

  decrypt(): void {
    ensureInitialized();
    this.decryptPtrs(this.read16(0), this.read16(2), 4);
    this.ptrlist = this.createPtrList(this.read16(0), 4);
    this.strlist = [];

    const num = this.read16(0);
    for (let i = 0; i < num; i++) {
      const entry = this.ptrlist[i];
      this.decryptTxt(entry.chars, i + 1, entry.ptr);
      this.strlist.push(this.makeString(entry.chars, entry.ptr));
    }
  }

  encrypt(): void {
    this.ptrlist = this.createPtrList(this.read16(0), 4);
    const num = this.read16(0);
    for (let i = 0; i < num; i++) {
      const entry = this.ptrlist[i];
      this.decryptTxt(entry.chars, i + 1, entry.ptr);
    }
    this.decryptPtrs(this.read16(0), this.read16(2), 4);
  }

  private decryptPtrs(count: number, key: number, sdidx: number): void {
    key = (key * 0x2fd) & 0xffff;
    for (let i = 0; i < count; i++) {
      const key2 = (key * (i + 1)) & 0xffff;
      const realkey = (key2 | (key2 << 16)) >>> 0;
      this.write32((this.read32(sdidx) ^ realkey) | 0, sdidx);
      this.write32((this.read32(sdidx + 4) ^ realkey) | 0, sdidx + 4);
      sdidx += 8;
    }
  }

  private createPtrList(count: number, sdidx: number): PointerEntry[] {
    const ptrlist: PointerEntry[] = [];
    for (let i = 0; i < count; i++) {
      ptrlist.push({
        ptr: this.read32(sdidx),
        chars: this.read32(sdidx + 4),
      });
      sdidx += 8;
    }
    return ptrlist;
  }

  private decryptTxt(count: number, id: number, idx: number): void {
    let key = (0x91bd3 * id) & 0xffff;
    for (let i = 0; i < count; i++) {
      this.write16(this.read16(idx) ^ key, idx);
      key += 0x493d;
      key = key & 0xffff;
      idx += 2;
    }
  }

  private makeString(count: number, idx: number): string {
    let result = "";
    let chars: number[] = [];
    for (let i = 0; i < count; i++) {
      chars.push(this.read16(idx));
      idx += 2;
    }

    if (chars[0] === 0xf100) {
      this.compressFlag = true;
      let j = 1;
      let shift1 = 0;
      let trans = 0;
      const uncomp: number[] = [];
      while (true) {
        const tmp = chars[j];
        let tmp1 = tmp >> shift1;
        if (shift1 >= 0xf) {
          shift1 -= 0xf;
          if (shift1 > 0) {
            tmp1 = trans | ((chars[j] << (9 - shift1)) & 0x1ff);
            if (tmp1 === 0x1ff) {
              break;
            }
            uncomp.push(tmp1);
          }
        } else {
          tmp1 = (chars[j] >> shift1) & 0x1ff;
          if (tmp1 === 0x1ff) {
            break;
          }
          uncomp.push(tmp1);
          shift1 += 9;
          if (shift1 < 0xf) {
            trans = (chars[j] >> shift1) & 0x1ff;
            shift1 += 9;
          }
          j += 1;
        }
      }
      chars = uncomp;
    }

    let i = 0;
    for (let c = 0; c < chars.length; c++) {
      const currChar = chars[i];
      if (tb[currChar] != null) {
        result += tb[currChar];
      } else {
        if (currChar === 0xfffe) {
          i++;
          result += "\\v" + chars[i].toString(16).toUpperCase().padStart(4, "0");
          i++;
          const total = chars[i];
          if (total === 0) {
            result += "\\x" + (0).toString(16).toUpperCase().padStart(4, "0");
          }
          for (let z = 0; z < total; z++) {
            i++;
            result +=
              "\\z" + chars[i].toString(16).toUpperCase().padStart(4, "0");
          }
        } else if (currChar === 0xffff) {
          break;
        } else {
          result +=
            "\\x" + chars[i].toString(16).toUpperCase().padStart(4, "0");
        }
      }
      i++;
    }
    return result;
  }

  setKey(key: number): void {
    this.write16(key, 2);
  }

  getKey(): number {
    return this.read16(2);
  }
}
