/*----------------------------------------------------------------------------*/
/*--  n3ds-txt-handler.ts - text processing for the 3DS Pokemon games        --*/
/*--                                                                         --*/
/*--  Contains code based on "pk3DS", copyright (C) Kaphotics                --*/
/*--  Ported to TypeScript under the terms of the GPL.                       --*/
/*----------------------------------------------------------------------------*/

import {
  getTextVariableCodes,
  getVariableCode,
} from "../constants/n3ds-constants";

const KEY_BASE = 0x7c89;
const KEY_ADVANCE = 0x2983;
const KEY_TERMINATOR = 0x0000;
const KEY_VARIABLE = 0x0010;
const KEY_TEXTRETURN = 0xbe00;
const KEY_TEXTCLEAR = 0xbe01;
const KEY_TEXTWAIT = 0xbe02;
const KEY_TEXTNULL = 0xbdff;

function readShort(data: Buffer | Uint8Array, offset: number): number {
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

function cryptEntryData(data: Buffer | Uint8Array, key: number): Buffer {
  const result = Buffer.alloc(data.length);
  let k = key;
  for (let i = 0; i < result.length; i += 2) {
    const sh = (readShort(data, i) & 0xffff) ^ (k & 0xffff);
    result[i] = sh & 0xff;
    result[i + 1] = (sh >> 8) & 0xff;
    k = ((k << 3) | (k >>> 13)) & 0xffff;
  }
  return result;
}

function getEntryKey(index: number): number {
  let key = KEY_BASE;
  for (let i = 0; i < index; i++) {
    key = (key + KEY_ADVANCE) & 0xffff;
  }
  return key;
}

function tryRemapChar(val: number, remapChars: boolean): number {
  if (!remapChars) return val;
  switch (val) {
    case 0x202f:
      return 0xe07f;
    case 0x2026:
      return 0xe08d;
    case 0x2642:
      return 0xe08e;
    case 0x2640:
      return 0xe08f;
    default:
      return val;
  }
}

function tryUnmapChar(val: number, remapChars: boolean): number {
  if (!remapChars) return val;
  switch (val & 0xffff) {
    case 0xe07f:
      return 0x202f;
    case 0xe08d:
      return 0x2026;
    case 0xe08e:
      return 0x2642;
    case 0xe08f:
      return 0x2640;
    default:
      return val;
  }
}

function getVariableString(
  data: Buffer | Uint8Array,
  refI: { val: number },
  romType: number
): string {
  const count = readShort(data, refI.val);
  refI.val += 2;
  const variable = readShort(data, refI.val);
  refI.val += 2;

  switch (variable) {
    case KEY_TEXTRETURN:
      return "\\r";
    case KEY_TEXTCLEAR:
      return "\\c";
    case KEY_TEXTWAIT: {
      const time = readShort(data, refI.val);
      refI.val += 2;
      return `[WAIT ${time}]`;
    }
    case KEY_TEXTNULL: {
      const line = readShort(data, refI.val);
      refI.val += 2;
      return `[~ ${line}]`;
    }
  }

  const codes = getTextVariableCodes(romType);
  const varName =
    codes.get(variable) ??
    variable.toString(16).toUpperCase().padStart(4, "0");
  let sb = `[VAR ${varName}`;
  let remaining = count;
  if (remaining > 1) {
    sb += "(";
    while (remaining > 1 && refI.val < data.length) {
      const arg = readShort(data, refI.val);
      refI.val += 2;
      sb += arg.toString(16).toUpperCase().padStart(4, "0");
      if (--remaining === 1 || refI.val >= data.length) break;
      sb += ",";
    }
    sb += ")";
  }
  sb += "]";
  return sb;
}

function getEntryString(
  data: Buffer | null,
  remapChars: boolean,
  romType: number
): string {
  if (data == null) return "";

  let sb = "";
  let i = 0;

  while (i < data.length) {
    const val = readShort(data, i);
    if (val === KEY_TERMINATOR) break;
    i += 2;

    switch (val) {
      case KEY_VARIABLE: {
        const refI = { val: i };
        sb += getVariableString(data, refI, romType);
        i = refI.val;
        break;
      }
      case 0x0a: // '\n'
        sb += "\\n";
        break;
      case 0x5c: // '\\'
        sb += "\\\\";
        break;
      case 0x5b: // '['
        sb += "\\[";
        break;
      default:
        sb += String.fromCharCode(tryUnmapChar(val, remapChars));
    }
  }
  return sb;
}

export function readTexts(
  ds: Buffer | Uint8Array,
  remapChars: boolean,
  romType: number
): string[] {
  const strings: string[] = [];

  const numSections = readShort(ds, 0);
  const numEntries = readShort(ds, 2);
  const totalLength = readLong(ds, 4);
  const initialKey = readLong(ds, 8);
  const sectionDataOffset = readLong(ds, 0xc);
  const sectionLength = readLong(ds, sectionDataOffset);

  if (numSections !== 1 || initialKey !== 0 || sectionLength !== totalLength) {
    console.error("Invalid text file");
    return [];
  }

  for (let i = 0; i < numEntries; i++) {
    const entryOffset =
      readLong(ds, i * 8 + sectionDataOffset + 4) + sectionDataOffset;
    const entryLength = readShort(ds, i * 8 + sectionDataOffset + 8);
    const encEntryData = Buffer.from(
      ds.slice(entryOffset, entryOffset + entryLength * 2)
    );
    const decEntryData = cryptEntryData(encEntryData, getEntryKey(i));
    strings.push(getEntryString(decEntryData, remapChars, romType));
  }

  return strings;
}

function getEscapeValues(esc: string): number[] {
  switch (esc) {
    case "n":
      return [0x0a]; // '\n'
    case "\\":
      return [0x5c]; // '\\'
    case "[":
      return [0x5b]; // '['
    case "r":
      return [KEY_VARIABLE, 1, KEY_TEXTRETURN];
    case "c":
      return [KEY_VARIABLE, 1, KEY_TEXTCLEAR];
    default:
      throw new Error("Invalid terminated line: \\" + esc);
  }
}

function getVariableParameters(text: string, romType: number): number[] {
  const vals: number[] = [];
  const bracket = text.indexOf("(");
  const noArgs = bracket < 0;
  const variable = noArgs ? text : text.substring(0, bracket);
  const varVal = getVariableNumber(variable, romType);

  if (!noArgs) {
    const args = text.substring(bracket + 1, text.length - 1).split(",");
    vals.push(1 + args.length);
    vals.push(varVal);
    for (const arg of args) {
      vals.push(parseInt(arg, 16));
    }
  } else {
    vals.push(1);
    vals.push(varVal);
  }
  return vals;
}

function getVariableNumber(variable: string, romType: number): number {
  const v = getVariableCode(variable, romType);
  if (v !== 0) return v;
  const parsed = parseInt(variable, 10);
  if (isNaN(parsed)) {
    throw new Error("Variable parse error: " + variable);
  }
  return parsed;
}

function getVariableValues(variable: string, romType: number): number[] {
  const splitString = variable.split(" ");
  if (splitString.length < 2) {
    throw new Error("Incorrectly formatted variable text: " + variable);
  }

  const vals: number[] = [KEY_VARIABLE];
  switch (splitString[0]) {
    case "~":
      vals.push(1, KEY_TEXTNULL, parseInt(splitString[1], 10));
      break;
    case "WAIT":
      vals.push(1, KEY_TEXTWAIT, parseInt(splitString[1], 10));
      break;
    case "VAR":
      vals.push(...getVariableParameters(splitString[1], romType));
      break;
    default:
      throw new Error("Unknown variable method type: " + variable);
  }
  return vals;
}

function getEntryData(
  entry: string | null,
  romType: number,
  remapChars: boolean
): Buffer {
  if (entry == null) {
    return Buffer.alloc(2);
  }

  const words: number[] = [];
  let i = 0;

  while (i < entry.length) {
    let val = entry.charCodeAt(i++);
    val = tryRemapChar(val, remapChars);

    if (val === 0x5b) {
      // '['
      const bracket = entry.indexOf("]", i);
      if (bracket < 0) {
        throw new Error(
          "Variable text is not capped properly: " + entry
        );
      }
      const varText = entry.substring(i, bracket);
      const varValues = getVariableValues(varText, romType);
      words.push(...varValues);
      i = bracket + 1;
    } else if (val === 0x5c) {
      // '\\'
      const escValues = getEscapeValues(entry.charAt(i++));
      words.push(...escValues);
    } else {
      words.push(val);
    }
  }
  words.push(KEY_TERMINATOR);

  const buf = Buffer.alloc(words.length * 2);
  for (let w = 0; w < words.length; w++) {
    buf[w * 2] = words[w] & 0xff;
    buf[w * 2 + 1] = (words[w] >>> 8) & 0xff;
  }
  return buf;
}

export function saveEntry(
  originalData: Buffer | Uint8Array,
  values: string[],
  romType: number,
  remapChars = false,
  setEmptyText = false
): Buffer {
  let key = KEY_BASE;

  const entryBuffers: Buffer[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];
  let dataSize = 0;
  const dataOffset = 4 + values.length * 8;

  for (let i = 0; i < values.length; i++) {
    let text = values[i].trim();
    if (text.length === 0 && setEmptyText) {
      text = `[~ ${i}]`;
    }
    const decEntryData = getEntryData(text, romType, remapChars);
    const encEntryData = cryptEntryData(decEntryData, key);

    offsets.push(dataOffset + dataSize);
    lengths.push(encEntryData.length / 2);

    entryBuffers.push(encEntryData);
    dataSize += encEntryData.length;
    if (encEntryData.length % 4 === 2) {
      entryBuffers.push(Buffer.alloc(2));
      dataSize += 2;
    }
    key = (key + KEY_ADVANCE) & 0xffff;
  }

  const sectionDataOffset = 0x10;
  const sectionSize = 4 + values.length * 8 + dataSize;

  // Header: 0x14 bytes
  const header = Buffer.alloc(0x14);
  header.writeUInt16LE(1, 0); // numSections
  header.writeUInt16LE(values.length, 2); // numEntries
  header.writeInt32LE(sectionSize, 4); // totalLength
  header.writeInt32LE(0, 8); // initialKey
  header.writeInt32LE(sectionDataOffset, 0xc); // sectionDataOffset
  header.writeInt32LE(sectionSize, 0x10); // sectionLength

  // Offsets table
  const offsetsBuf = Buffer.alloc(values.length * 8);
  for (let i = 0; i < values.length; i++) {
    offsetsBuf.writeInt32LE(offsets[i], i * 8);
    offsetsBuf.writeInt16LE(lengths[i], i * 8 + 4);
    // 2 bytes padding (already zero)
  }

  return Buffer.concat([header, offsetsBuf, ...entryBuffers]);
}

// Export constants for testing
export {
  KEY_BASE,
  KEY_ADVANCE,
  KEY_TERMINATOR,
  KEY_VARIABLE,
  KEY_TEXTRETURN,
  KEY_TEXTCLEAR,
  KEY_TEXTWAIT,
  KEY_TEXTNULL,
};
