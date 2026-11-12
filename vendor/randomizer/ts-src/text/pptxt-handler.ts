/*----------------------------------------------------------------------------*/
/*--  pptxt-handler.ts - handles generation 5 games text encoding            --*/
/*--  Code derived from "PPTXT", copyright (C) SCV?                          --*/
/*--  Ported to TypeScript                                                   --*/
/*----------------------------------------------------------------------------*/

import { FileFunctions } from "../utils/file-functions";

let pokeToText: Map<string, string> = new Map();
let textToPoke: Map<string, string> = new Map();
let pokeToTextPattern: RegExp | null = null;
let textToPokePattern: RegExp | null = null;
let initialized = false;

let lastKeys: number[] = [];
let lastUnknowns: number[] = [];

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  try {
    const buf = FileFunctions.openConfig("Generation5.tbl");
    const text = buf.toString("utf-8");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) continue;
      const key = line.substring(0, eqIdx);
      let val = line.substring(eqIdx + 1);
      if (val.endsWith("\r\n")) {
        val = val.substring(0, val.length - 2);
      }
      const charCode = parseInt(key, 16);
      const pokeChar = String.fromCharCode(charCode);
      pokeToText.set(
        pokeChar,
        val.replace(/\\/g, "\\\\").replace(/\$/g, "\\$")
      );
      textToPoke.set(val, "\\\\x" + key);
    }
    pokeToTextPattern = makePattern([...pokeToText.keys()]);
    textToPokePattern = makePattern([...textToPoke.keys()]);
  } catch {
    // Config file not available
  }
}

/**
 * Initialize from an explicit map (for testing without config files).
 */
export function initFromMap(entries: Map<number, string>): void {
  pokeToText = new Map();
  textToPoke = new Map();
  initialized = true;

  for (const [charCode, val] of entries) {
    const pokeChar = String.fromCharCode(charCode);
    pokeToText.set(
      pokeChar,
      val.replace(/\\/g, "\\\\").replace(/\$/g, "\\$")
    );
    textToPoke.set(val, "\\\\x" + charCode.toString(16).toUpperCase().padStart(4, "0"));
  }
  pokeToTextPattern = makePattern([...pokeToText.keys()]);
  textToPokePattern = makePattern([...textToPoke.keys()]);
}

function makePattern(tokens: string[]): RegExp {
  const escaped = tokens
    .map(
      (t) =>
        t
          .replace(/\\/g, "\\\\")
          .replace(/\[/g, "\\[")
          .replace(/\]/g, "\\]")
          .replace(/\(/g, "\\(")
          .replace(/\)/g, "\\)")
          .replace(/\./g, "\\.")
          .replace(/\*/g, "\\*")
          .replace(/\+/g, "\\+")
          .replace(/\?/g, "\\?")
          .replace(/\^/g, "\\^")
          .replace(/\{/g, "\\{")
          .replace(/\}/g, "\\}")
          .replace(/\|/g, "\\|")
    )
    .join("|");
  return new RegExp("(" + escaped + ")", "g");
}

function bulkReplace(
  str: string,
  pattern: RegExp,
  replacements: Map<string, string>
): string {
  // Reset lastIndex for global regex
  pattern.lastIndex = 0;
  return str.replace(pattern, (match) => {
    const rep = replacements.get(match);
    return rep !== undefined ? rep : match;
  });
}

/**
 * Decompress words given as 9-bits-per-char format (gen5).
 * Based off poketext's implementation in gen4, but uses all 16 bits per word.
 */
function decompress(chars: number[]): number[] {
  const uncomp: number[] = [];
  let j = 1;
  let shift1 = 0;
  let trans = 0;

  while (true) {
    let tmp = chars[j];
    tmp = tmp >> shift1;
    let tmp1 = tmp;

    if (shift1 >= 0x10) {
      shift1 -= 0x10;
      if (shift1 > 0) {
        tmp1 = trans | ((chars[j] << (9 - shift1)) & 0x1ff);
        if ((tmp1 & 0xff) === 0xff) {
          break;
        }
        if (tmp1 !== 0x0 && tmp1 !== 0x1) {
          uncomp.push(tmp1);
        }
      }
    } else {
      tmp1 = (chars[j] >> shift1) & 0x1ff;
      if ((tmp1 & 0xff) === 0xff) {
        break;
      }
      if (tmp1 !== 0x0 && tmp1 !== 0x1) {
        uncomp.push(tmp1);
      }
      shift1 += 9;
      if (shift1 < 0x10) {
        trans = (chars[j] >> shift1) & 0x1ff;
        shift1 += 9;
      }
      j += 1;
    }
  }
  return uncomp;
}

function readWord(data: Buffer | Uint8Array, offset: number): number {
  return (data[offset] & 0xff) + ((data[offset + 1] & 0xff) << 8);
}

function readLong(data: Buffer | Uint8Array, offset: number): number {
  return (
    (data[offset] & 0xff) +
    ((data[offset + 1] & 0xff) << 8) +
    ((data[offset + 2] & 0xff) << 16) +
    ((data[offset + 3] & 0xff) << 24)
  );
}

function writeWord(data: Buffer | Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function writeLong(data: Buffer | Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

/**
 * Read text entries from a gen5 NARC text data block.
 */
export function readTexts(ds: Buffer | Uint8Array): string[] {
  ensureInitialized();

  let pos = 0;
  const i = 0;
  lastKeys = [];
  lastUnknowns = [];
  const strings: string[] = [];

  const sizeSections = [0, 0, 0];
  const sectionOffset = [0, 0, 0];
  const tableOffsets: Map<number, number[]> = new Map();
  const characterCount: Map<number, number[]> = new Map();
  const unknown: Map<number, number[]> = new Map();
  const encText: Map<number, number[][]> = new Map();

  const numSections = readWord(ds, 0);
  const numEntries = readWord(ds, 2);
  sizeSections[0] = readLong(ds, 4);
  pos += 12;

  if (numSections > i) {
    for (let z = 0; z < numSections; z++) {
      sectionOffset[z] = readLong(ds, pos);
      pos += 4;
    }
    pos = sectionOffset[i];
    sizeSections[i] = readLong(ds, pos);
    pos += 4;
    tableOffsets.set(i, []);
    characterCount.set(i, []);
    unknown.set(i, []);
    encText.set(i, []);

    for (let j = 0; j < numEntries; j++) {
      const tmpOffset = readLong(ds, pos);
      pos += 4;
      const tmpCharCount = readWord(ds, pos);
      pos += 2;
      const tmpUnknown = readWord(ds, pos);
      pos += 2;
      tableOffsets.get(i)!.push(tmpOffset);
      characterCount.get(i)!.push(tmpCharCount);
      unknown.get(i)!.push(tmpUnknown);
      lastUnknowns.push(tmpUnknown);
    }

    for (let j = 0; j < numEntries; j++) {
      const tmpEncChars: number[] = [];
      pos = sectionOffset[i] + tableOffsets.get(i)![j];
      for (let k = 0; k < characterCount.get(i)![j]; k++) {
        const tmpChar = readWord(ds, pos);
        pos += 2;
        tmpEncChars.push(tmpChar);
      }
      encText.get(i)!.push(tmpEncChars);

      let key =
        encText.get(i)![j][characterCount.get(i)![j] - 1] ^ 0xffff;
      for (let k = characterCount.get(i)![j] - 1; k >= 0; k--) {
        encText.get(i)![j][k] = encText.get(i)![j][k] ^ key;
        if (k === 0) {
          lastKeys.push(key);
        }
        key = ((key >>> 3) | (key << 13)) & 0xffff;
      }

      if (encText.get(i)![j][0] === 0xf100) {
        encText.get(i)![j] = decompress(encText.get(i)![j]);
        characterCount.get(i)![j] = encText.get(i)![j].length;
      }

      const chars: string[] = [];
      let sb = "";
      for (let k = 0; k < characterCount.get(i)![j]; k++) {
        const charVal = encText.get(i)![j][k];
        if (charVal === 0xffff) {
          chars.push("\\xFFFF");
        } else {
          if (charVal > 20 && charVal <= 0xfff0) {
            chars.push(String.fromCharCode(charVal));
          } else {
            const num = charVal
              .toString(16)
              .toUpperCase()
              .padStart(4, "0");
            chars.push("\\x" + num);
          }
          sb += chars[k];
        }
      }
      strings.push(sb);
    }
  }

  // Parse strings against the table
  if (pokeToTextPattern) {
    for (let sn = 0; sn < strings.length; sn++) {
      strings[sn] = bulkReplace(
        strings[sn],
        pokeToTextPattern,
        pokeToText
      );
    }
  }

  return strings;
}

/**
 * Write new strings to the text datafile, returning the resulting binary.
 * Will never use [F100] compression even if the original file used it.
 */
export function saveEntry(
  originalData: Buffer | Uint8Array,
  text: string[]
): Buffer {
  ensureInitialized();

  // Parse strings against the reverse table
  if (textToPokePattern) {
    for (let sn = 0; sn < text.length; sn++) {
      text[sn] = bulkReplace(text[sn], textToPokePattern, textToPoke);
    }
  }

  // Make sure we have the original unknowns etc
  readTexts(Buffer.from(originalData));

  const numSections = readWord(originalData, 0);
  const numEntries = readWord(originalData, 2);
  const sizeSections = [0, 0, 0];
  const sectionOffset = [0, 0, 0];
  sizeSections[0] = readLong(originalData, 4);
  let pos = 12;

  if (text.length < numEntries) {
    console.error("Can't do anything due to too few lines");
    return Buffer.from(originalData);
  }

  const newEntry = makeSection(text, numEntries);
  for (let z = 0; z < numSections; z++) {
    sectionOffset[z] = readLong(originalData, pos);
    pos += 4;
  }
  for (let z = 0; z < numSections; z++) {
    pos = sectionOffset[z];
    sizeSections[z] = readLong(originalData, pos);
  }
  const newsizeSections0 = newEntry.length;

  const newData = Buffer.alloc(
    originalData.length - sizeSections[0] + newsizeSections0
  );
  Buffer.from(originalData).copy(
    newData,
    0,
    0,
    Math.min(originalData.length, newData.length)
  );
  writeLong(newData, 4, newsizeSections0);
  if (numSections === 2) {
    const newsectionOffset1 = newsizeSections0 + sectionOffset[0];
    writeLong(newData, 0x10, newsectionOffset1);
    newEntry.copy(newData, sectionOffset[0]);
    Buffer.from(originalData).copy(
      newData,
      newsectionOffset1,
      sectionOffset[1],
      sectionOffset[1] + sizeSections[1]
    );
  } else {
    newEntry.copy(newData, sectionOffset[0]);
  }

  return newData;
}

function makeSection(strings: string[], numEntries: number): Buffer {
  const data: number[][] = [];
  let size = 0;
  let offset = 4 + 8 * numEntries;

  for (let i = 0; i < numEntries; i++) {
    data.push(parseString(strings[i], i));
    size += data[i].length * 2;
  }

  if (size % 4 === 2) {
    size += 2;
    let tmpKey = lastKeys[numEntries - 1];
    for (let i = 0; i < data[numEntries - 1].length; i++) {
      tmpKey = ((tmpKey << 3) | (tmpKey >> 13)) & 0xffff;
    }
    data[numEntries - 1].push(0xffff ^ tmpKey);
  }

  size += offset;
  const section = Buffer.alloc(size);
  let pos = 0;
  writeLong(section, pos, size);
  pos += 4;

  for (let i = 0; i < numEntries; i++) {
    const charCount = data[i].length;
    writeLong(section, pos, offset);
    pos += 4;
    writeWord(section, pos, charCount);
    pos += 2;
    writeWord(section, pos, lastUnknowns[i]);
    pos += 2;
    offset += charCount * 2;
  }

  for (let i = 0; i < numEntries; i++) {
    for (const word of data[i]) {
      writeWord(section, pos, word);
      pos += 2;
    }
  }

  return section;
}

function parseString(str: string, entryId: number): number[] {
  const chars: number[] = [];
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) !== "\\") {
      chars.push(str.charCodeAt(i));
    } else {
      if (i + 2 < str.length && str.charAt(i + 2) === "{") {
        chars.push(str.charCodeAt(i));
      } else {
        chars.push(parseInt(str.substring(i + 2, i + 6), 16));
        i += 5;
      }
    }
  }
  chars.push(0xffff);

  let key = lastKeys[entryId];
  for (let i = 0; i < chars.length; i++) {
    chars[i] = (chars[i] ^ key) & 0xffff;
    key = ((key << 3) | (key >>> 13)) & 0xffff;
  }
  return chars;
}

// Export for testing
export { writeWord as _writeWord, readWord as _readWord };
