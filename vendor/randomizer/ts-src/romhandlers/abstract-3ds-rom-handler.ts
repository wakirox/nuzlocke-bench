/**
 * Abstract3DSRomHandler.ts - a base class for 3DS ROM handlers
 * which standardises common 3DS functions.
 *
 * Ported from Abstract3DSRomHandler.java
 */

import { AbstractRomHandler } from "./abstract-rom-handler";
import type { LogStream } from "./rom-handler";
import type { RandomInstance } from "../utils/random-source";
import { Type } from "../pokemon/type";
import { GARCArchive } from "../ctr/garc-archive";

export abstract class Abstract3DSRomHandler extends AbstractRomHandler {
  private loadedFN: string = "";
  private gameUpdateLoaded: boolean = false;

  constructor(random: RandomInstance, logStream: LogStream | null) {
    super(random, logStream);
  }

  protected abstract detect3DSRom(
    productCode: string,
    titleId: string
  ): boolean;

  loadRom(filename: string): boolean {
    // In a real implementation, this would detect and load the 3DS ROM
    this.loadedFN = filename;
    return true;
  }

  loadedFilename(): string {
    return this.loadedFN;
  }

  protected abstract loadedROM(
    productCode: string,
    titleId: string
  ): void;
  protected abstract savingROM(): void;
  protected abstract getGameAcronym(): string;

  saveRomFile(_filename: string, _seed: number): boolean {
    return true;
  }

  saveRomDirectory(_filename: string): boolean {
    return true;
  }

  protected abstract isGameUpdateSupported(version: number): boolean;

  hasGameUpdateLoaded(): boolean {
    return this.gameUpdateLoaded;
  }

  loadGameUpdate(_filename: string): boolean {
    this.gameUpdateLoaded = true;
    return true;
  }

  removeGameUpdate(): void {
    this.gameUpdateLoaded = false;
  }

  protected abstract getGameVersion(): string;

  getGameUpdateVersion(): string | null {
    return this.getGameVersion();
  }

  printRomDiagnostics(logStream: LogStream): void {
    logStream.println("3DS ROM loaded: " + this.loadedFN);
  }

  hasPhysicalSpecialSplit(): boolean {
    return true;
  }

  protected readByteIntoFlags(
    data: Uint8Array,
    flags: boolean[],
    offsetIntoFlags: number,
    offsetIntoData: number
  ): void {
    const thisByte = data[offsetIntoData] & 0xff;
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

  protected readWord(data: Uint8Array, offset: number): number {
    return (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
  }

  protected writeWord(data: Uint8Array, offset: number, value: number): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
  }

  protected readLong(data: Uint8Array, offset: number): number {
    return (
      (data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16) |
      ((data[offset + 3] & 0xff) << 24)
    );
  }

  protected writeLong(data: Uint8Array, offset: number, value: number): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
    data[offset + 2] = (value >> 16) & 0xff;
    data[offset + 3] = (value >> 24) & 0xff;
  }

  // Stub methods for reading/writing 3DS ROM data.
  // These will be fully implemented when the 3DS I/O layer is complete.
  protected readCode(): Uint8Array {
    return new Uint8Array(0);
  }

  protected writeCode(_data: Uint8Array): void {
    // stub
  }

  protected readGARC(_subpath: string, _skipDecompression: boolean): GARCArchive {
    return new GARCArchive();
  }

  protected writeGARC(_subpath: string, _garc: GARCArchive): void {
    // stub
  }

  protected readFile(_location: string): Uint8Array {
    return new Uint8Array(0);
  }

  protected writeFile(_location: string, _data: Uint8Array): void {
    // stub
  }

  protected typeTMPaletteNumber(t: Type | null, isGen7: boolean): number {
    if (t == null) return 322;
    switch (t) {
      case Type.DARK:
        return 309;
      case Type.DRAGON:
        return 310;
      case Type.PSYCHIC:
        return 311;
      case Type.NORMAL:
        return 312;
      case Type.POISON:
        return 313;
      case Type.ICE:
        return 314;
      case Type.FIGHTING:
        return 315;
      case Type.FIRE:
        return 316;
      case Type.WATER:
        return 317;
      case Type.FLYING:
        return 323;
      case Type.GRASS:
        return 318;
      case Type.ROCK:
        return 319;
      case Type.ELECTRIC:
        return 320;
      case Type.GROUND:
        return 321;
      case Type.GHOST:
        return 322;
      case Type.STEEL:
        return 324;
      case Type.BUG:
        return 325;
      case Type.FAIRY:
        return isGen7 ? 555 : 546;
      default:
        return 322;
    }
  }
}
