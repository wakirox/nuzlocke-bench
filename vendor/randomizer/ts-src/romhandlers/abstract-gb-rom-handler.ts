/**
 * AbstractGBRomHandler.ts - a base class for GB/GBA ROM handlers
 * which standardises common GB(A) functions.
 *
 * Ported from AbstractGBRomHandler.java
 */

import * as fs from "fs";
import * as path from "path";
import { AbstractRomHandler } from "./abstract-rom-handler";
import type { LogStream } from "./rom-handler";
import type { RandomInstance } from "../utils/random-source";

export abstract class AbstractGBRomHandler extends AbstractRomHandler {
  protected rom: Uint8Array = new Uint8Array(0);
  protected originalRom: Uint8Array = new Uint8Array(0);
  private loadedFN: string = "";

  constructor(random: RandomInstance, logStream: LogStream | null) {
    super(random, logStream);
  }

  loadRom(filename: string): boolean {
    const loaded = AbstractGBRomHandler.loadFile(filename);
    if (!this.detectRom(loaded)) {
      return false;
    }
    this.rom = loaded;
    this.originalRom = new Uint8Array(this.rom);
    this.loadedFN = filename;
    this.loadedRom();
    return true;
  }

  loadedFilename(): string {
    return this.loadedFN;
  }

  saveRomFile(filename: string, _seed: number): boolean {
    this.savingRom();
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filename, this.rom);
    return true;
  }

  saveRomDirectory(_filename: string): boolean {
    return true;
  }

  hasGameUpdateLoaded(): boolean {
    return false;
  }

  loadGameUpdate(_filename: string): boolean {
    return true;
  }

  removeGameUpdate(): void {
    // do nothing
  }

  getGameUpdateVersion(): string | null {
    return null;
  }

  printRomDiagnostics(logStream: LogStream): void {
    logStream.println("File name: " + this.loadedFN);
  }

  canChangeStaticPokemon(): boolean {
    return true;
  }

  hasPhysicalSpecialSplit(): boolean {
    return false;
  }

  abstract detectRom(rom: Uint8Array): boolean;
  abstract loadedRom(): void;
  abstract savingRom(): void;

  protected static loadFile(filename: string): Uint8Array {
    const buffer = fs.readFileSync(filename);
    return new Uint8Array(buffer);
  }

  protected readByteIntoFlags(
    flags: boolean[],
    offsetIntoFlags: number,
    offsetIntoROM: number
  ): void {
    const thisByte = this.rom[offsetIntoROM] & 0xff;
    for (let i = 0; i < 8 && i + offsetIntoFlags < flags.length; i++) {
      flags[offsetIntoFlags + i] = ((thisByte >> i) & 0x01) === 0x01;
    }
  }

  protected getByteFromFlags(
    flags: boolean[],
    offsetIntoFlags: number
  ): number {
    let thisByte = 0;
    for (let i = 0; i < 8 && i + offsetIntoFlags < flags.length; i++) {
      thisByte |= (flags[offsetIntoFlags + i] ? 1 : 0) << i;
    }
    return thisByte & 0xff;
  }

  protected readWord(offset: number): number;
  protected readWord(data: Uint8Array, offset: number): number;
  protected readWord(
    offsetOrData: number | Uint8Array,
    offset?: number
  ): number {
    if (typeof offsetOrData === "number") {
      return (
        (this.rom[offsetOrData] & 0xff) +
        ((this.rom[offsetOrData + 1] & 0xff) << 8)
      );
    }
    return (
      (offsetOrData[offset!] & 0xff) +
      ((offsetOrData[offset! + 1] & 0xff) << 8)
    );
  }

  protected writeWord(offset: number, value: number): void;
  protected writeWord(data: Uint8Array, offset: number, value: number): void;
  protected writeWord(
    offsetOrData: number | Uint8Array,
    valueOrOffset: number,
    value?: number
  ): void {
    if (typeof offsetOrData === "number") {
      this.rom[offsetOrData] = valueOrOffset % 0x100;
      this.rom[offsetOrData + 1] = Math.floor(valueOrOffset / 0x100) % 0x100;
    } else {
      offsetOrData[valueOrOffset] = value! % 0x100;
      offsetOrData[valueOrOffset + 1] = Math.floor(value! / 0x100) % 0x100;
    }
  }

  protected matches(
    data: Uint8Array,
    offset: number,
    needle: Uint8Array
  ): boolean {
    for (let i = 0; i < needle.length; i++) {
      if (offset + i >= data.length) return false;
      if (data[offset + i] !== needle[i]) return false;
    }
    return true;
  }
}
