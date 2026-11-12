/**
 * AbstractDSRomHandler.ts - a base class for DS ROM handlers
 * which standardises common DS functions.
 *
 * Ported from AbstractDSRomHandler.java
 */

import * as fs from "fs";
import { AbstractRomHandler } from "./abstract-rom-handler";
import type { LogStream } from "./rom-handler";
import type { RandomInstance } from "../utils/random-source";
import { Type } from "../pokemon/type";
import { NDSRom } from "../nds/nds-rom";
import { NARCArchive } from "../nds/narc-archive";
import { PokeTextData } from "../text/poke-text-data";
import { makeFile as textToPokeFile } from "../text/text-to-poke";
import { FileFunctions } from "../utils/file-functions";
import { RomFunctions } from "../utils/rom-functions";

export abstract class AbstractDSRomHandler extends AbstractRomHandler {
  protected dataFolder: string = "";
  private loadedFN: string = "";
  protected baseRom: NDSRom | null = null;
  private arm9Extended = false;

  constructor(random: RandomInstance, logStream: LogStream | null) {
    super(random, logStream);
  }

  protected abstract detectNDSRom(ndsCode: string, version: number): boolean;
  protected abstract loadedROM(romCode: string, version: number): void;
  protected abstract savingROM(): void;

  loadRom(filename: string): boolean {
    const code = AbstractDSRomHandler.getROMCodeFromFile(filename);
    const ver = AbstractDSRomHandler.getVersionFromFile(filename);
    if (!this.detectNDSRom(code, ver)) {
      return false;
    }
    this.baseRom = new NDSRom(filename);
    this.loadedFN = filename;
    this.loadedROM(this.baseRom.getCode(), this.baseRom.getVersion());
    return true;
  }

  loadedFilename(): string {
    return this.loadedFN;
  }

  saveRomFile(filename: string, _seed: number): boolean {
    this.savingROM();
    this.baseRom!.saveTo(filename);
    return true;
  }

  saveRomDirectory(_filename: string): boolean {
    // DS games use ROM files, not directories
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
    logStream.println("DS ROM loaded: " + this.loadedFN);
  }

  closeInnerRom(): void {
    if (this.baseRom) {
      this.baseRom.closeROM();
    }
  }

  canChangeStaticPokemon(): boolean {
    return false;
  }

  hasPhysicalSpecialSplit(): boolean {
    return true;
  }

  // ---- NDS file operations ----

  protected readNARC(subpath: string): NARCArchive {
    const data = this.readFile(subpath);
    if (!data) {
      throw new Error("File not found in ROM: " + subpath);
    }
    return new NARCArchive(data);
  }

  protected writeNARC(subpath: string, narc: NARCArchive): void {
    this.writeFile(subpath, narc.getBytes());
  }

  protected readFile(location: string): Uint8Array | null {
    return this.baseRom!.getFile(location);
  }

  protected writeFile(location: string, data: Uint8Array): void {
    this.baseRom!.writeFile(location, data);
  }

  protected readARM9(): Uint8Array {
    return this.baseRom!.getARM9();
  }

  protected writeARM9(data: Uint8Array): void {
    this.baseRom!.writeARM9(data);
  }

  protected readOverlay(number: number): Uint8Array | null {
    return this.baseRom!.getOverlay(number);
  }

  protected writeOverlay(number: number, data: Uint8Array): void {
    this.baseRom!.writeOverlay(number, data);
  }

  // ---- Text operations (Gen4 text format) ----

  protected getStrings(msgNarc: NARCArchive, index: number): string[] {
    const pt = new PokeTextData(msgNarc.files[index]);
    pt.decrypt();
    return [...pt.strlist];
  }

  protected setStrings(msgNarc: NARCArchive, index: number, newStrings: string[], compressed = false): void {
    const rawUnencrypted = textToPokeFile(newStrings, compressed);
    const encrypt = new PokeTextData(rawUnencrypted);
    encrypt.setKey(0xD00E);
    encrypt.encrypt();
    msgNarc.files[index] = new Uint8Array(encrypt.get());
  }

  // ---- Static helper: read ROM code from file ----

  static getROMCodeFromFile(filename: string): string {
    const fd = fs.openSync(filename, "r");
    try {
      const buf = Buffer.alloc(4);
      fs.readSync(fd, buf, 0, 4, 0x0C);
      return buf.toString("ascii");
    } finally {
      fs.closeSync(fd);
    }
  }

  static getVersionFromFile(filename: string): number {
    const fd = fs.openSync(filename, "r");
    try {
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, 0x1E);
      return buf[0];
    } finally {
      fs.closeSync(fd);
    }
  }

  // ---- Byte helpers ----

  protected get3byte(amount: number): Uint8Array {
    const ret = new Uint8Array(3);
    ret[0] = amount & 0xff;
    ret[1] = (amount >> 8) & 0xff;
    ret[2] = (amount >> 16) & 0xff;
    return ret;
  }

  protected readByte(data: Uint8Array, offset: number): number {
    return data[offset] & 0xff;
  }

  protected readWord(data: Uint8Array, offset: number): number {
    return (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
  }

  protected readLong(data: Uint8Array, offset: number): number {
    return (
      (data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16) |
      ((data[offset + 3] & 0xff) << 24)
    );
  }

  protected readRelativePointer(data: Uint8Array, offset: number): number {
    return this.readLong(data, offset) + offset + 4;
  }

  protected writeWord(data: Uint8Array, offset: number, value: number): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
  }

  protected writeLong(data: Uint8Array, offset: number, value: number): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
    data[offset + 2] = (value >> 16) & 0xff;
    data[offset + 3] = (value >> 24) & 0xff;
  }

  protected writeRelativePointer(
    data: Uint8Array,
    offset: number,
    pointer: number
  ): void {
    const relPointer = pointer - (offset + 4);
    this.writeLong(data, offset, relPointer);
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

  protected typeTMPaletteNumber(t: Type | null): number {
    if (t == null) return 411; // CURSE
    switch (t) {
      case Type.FIGHTING:
        return 398;
      case Type.DRAGON:
        return 399;
      case Type.WATER:
        return 400;
      case Type.PSYCHIC:
        return 401;
      case Type.NORMAL:
        return 402;
      case Type.POISON:
        return 403;
      case Type.ICE:
        return 404;
      case Type.GRASS:
        return 405;
      case Type.FIRE:
        return 406;
      case Type.DARK:
        return 407;
      case Type.STEEL:
        return 408;
      case Type.ELECTRIC:
        return 409;
      case Type.GROUND:
        return 410;
      case Type.GHOST:
        return 411;
      case Type.ROCK:
        return 412;
      case Type.FLYING:
        return 413;
      case Type.BUG:
        return 610;
      default:
        return 411;
    }
  }

  protected findInData(data: Uint8Array, hexString: string): number {
    if (hexString.length % 2 !== 0) {
      return -3; // error
    }
    const searchFor = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < searchFor.length; i++) {
      searchFor[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
    }
    const found = RomFunctions.search(data, searchFor);
    if (found.length === 0) {
      return -1; // not found
    } else if (found.length > 1) {
      return -2; // not unique
    } else {
      return found[0];
    }
  }

  protected extendARM9(arm9: Uint8Array, extendBy: number, prefix: string, arm9Offset: number): Uint8Array {
    if (this.arm9Extended) return arm9;

    const prefixOffset = this.findInData(arm9, prefix);
    if (prefixOffset < 0) {
      // -1 = not found (most likely: ARM9 was never decompressed, or an
      //      earlier IPS patch mangled the prefix).
      // -2 = non-unique match.
      throw new Error(
        `extendARM9: TCMCopyingPrefix ${prefixOffset === -1 ? "not found" : "matched multiple times"} ` +
        `in ARM9 (len=${arm9.length}). The ARM9 may not have been decompressed on load, or an ` +
        `earlier IPS patch has corrupted the expected byte signature.`,
      );
    }
    const tcmCopyingPointersOffset = prefixOffset + prefix.length / 2;

    const oldDestPointersOffset = FileFunctions.readFullInt(arm9, tcmCopyingPointersOffset) - arm9Offset;
    const itcmSrcOffset = FileFunctions.readFullInt(arm9, tcmCopyingPointersOffset + 8) - arm9Offset;
    const itcmSizeOffset = oldDestPointersOffset + 4;
    const oldITCMSize = FileFunctions.readFullInt(arm9, itcmSizeOffset);

    const oldDTCMOffset = itcmSrcOffset + oldITCMSize;

    const newARM9 = new Uint8Array(arm9.length + extendBy);
    newARM9.set(arm9);

    // Change:
    // 1. Pointer to destination pointers/sizes
    // 2. ARM9 size
    // 3. Size of the area copied to ITCM
    FileFunctions.writeFullInt(newARM9, tcmCopyingPointersOffset,
      oldDestPointersOffset + extendBy + arm9Offset);
    FileFunctions.writeFullInt(newARM9, tcmCopyingPointersOffset + 4,
      newARM9.length + arm9Offset);
    FileFunctions.writeFullInt(newARM9, itcmSizeOffset, oldITCMSize + extendBy);

    // Shift everything after ITCM section
    newARM9.copyWithin(oldDTCMOffset + extendBy, oldDTCMOffset, arm9.length);

    this.arm9Extended = true;

    return newARM9;
  }
}
