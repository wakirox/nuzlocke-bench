import * as fs from "fs";
import { FileFunctions } from "./file-functions";
import { SysConstants } from "./sys-constants";

export enum InvalidROMExceptionType {
  LENGTH = "LENGTH",
  ZIP_FILE = "ZIP_FILE",
  RAR_FILE = "RAR_FILE",
  IPS_FILE = "IPS_FILE",
  UNREADABLE = "UNREADABLE",
}

export class InvalidROMException extends Error {
  private readonly type: InvalidROMExceptionType;

  constructor(type: InvalidROMExceptionType, message: string) {
    super(message);
    this.type = type;
    this.name = "InvalidROMException";
    Object.setPrototypeOf(this, InvalidROMException.prototype);
  }

  getType(): InvalidROMExceptionType {
    return this.type;
  }
}

export class Utils {
  static validateRomFile(filePath: string): void {
    const fileName = filePath.split("/").pop() || filePath;
    try {
      const fd = fs.openSync(filePath, "r");
      const sig = Buffer.alloc(10);
      const sigLength = fs.readSync(fd, sig, 0, 10, 0);
      fs.closeSync(fd);

      if (sigLength < 10) {
        throw new InvalidROMException(
          InvalidROMExceptionType.LENGTH,
          `${fileName} appears to be a blank or nearly blank file.`
        );
      }
      if (
        sig[0] === 0x50 &&
        sig[1] === 0x4b &&
        sig[2] === 0x03 &&
        sig[3] === 0x04
      ) {
        throw new InvalidROMException(
          InvalidROMExceptionType.ZIP_FILE,
          `${fileName} is a ZIP archive, not a ROM.`
        );
      }
      if (
        sig[0] === 0x52 &&
        sig[1] === 0x61 &&
        sig[2] === 0x72 &&
        sig[3] === 0x21 &&
        sig[4] === 0x1a &&
        sig[5] === 0x07
      ) {
        throw new InvalidROMException(
          InvalidROMExceptionType.RAR_FILE,
          `${fileName} is a RAR archive, not a ROM.`
        );
      }
      if (
        sig[0] === 0x50 && // P
        sig[1] === 0x41 && // A
        sig[2] === 0x54 && // T
        sig[3] === 0x43 && // C
        sig[4] === 0x48 // H
      ) {
        throw new InvalidROMException(
          InvalidROMExceptionType.IPS_FILE,
          `${fileName} is a IPS patch, not a ROM.`
        );
      }
    } catch (ex) {
      if (ex instanceof InvalidROMException) {
        throw ex;
      }
      throw new InvalidROMException(
        InvalidROMExceptionType.UNREADABLE,
        `Could not read ${fileName} from disk.`
      );
    }
  }

  static testForRequiredConfigs(): void {
    const required = [
      "gameboy_jpn.tbl",
      "rby_english.tbl",
      "rby_freger.tbl",
      "rby_espita.tbl",
      "green_translation.tbl",
      "gsc_english.tbl",
      "gsc_freger.tbl",
      "gsc_espita.tbl",
      "gba_english.tbl",
      "gba_jpn.tbl",
      "Generation4.tbl",
      "Generation5.tbl",
      "gen1_offsets.ini",
      "gen2_offsets.ini",
      "gen3_offsets.ini",
      "gen4_offsets.ini",
      "gen5_offsets.ini",
      "gen6_offsets.ini",
      "gen7_offsets.ini",
      SysConstants.customNamesFile,
    ];
    for (const filename of required) {
      if (!FileFunctions.configExists(filename)) {
        throw new Error(`File not found: ${filename}`);
      }
    }
  }

  static getExecutionLocation(): string {
    return process.argv[1] || process.cwd();
  }
}
