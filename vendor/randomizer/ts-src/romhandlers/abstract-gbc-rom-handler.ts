/**
 * AbstractGBCRomHandler.ts - an extension of AbstractGBRomHandler
 * used for Gen 1 and Gen 2.
 *
 * Ported from AbstractGBCRomHandler.java
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { AbstractGBRomHandler } from "./abstract-gb-rom-handler";
import type { LogStream } from "./rom-handler";
import type { RandomInstance } from "../utils/random-source";
import * as GBConstants from "../constants/gb-constants";

export abstract class AbstractGBCRomHandler extends AbstractGBRomHandler {
  private tb: (string | null)[] = new Array(256).fill(null);
  private d: Map<string, number> = new Map();
  private longestTableToken = 0;

  constructor(random: RandomInstance, logStream: LogStream | null) {
    super(random, logStream);
  }

  protected clearTextTables(): void {
    this.tb = new Array(256).fill(null);
    this.d.clear();
    this.longestTableToken = 0;
  }

  protected readTextTable(name: string): void {
    // Look for the .tbl file in the Java config directory
    const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config');
    const filePath = path.join(configDir, name + '.tbl');
    if (!fs.existsSync(filePath)) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      // Keep the value untrimmed: "7F= " maps a byte to a space (nuzlocke-bench fix).
      const q = line.replace(/\r$/, '');
      if (q.trim() === '') continue;
      const eqIdx = q.indexOf('=');
      if (eqIdx < 0) continue;
      const hexStr = q.substring(0, eqIdx).trim();
      const value = q.substring(eqIdx + 1);
      const hexcode = parseInt(hexStr, 16);
      if (isNaN(hexcode) || hexcode < 0 || hexcode > 255) continue;
      if (this['tb'][hexcode] != null) {
        const oldMatch = this['tb'][hexcode]!;
        this['tb'][hexcode] = null;
        if (this['d'].get(oldMatch) === hexcode) {
          this['d'].delete(oldMatch);
        }
      }
      this['tb'][hexcode] = value;
      this['longestTableToken'] = Math.max(this['longestTableToken'], value.length);
      this['d'].set(value, hexcode);
    }
  }

  protected readString(
    offset: number,
    maxLength: number,
    textEngineMode: boolean
  ): string {
    let str = "";
    for (let c = 0; c < maxLength; c++) {
      const currChar = this.rom[offset + c] & 0xff;
      if (this.tb[currChar] != null) {
        str += this.tb[currChar];
        if (
          textEngineMode &&
          (this.tb[currChar] === "\\r" || this.tb[currChar] === "\\e")
        ) {
          break;
        }
      } else {
        if (currChar === GBConstants.stringTerminator) {
          break;
        } else {
          str += "\\x" + currChar.toString(16).padStart(2, "0").toUpperCase();
        }
      }
    }
    return str;
  }

  protected lengthOfStringAt(
    offset: number,
    textEngineMode: boolean
  ): number {
    let len = 0;
    while (
      this.rom[offset + len] !== GBConstants.stringTerminator &&
      (!textEngineMode ||
        (this.rom[offset + len] !== GBConstants.stringPrintedTextEnd &&
          this.rom[offset + len] !== GBConstants.stringPrintedTextPromptEnd))
    ) {
      len++;
    }
    if (
      textEngineMode &&
      (this.rom[offset + len] === GBConstants.stringPrintedTextEnd ||
        this.rom[offset + len] === GBConstants.stringPrintedTextPromptEnd)
    ) {
      len++;
    }
    return len;
  }

  protected translateString(text: string): Uint8Array {
    const bytes: number[] = [];
    let remaining = text;
    while (remaining.length !== 0) {
      let i = Math.max(0, this.longestTableToken - remaining.length);
      if (
        remaining.charAt(0) === "\\" &&
        remaining.length > 3 &&
        remaining.charAt(1) === "x"
      ) {
        bytes.push(parseInt(remaining.substring(2, 4), 16));
        remaining = remaining.substring(4);
      } else {
        while (
          !(
            this.d.has(remaining.substring(0, this.longestTableToken - i)) ||
            i === this.longestTableToken
          )
        ) {
          i++;
        }
        if (i === this.longestTableToken) {
          remaining = remaining.substring(1);
        } else {
          bytes.push(
            this.d.get(remaining.substring(0, this.longestTableToken - i))! &
              0xff
          );
          remaining = remaining.substring(this.longestTableToken - i);
        }
      }
    }
    return new Uint8Array(bytes);
  }

  protected readFixedLengthString(offset: number, length: number): string {
    return this.readString(offset, length, false);
  }

  protected writeFixedLengthString(
    str: string,
    offset: number,
    length: number
  ): void {
    const translated = this.translateString(str);
    const len = Math.min(translated.length, length);
    this.rom.set(translated.subarray(0, len), offset);
    for (let i = len; i < length; i++) {
      this.rom[offset + i] = GBConstants.stringTerminator;
    }
  }

  protected writeVariableLengthString(
    str: string,
    offset: number,
    alreadyTerminated: boolean
  ): void {
    const translated = this.translateString(str);
    this.rom.set(translated, offset);
    if (!alreadyTerminated) {
      this.rom[offset + translated.length] = GBConstants.stringTerminator;
    }
  }

  protected makeGBPointer(offset: number): number {
    if (offset < GBConstants.bankSize) {
      return offset;
    }
    return (offset % GBConstants.bankSize) + GBConstants.bankSize;
  }

  protected bankOf(offset: number): number {
    return Math.floor(offset / GBConstants.bankSize);
  }

  protected calculateOffset(bank: number, pointer: number): number {
    if (pointer < GBConstants.bankSize) {
      return pointer;
    }
    return (pointer % GBConstants.bankSize) + bank * GBConstants.bankSize;
  }

  protected readVariableLengthString(
    offset: number,
    textEngineMode: boolean
  ): string {
    return this.readString(offset, Number.MAX_SAFE_INTEGER, textEngineMode);
  }

  protected static romSig(rom: Uint8Array, sig: string): boolean {
    const sigOffset = GBConstants.romSigOffset;
    for (let i = 0; i < sig.length; i++) {
      if (rom[sigOffset + i] !== sig.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  protected static romCode(rom: Uint8Array, code: string): boolean {
    const sigOffset = GBConstants.romCodeOffset;
    for (let i = 0; i < code.length; i++) {
      if (rom[sigOffset + i] !== code.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
}
