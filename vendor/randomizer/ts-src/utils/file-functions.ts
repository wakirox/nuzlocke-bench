import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { crc32 } from "./crc32";
import { SysConstants } from "./sys-constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const overrideFiles: string[] = [
  SysConstants.customNamesFile,
  SysConstants.tclassesFile,
  SysConstants.tnamesFile,
  SysConstants.nnamesFile,
];

export class FileFunctions {
  static fixFilename(
    originalPath: string,
    defaultExtension: string,
    bannedExtensions: string[] = []
  ): string {
    let absolutePath = path.resolve(originalPath);
    for (const bannedExtension of bannedExtensions) {
      if (absolutePath.endsWith("." + bannedExtension)) {
        absolutePath =
          absolutePath.substring(0, absolutePath.lastIndexOf(".") + 1) +
          defaultExtension;
        break;
      }
    }
    if (!absolutePath.endsWith("." + defaultExtension)) {
      absolutePath += "." + defaultExtension;
    }
    return absolutePath;
  }

  static configExists(filename: string): boolean {
    if (overrideFiles.includes(filename)) {
      const fh1 = path.join(SysConstants.ROOT_PATH, filename);
      if (fs.existsSync(fh1)) {
        try {
          fs.accessSync(fh1, fs.constants.R_OK);
          return true;
        } catch {
          // fall through
        }
      }
      const fh2 = path.join(".", filename);
      if (fs.existsSync(fh2)) {
        try {
          fs.accessSync(fh2, fs.constants.R_OK);
          return true;
        } catch {
          // fall through
        }
      }
    }
    // Check for bundled config resource
    const configPath = path.resolve(
      __dirname,
      "..",
      "config",
      filename
    );
    return fs.existsSync(configPath);
  }

  static openConfig(filename: string): Buffer {
    if (overrideFiles.includes(filename)) {
      const fh1 = path.join(SysConstants.ROOT_PATH, filename);
      if (fs.existsSync(fh1)) {
        try {
          fs.accessSync(fh1, fs.constants.R_OK);
          return fs.readFileSync(fh1);
        } catch {
          // fall through
        }
      }
      const fh2 = path.join(".", filename);
      if (fs.existsSync(fh2)) {
        try {
          fs.accessSync(fh2, fs.constants.R_OK);
          return fs.readFileSync(fh2);
        } catch {
          // fall through
        }
      }
    }
    const configPath = path.resolve(
      __dirname,
      "..",
      "config",
      filename
    );
    if (fs.existsSync(configPath)) {
      return fs.readFileSync(configPath);
    }
    // Fallback: look in Java source config directory
    const javaConfigPath = path.resolve(
      __dirname,
      "../../src/com/dabomstew/pkrandom/config",
      filename
    );
    return fs.readFileSync(javaConfigPath);
  }

  static readFullLong(data: Uint8Array, offset: number): bigint {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return view.getBigInt64(offset, true); // little-endian
  }

  static readFullInt(data: Uint8Array, offset: number): number {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return view.getInt32(offset, true); // little-endian
  }

  static readFullIntBigEndian(data: Uint8Array, offset: number): number {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return view.getInt32(offset, false); // big-endian
  }

  static read2ByteIntBigEndian(data: Uint8Array, index: number): number {
    return (data[index + 1] & 0xff) | ((data[index] & 0xff) << 8);
  }

  static read2ByteInt(data: Uint8Array, index: number): number {
    return (data[index] & 0xff) | ((data[index + 1] & 0xff) << 8);
  }

  static write2ByteInt(
    data: Uint8Array,
    offset: number,
    value: number
  ): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
  }

  static writeFullInt(
    data: Uint8Array,
    offset: number,
    value: number
  ): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setInt32(offset, value, true); // little-endian
  }

  static writeFullIntBigEndian(
    data: Uint8Array,
    offset: number,
    value: number
  ): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setInt32(offset, value, false); // big-endian
  }

  static writeFullLong(
    data: Uint8Array,
    offset: number,
    value: bigint
  ): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setBigInt64(offset, value, true); // little-endian
  }

  static readFileFullyIntoBuffer(filename: string): Uint8Array {
    if (
      !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()
    ) {
      throw new Error(`File not found: ${filename}`);
    }
    return new Uint8Array(fs.readFileSync(filename));
  }

  static readFullyIntoBuffer(
    data: Buffer | Uint8Array,
    bytes: number
  ): Uint8Array {
    const buf = new Uint8Array(bytes);
    buf.set(data.subarray(0, bytes));
    return buf;
  }

  static read2ByteBigEndianIntFromFile(
    fd: number,
    offset: number
  ): number {
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, offset);
    return FileFunctions.read2ByteIntBigEndian(new Uint8Array(buf), 0);
  }

  static readBigEndianIntFromFile(
    fd: number,
    offset: number
  ): number {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, offset);
    return FileFunctions.readFullIntBigEndian(new Uint8Array(buf), 0);
  }

  static readIntFromFile(fd: number, offset: number): number {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, offset);
    return FileFunctions.readFullInt(new Uint8Array(buf), 0);
  }

  static writeBytesToFile(filename: string, data: Uint8Array): void {
    fs.writeFileSync(filename, data);
  }

  static getConfigAsBytes(filename: string): Uint8Array {
    return new Uint8Array(FileFunctions.openConfig(filename));
  }

  static getFileChecksum(filenameOrData: string | Buffer): number {
    try {
      let data: Buffer;
      if (typeof filenameOrData === "string") {
        data = FileFunctions.openConfig(filenameOrData);
      } else {
        data = filenameOrData;
      }
      const text = data.toString("utf-8");
      const lines = text.split(/\r?\n/);
      const crcData: Uint8Array[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          crcData.push(Buffer.from(trimmed, "utf-8"));
        }
      }
      // Compute CRC32 over all non-empty trimmed lines
      let crcValue = 0;
      for (const chunk of crcData) {
        crcValue = crc32(chunk, crcValue);
      }
      return crcValue >>> 0; // Ensure unsigned
    } catch {
      return 0;
    }
  }

  static checkOtherCRC(
    data: Uint8Array,
    byteIndex: number,
    switchIndex: number,
    filename: string,
    offsetInData: number
  ): boolean {
    const switches = data[byteIndex] & 0xff;
    if (((switches >> switchIndex) & 0x01) === 0x01) {
      const crc = FileFunctions.readFullIntBigEndian(data, offsetInData);
      return FileFunctions.getFileChecksum(filename) === crc;
    }
    return true;
  }

  static getCRC32(data: Uint8Array): number {
    return crc32(data) >>> 0;
  }

  static getCodeTweakFile(filename: string): Uint8Array {
    const patchPath = path.resolve(
      __dirname,
      "..",
      "patches",
      filename
    );
    if (fs.existsSync(patchPath)) {
      return new Uint8Array(fs.readFileSync(patchPath));
    }
    // Fall back to Java source patches directory
    const javaPath = path.resolve(
      __dirname,
      "../../src/com/dabomstew/pkrandom/patches",
      filename
    );
    return new Uint8Array(fs.readFileSync(javaPath));
  }

  static applyPatch(rom: Uint8Array, patchName: string): void {
    const patch = FileFunctions.getCodeTweakFile(patchName + ".ips");

    const patchlen = patch.length;
    if (
      patchlen < 8 ||
      patch[0] !== 0x50 || // 'P'
      patch[1] !== 0x41 || // 'A'
      patch[2] !== 0x54 || // 'T'
      patch[3] !== 0x43 || // 'C'
      patch[4] !== 0x48    // 'H'
    ) {
      throw new Error("not a valid IPS file");
    }

    let offset = 5;
    while (offset + 2 < patchlen) {
      const writeOffset = FileFunctions.readIPSOffset(patch, offset);
      if (writeOffset === 0x454f46) {
        // EOF
        return;
      }
      offset += 3;
      if (offset + 1 >= patchlen) {
        throw new Error(
          "abrupt ending to IPS file, entry cut off before size"
        );
      }
      const size = FileFunctions.readIPSSize(patch, offset);
      offset += 2;
      if (size === 0) {
        // RLE
        if (offset + 1 >= patchlen) {
          throw new Error(
            "abrupt ending to IPS file, entry cut off before RLE size"
          );
        }
        const rleSize = FileFunctions.readIPSSize(patch, offset);
        if (writeOffset + rleSize > rom.length) {
          throw new Error(
            "trying to patch data past the end of the ROM file"
          );
        }
        offset += 2;
        if (offset >= patchlen) {
          throw new Error(
            "abrupt ending to IPS file, entry cut off before RLE byte"
          );
        }
        const rleByte = patch[offset++];
        for (let i = writeOffset; i < writeOffset + rleSize; i++) {
          rom[i] = rleByte;
        }
      } else {
        if (offset + size > patchlen) {
          throw new Error(
            "abrupt ending to IPS file, entry cut off before end of data block"
          );
        }
        if (writeOffset + size > rom.length) {
          throw new Error(
            "trying to patch data past the end of the ROM file"
          );
        }
        rom.set(patch.subarray(offset, offset + size), writeOffset);
        offset += size;
      }
    }
    throw new Error("improperly terminated IPS file");
  }

  private static readIPSOffset(data: Uint8Array, offset: number): number {
    return (
      ((data[offset] & 0xff) << 16) |
      ((data[offset + 1] & 0xff) << 8) |
      (data[offset + 2] & 0xff)
    );
  }

  private static readIPSSize(data: Uint8Array, offset: number): number {
    return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
  }

  static convIntArrToByteArr(arg: number[]): Uint8Array {
    const out = new Uint8Array(arg.length);
    for (let i = 0; i < arg.length; i++) {
      out[i] = arg[i] & 0xff;
    }
    return out;
  }
}
