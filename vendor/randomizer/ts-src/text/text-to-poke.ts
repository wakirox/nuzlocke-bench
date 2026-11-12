/*----------------------------------------------------------------------------*/
/*--  text-to-poke.ts - encodes gen4 games text from Unicode                 --*/
/*--  Code derived from "thenewpoketext", copyright (C) loadingNOW           --*/
/*--  Ported to TypeScript                                                   --*/
/*----------------------------------------------------------------------------*/

import { d, ensureInitialized } from "./unicode-parser";

interface PointerEntry {
  ptr: number;
  chars: number;
}

export function makeFile(textarr: string[], compressed: boolean): Buffer {
  ensureInitialized();
  let base = textarr.length * 8 + 4;
  const ptrtable: PointerEntry[] = [];
  const rawdata: number[][] = [];

  for (const text of textarr) {
    const data = toCode(text, compressed);
    const l = data.length;
    ptrtable.push({ ptr: base, chars: l });
    rawdata.push(data);
    base += l * 2;
  }

  const hdr = [textarr.length, 0];
  return join(
    wordListToBarr(hdr),
    pointerListToBarr(ptrtable),
    listOfWordListToBarr(rawdata)
  );
}

function toCode(text: string, compressed: boolean): number[] {
  const data: number[] = [];
  let pos = 0;

  while (pos < text.length) {
    if (text.charAt(pos) === "\\") {
      const next = text.charAt(pos + 1);
      if (next === "x") {
        data.push(parseInt(text.substring(pos + 2, pos + 6), 16));
        pos += 6;
      } else if (next === "v") {
        data.push(0xfffe);
        data.push(parseInt(text.substring(pos + 2, pos + 6), 16));
        pos += 6;
      } else if (next === "z") {
        const varValues: number[] = [];
        let w = 0;
        while (pos < text.length) {
          if (
            text.charAt(pos) === "\\" &&
            pos + 1 < text.length &&
            text.charAt(pos + 1) === "z"
          ) {
            w++;
            varValues.push(parseInt(text.substring(pos + 2, pos + 6), 16));
            pos += 6;
          } else {
            break;
          }
        }
        data.push(w);
        data.push(...varValues);
      } else if (next === "n") {
        data.push(0xe000);
        pos += 2;
      } else if (next === "p") {
        data.push(0x25bc);
        pos += 2;
      } else if (next === "l") {
        data.push(0x25bd);
        pos += 2;
      } else if (text.substring(pos + 1, pos + 4) === "and") {
        data.push(0x1c2);
        pos += 4;
      } else {
        // Unknown escape
        pos += 2;
      }
    } else {
      let i = Math.max(0, 6 - (text.length - pos));
      while (
        !(d.has(text.substring(pos, pos + 6 - i)) || i === 6)
      ) {
        i++;
      }
      if (i === 6) {
        // Char not found, skip
        pos += 1;
      } else {
        data.push(d.get(text.substring(pos, pos + 6 - i))!);
        pos += 6 - i;
      }
    }
  }

  if (compressed) {
    if (data.length % 5 !== 0 || data.length === 0) {
      data.push(0x1ff);
    }
    const bits = new Uint8Array(data.length * 9);
    let bc = 0;
    for (const val of data) {
      for (let j = 0; j < 9; j++) {
        bits[bc++] = ((val >> j) & 1) as number;
      }
    }
    let tmpUint16 = 0;
    data.length = 0;
    data.push(0xf100);
    for (let i = 0; i < bits.length; i++) {
      if (i % 15 === 0 && i !== 0) {
        data.push(tmpUint16);
        tmpUint16 = 0;
      }
      tmpUint16 |= bits[i] << (i % 15);
    }
    data.push(tmpUint16);
  }

  data.push(0xffff);
  return data;
}

function join(...args: Buffer[]): Buffer {
  return Buffer.concat(args);
}

function wordListToBarr(list: number[]): Buffer {
  const buf = Buffer.alloc(list.length * 2);
  for (let i = 0; i < list.length; i++) {
    buf[i * 2] = list[i] & 0xff;
    buf[i * 2 + 1] = (list[i] >> 8) & 0xff;
  }
  return buf;
}

function pointerListToBarr(ptrList: PointerEntry[]): Buffer {
  const buf = Buffer.alloc(ptrList.length * 8);
  for (let i = 0; i < ptrList.length; i++) {
    const ofs = i * 8;
    const ent = ptrList[i];
    buf[ofs] = ent.ptr & 0xff;
    buf[ofs + 1] = (ent.ptr >> 8) & 0xff;
    buf[ofs + 2] = (ent.ptr >> 16) & 0xff;
    buf[ofs + 3] = (ent.ptr >> 24) & 0xff;
    buf[ofs + 4] = ent.chars & 0xff;
    buf[ofs + 5] = (ent.chars >> 8) & 0xff;
    buf[ofs + 6] = (ent.chars >> 16) & 0xff;
    buf[ofs + 7] = (ent.chars >> 24) & 0xff;
  }
  return buf;
}

function listOfWordListToBarr(list: number[][]): Buffer {
  let tlen = 0;
  for (const sub of list) {
    tlen += sub.length * 2;
  }
  const buf = Buffer.alloc(tlen);
  let offs = 0;
  for (const slist of list) {
    for (const val of slist) {
      buf[offs] = val & 0xff;
      buf[offs + 1] = (val >> 8) & 0xff;
      offs += 2;
    }
  }
  return buf;
}
