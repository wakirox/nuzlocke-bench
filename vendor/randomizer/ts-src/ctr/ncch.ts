/*----------------------------------------------------------------------------*/
/*--  ncch.ts - a base class for dealing with 3DS NCCH ROM images.          --*/
/*--                                                                        --*/
/*--  Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team          --*/
/*--  Pokemon and any associated names and the like are                      --*/
/*--  trademark and (C) Nintendo 1996-2020.                                  --*/
/*--                                                                        --*/
/*--  Ported to TypeScript by UPR-ZX Team under the terms of the GPL:       --*/
/*--                                                                        --*/
/*--  This program is free software: you can redistribute it and/or modify  --*/
/*--  it under the terms of the GNU General Public License as published by  --*/
/*--  the Free Software Foundation, either version 3 of the License, or     --*/
/*--  (at your option) any later version.                                   --*/
/*--                                                                        --*/
/*--  This program is distributed in the hope that it will be useful,       --*/
/*--  but WITHOUT ANY WARRANTY; without even the implied warranty of        --*/
/*--  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the          --*/
/*--  GNU General Public License for more details.                          --*/
/*--                                                                        --*/
/*--  You should have received a copy of the GNU General Public License     --*/
/*--  along with this program. If not, see <http://www.gnu.org/licenses/>.  --*/
/*----------------------------------------------------------------------------*/

import * as fs from "fs";
import * as path from "path";
import { FileFunctions } from "../utils/file-functions.js";
import { SMDH } from "./smdh.js";
import { RomfsFile, type RomfsFileParent } from "./romfs-file.js";

const MEDIA_UNIT_SIZE = 0x200;
const HEADER_AND_EXHEADER_SIZE = 0xa00;
const NCSD_MAGIC = 0x4e435344;
const CIA_HEADER_SIZE = 0x2020;
const NCCH_MAGIC = 0x4e434348;
const NCCH_AND_NCSD_MAGIC_OFFSET = 0x100;
const EXEFS_HEADER_SIZE = 0x200;
const ROMFS_HEADER_SIZE = 0x5c;
const ROMFS_MAGIC_1 = 0x49564643;
const ROMFS_MAGIC_2 = 0x00000100;
const LEVEL3_HEADER_SIZE = 0x28;
const METADATA_UNUSED = 0xffffffff;

interface ExefsFileHeader {
  filename: string;
  offset: number;
  size: number;
}

interface DirectoryMetadata {
  parentDirectoryOffset: number;
  siblingDirectoryOffset: number;
  firstChildDirectoryOffset: number;
  firstFileOffset: number;
  nextDirectoryInHashBucketOffset: number;
  nameLength: number;
  name: string;
}

interface FileMetadata {
  offset: number;
  parentDirectoryOffset: number;
  siblingFileOffset: number;
  fileDataOffset: number;
  fileDataLength: number;
  nextFileInHashBucketOffset: number;
  nameLength: number;
  name: string;
  file: RomfsFile;
}

function decodeUtf16LE(data: Uint8Array, offset: number, len: number): string {
  const codeUnits: number[] = [];
  for (let i = 0; i < len; i += 2) {
    const unit = data[offset + i] | (data[offset + i + 1] << 8);
    if (unit === 0) break;
    codeUnits.push(unit);
  }
  return String.fromCharCode(...codeUnits);
}

function parseExefsFileHeader(
  exefsHeaderData: Uint8Array,
  fileHeaderOffset: number
): ExefsFileHeader {
  const filenameBytes = exefsHeaderData.subarray(
    fileHeaderOffset,
    fileHeaderOffset + 0x08
  );
  let filename = "";
  for (let i = 0; i < 8; i++) {
    if (filenameBytes[i] === 0) break;
    filename += String.fromCharCode(filenameBytes[i]);
  }
  const offset = FileFunctions.readFullInt(
    exefsHeaderData,
    fileHeaderOffset + 0x08
  );
  const size = FileFunctions.readFullInt(
    exefsHeaderData,
    fileHeaderOffset + 0x0c
  );
  return { filename, offset, size };
}

function exefsHeaderAsBytes(header: ExefsFileHeader): Uint8Array {
  const output = new Uint8Array(0x10);
  for (let i = 0; i < header.filename.length && i < 8; i++) {
    output[i] = header.filename.charCodeAt(i);
  }
  FileFunctions.writeFullInt(output, 0x08, header.offset);
  FileFunctions.writeFullInt(output, 0x0c, header.size);
  return output;
}

function parseDirectoryMetadata(
  block: Uint8Array,
  offset: number
): DirectoryMetadata {
  const parentDirectoryOffset = FileFunctions.readFullInt(block, offset);
  const siblingDirectoryOffset = FileFunctions.readFullInt(
    block,
    offset + 0x04
  );
  const firstChildDirectoryOffset = FileFunctions.readFullInt(
    block,
    offset + 0x08
  );
  const firstFileOffset = FileFunctions.readFullInt(block, offset + 0x0c);
  const nextDirectoryInHashBucketOffset = FileFunctions.readFullInt(
    block,
    offset + 0x10
  );
  const nameLength = FileFunctions.readFullInt(block, offset + 0x14);
  let name = "";
  if (nameLength !== METADATA_UNUSED && nameLength > 0) {
    name = decodeUtf16LE(block, offset + 0x18, nameLength);
  }
  return {
    parentDirectoryOffset,
    siblingDirectoryOffset,
    firstChildDirectoryOffset,
    firstFileOffset,
    nextDirectoryInHashBucketOffset,
    nameLength,
    name,
  };
}

function parseFileMetadata(
  block: Uint8Array,
  offset: number
): Omit<FileMetadata, "file"> {
  const parentDirectoryOffset = FileFunctions.readFullInt(block, offset);
  const siblingFileOffset = FileFunctions.readFullInt(block, offset + 0x04);
  const fileDataOffset = Number(
    FileFunctions.readFullLong(block, offset + 0x08)
  );
  const fileDataLength = Number(
    FileFunctions.readFullLong(block, offset + 0x10)
  );
  const nextFileInHashBucketOffset = FileFunctions.readFullInt(
    block,
    offset + 0x18
  );
  const nameLength = FileFunctions.readFullInt(block, offset + 0x1c);
  let name = "";
  if (nameLength !== METADATA_UNUSED && nameLength > 0) {
    name = decodeUtf16LE(block, offset + 0x20, nameLength);
  }
  return {
    offset,
    parentDirectoryOffset,
    siblingFileOffset,
    fileDataOffset,
    fileDataLength,
    nextFileInHashBucketOffset,
    nameLength,
    name,
  };
}

export class NCCH implements RomfsFileParent {
  private romFilename: string;
  private baseRomFd: number = -1;
  private ncchStartingOffset: number;
  private productCode: string;
  private titleId: string;
  private version: number = 0;
  private exefsOffset: number = 0;
  private romfsOffset: number = 0;
  private fileDataOffset: number = 0;
  private codeFileHeader: ExefsFileHeader | null = null;
  private smdh: SMDH | null = null;
  private extraExefsFiles: ExefsFileHeader[] = [];
  private fileMetadataList: FileMetadata[] = [];
  private romfsFiles: Map<string, RomfsFile> = new Map();
  private romOpen: boolean = false;
  private tmpFolder: string = "";
  private writingEnabled: boolean = false;
  private codeCompressed: boolean = false;
  private codeOpen: boolean = false;
  private codeChanged: boolean = false;
  private codeRamstored: Uint8Array | null = null;

  public originalCodeCRC: number = 0;
  public originalRomfsHeaderCRC: number = 0;

  constructor(filename: string, productCode: string, titleId: string) {
    this.romFilename = filename;
    this.productCode = productCode;
    this.titleId = titleId;
    this.ncchStartingOffset = NCCH.getCXIOffsetInFile(filename);

    this.baseRomFd = fs.openSync(filename, "r");
    this.romOpen = true;

    if (this.ncchStartingOffset !== -1) {
      this.version = this.readVersionFromFile();
    }

    // TMP folder
    const rawFilename = path.basename(filename);
    let dataFolder =
      "tmp_" + rawFilename.substring(0, rawFilename.lastIndexOf("."));
    dataFolder = dataFolder.replace(/[^A-Za-z0-9_]+/g, "");
    const tmpFolderPath = path.join(
      path.dirname(filename),
      dataFolder
    );
    fs.mkdirSync(tmpFolderPath, { recursive: true });
    this.writingEnabled = true;
    this.tmpFolder = tmpFolderPath + path.sep;

    this.readFileSystem();
  }

  reopenROM(): void {
    if (!this.romOpen) {
      this.baseRomFd = fs.openSync(this.romFilename, "r");
      this.romOpen = true;
    }
  }

  closeROM(): void {
    if (this.romOpen && this.baseRomFd >= 0) {
      fs.closeSync(this.baseRomFd);
      this.baseRomFd = -1;
      this.romOpen = false;
    }
  }

  getBaseRomFd(): number {
    return this.baseRomFd;
  }

  isWritingEnabled(): boolean {
    return this.writingEnabled;
  }

  getTmpFolder(): string {
    return this.tmpFolder;
  }

  getProductCode(): string {
    return this.productCode;
  }

  getTitleId(): string {
    return this.titleId;
  }

  getVersion(): number {
    return this.version;
  }

  getSmdh(): SMDH | null {
    return this.smdh;
  }

  hasFile(filename: string): boolean {
    return this.romfsFiles.has(filename);
  }

  getFile(filename: string): Uint8Array | null {
    if (this.romfsFiles.has(filename)) {
      return this.romfsFiles.get(filename)!.getContents();
    }
    return null;
  }

  writeFile(filename: string, data: Uint8Array): void {
    if (this.romfsFiles.has(filename)) {
      this.romfsFiles.get(filename)!.writeOverride(data);
    }
  }

  getRomfsFiles(): Map<string, RomfsFile> {
    return this.romfsFiles;
  }

  private readFileSystem(): void {
    this.exefsOffset =
      this.ncchStartingOffset +
      FileFunctions.readIntFromFile(
        this.baseRomFd,
        this.ncchStartingOffset + 0x1a0
      ) *
        MEDIA_UNIT_SIZE;
    this.romfsOffset =
      this.ncchStartingOffset +
      FileFunctions.readIntFromFile(
        this.baseRomFd,
        this.ncchStartingOffset + 0x1b0
      ) *
        MEDIA_UNIT_SIZE;

    const flagBuf = Buffer.alloc(1);
    fs.readSync(
      this.baseRomFd,
      flagBuf,
      0,
      1,
      this.ncchStartingOffset + 0x20d
    );
    this.codeCompressed = (flagBuf[0] & 0x01) !== 0;

    this.readExefs();
    this.readRomfs();
  }

  private readExefs(): void {
    const exefsHeaderData = Buffer.alloc(EXEFS_HEADER_SIZE);
    fs.readSync(
      this.baseRomFd,
      exefsHeaderData,
      0,
      EXEFS_HEADER_SIZE,
      this.exefsOffset
    );
    const headerArr = new Uint8Array(exefsHeaderData);

    const fileHeaders: ExefsFileHeader[] = [];
    for (let i = 0; i < 10; i++) {
      fileHeaders.push(parseExefsFileHeader(headerArr, i * 0x10));
    }

    this.extraExefsFiles = [];
    for (const fh of fileHeaders) {
      if (fh.filename !== "" && fh.size !== 0) {
        if (fh.filename === ".code") {
          this.codeFileHeader = fh;
        } else {
          this.extraExefsFiles.push(fh);
        }
        if (fh.filename === "icon") {
          const smdhBytes = Buffer.alloc(fh.size);
          fs.readSync(
            this.baseRomFd,
            smdhBytes,
            0,
            fh.size,
            this.exefsOffset + 0x200 + fh.offset
          );
          this.smdh = new SMDH(new Uint8Array(smdhBytes));
        }
      }
    }
  }

  private readRomfs(): void {
    const romfsHeaderData = Buffer.alloc(ROMFS_HEADER_SIZE);
    fs.readSync(
      this.baseRomFd,
      romfsHeaderData,
      0,
      ROMFS_HEADER_SIZE,
      this.romfsOffset
    );
    const headerArr = new Uint8Array(romfsHeaderData);

    this.originalRomfsHeaderCRC = FileFunctions.getCRC32(headerArr);

    const magic1 = FileFunctions.readFullIntBigEndian(headerArr, 0x00);
    const magic2 = FileFunctions.readFullIntBigEndian(headerArr, 0x04);
    if (magic1 !== ROMFS_MAGIC_1 || magic2 !== ROMFS_MAGIC_2) {
      return;
    }

    const masterHashSize = FileFunctions.readFullInt(headerArr, 0x08);
    const level3HashBlockSize =
      1 << FileFunctions.readFullInt(headerArr, 0x4c);
    const level3Offset =
      this.romfsOffset +
      NCCH.alignNumber(0x60 + masterHashSize, level3HashBlockSize);

    const level3HeaderData = Buffer.alloc(LEVEL3_HEADER_SIZE);
    fs.readSync(
      this.baseRomFd,
      level3HeaderData,
      0,
      LEVEL3_HEADER_SIZE,
      level3Offset
    );
    const l3Arr = new Uint8Array(level3HeaderData);

    const headerLength = FileFunctions.readFullInt(l3Arr, 0x00);
    if (headerLength !== LEVEL3_HEADER_SIZE) {
      return;
    }

    const directoryMetadataOffset = FileFunctions.readFullInt(l3Arr, 0x0c);
    const directoryMetadataLength = FileFunctions.readFullInt(l3Arr, 0x10);
    const fileMetadataOffset = FileFunctions.readFullInt(l3Arr, 0x1c);
    const fileMetadataLength = FileFunctions.readFullInt(l3Arr, 0x20);
    const fileDataOffsetFromHeaderStart = FileFunctions.readFullInt(
      l3Arr,
      0x24
    );
    this.fileDataOffset = level3Offset + fileDataOffsetFromHeaderStart;

    const dirMetaBuf = Buffer.alloc(directoryMetadataLength);
    fs.readSync(
      this.baseRomFd,
      dirMetaBuf,
      0,
      directoryMetadataLength,
      level3Offset + directoryMetadataOffset
    );
    const dirMetaArr = new Uint8Array(dirMetaBuf);

    const fileMetaBuf = Buffer.alloc(fileMetadataLength);
    fs.readSync(
      this.baseRomFd,
      fileMetaBuf,
      0,
      fileMetadataLength,
      level3Offset + fileMetadataOffset
    );
    const fileMetaArr = new Uint8Array(fileMetaBuf);

    this.fileMetadataList = [];
    this.romfsFiles = new Map();
    this.visitDirectory(0, "", dirMetaArr, fileMetaArr);
  }

  private visitDirectory(
    offset: number,
    rootPath: string,
    directoryMetadataBlock: Uint8Array,
    fileMetadataBlock: Uint8Array
  ): void {
    const metadata = parseDirectoryMetadata(directoryMetadataBlock, offset);
    let currentPath = rootPath;
    if (metadata.name !== "") {
      currentPath = rootPath + metadata.name + "/";
    }

    if (metadata.firstFileOffset !== METADATA_UNUSED) {
      this.visitFile(
        metadata.firstFileOffset,
        currentPath,
        fileMetadataBlock
      );
    }
    if (metadata.firstChildDirectoryOffset !== METADATA_UNUSED) {
      this.visitDirectory(
        metadata.firstChildDirectoryOffset,
        currentPath,
        directoryMetadataBlock,
        fileMetadataBlock
      );
    }
    if (metadata.siblingDirectoryOffset !== METADATA_UNUSED) {
      this.visitDirectory(
        metadata.siblingDirectoryOffset,
        rootPath,
        directoryMetadataBlock,
        fileMetadataBlock
      );
    }
  }

  private visitFile(
    offset: number,
    rootPath: string,
    fileMetadataBlock: Uint8Array
  ): void {
    const parsedMeta = parseFileMetadata(fileMetadataBlock, offset);
    const currentPath = rootPath + parsedMeta.name;
    const file = new RomfsFile(this);
    file.offset = this.fileDataOffset + parsedMeta.fileDataOffset;
    file.size = parsedMeta.fileDataLength;
    file.fullPath = currentPath;

    const metadata: FileMetadata = {
      ...parsedMeta,
      file,
    };
    this.fileMetadataList.push(metadata);
    this.romfsFiles.set(currentPath, file);

    if (parsedMeta.siblingFileOffset !== METADATA_UNUSED) {
      this.visitFile(
        parsedMeta.siblingFileOffset,
        rootPath,
        fileMetadataBlock
      );
    }
  }

  isDecrypted(): boolean {
    const ncchFlagOffset = this.ncchStartingOffset + 0x188;
    const ncchFlags = Buffer.alloc(8);
    fs.readSync(this.baseRomFd, ncchFlags, 0, 8, ncchFlagOffset);
    if ((ncchFlags[7] & 0x4) !== 0) {
      return true;
    }
    return (
      this.romfsFiles.has("DllBattle.cro") ||
      this.romfsFiles.has("Battle.cro")
    );
  }

  static alignInt(num: number, alignment: number): number {
    const mask = ~(alignment - 1);
    return (num + (alignment - 1)) & mask;
  }

  static alignNumber(num: number, alignment: number): number {
    const mask = ~(alignment - 1);
    return (num + (alignment - 1)) & mask;
  }

  static alignLong(num: number, alignment: number): number {
    const mask = ~(alignment - 1);
    return (num + (alignment - 1)) & mask;
  }

  private readVersionFromFile(): number {
    const magic = FileFunctions.readBigEndianIntFromFile(
      this.baseRomFd,
      NCCH_AND_NCSD_MAGIC_OFFSET
    );
    if (magic === NCCH_MAGIC || magic === NCSD_MAGIC) {
      return 0;
    }

    // CIA
    const certChainSize = FileFunctions.readIntFromFile(this.baseRomFd, 0x08);
    const ticketSize = FileFunctions.readIntFromFile(this.baseRomFd, 0x0c);
    const certChainOffset = NCCH.alignNumber(CIA_HEADER_SIZE, 64);
    const ticketOffset = NCCH.alignNumber(certChainOffset + certChainSize, 64);
    const tmdOffset = NCCH.alignNumber(ticketOffset + ticketSize, 64);

    const signatureType = FileFunctions.readBigEndianIntFromFile(
      this.baseRomFd,
      tmdOffset
    );
    let signatureSize: number;
    let paddingSize: number;
    switch (signatureType) {
      case 0x010003:
        signatureSize = 0x200;
        paddingSize = 0x3c;
        break;
      case 0x010004:
        signatureSize = 0x100;
        paddingSize = 0x3c;
        break;
      case 0x010005:
        signatureSize = 0x3c;
        paddingSize = 0x40;
        break;
      default:
        return 0;
    }

    const tmdHeaderOffset = tmdOffset + 4 + signatureSize + paddingSize;
    return FileFunctions.read2ByteBigEndianIntFromFile(
      this.baseRomFd,
      tmdHeaderOffset + 0x9c
    );
  }

  static getCXIOffsetInFile(filename: string): number {
    const fd = fs.openSync(filename, "r");
    try {
      const ciaHeaderSize = FileFunctions.readIntFromFile(fd, 0x00);
      if (ciaHeaderSize === CIA_HEADER_SIZE) {
        const certChainSize = FileFunctions.readIntFromFile(fd, 0x08);
        const ticketSize = FileFunctions.readIntFromFile(fd, 0x0c);
        const tmdFileSize = FileFunctions.readIntFromFile(fd, 0x10);
        const certChainOffset = NCCH.alignNumber(ciaHeaderSize, 64);
        const ticketOffset = NCCH.alignNumber(
          certChainOffset + certChainSize,
          64
        );
        const tmdOffset = NCCH.alignNumber(ticketOffset + ticketSize, 64);
        const contentOffset = NCCH.alignNumber(
          tmdOffset + tmdFileSize,
          64
        );
        const magic = FileFunctions.readBigEndianIntFromFile(
          fd,
          contentOffset + NCCH_AND_NCSD_MAGIC_OFFSET
        );
        if (magic === NCCH_MAGIC) {
          return contentOffset;
        }
      }

      const magic = FileFunctions.readBigEndianIntFromFile(
        fd,
        NCCH_AND_NCSD_MAGIC_OFFSET
      );
      if (magic === NCCH_MAGIC) {
        return 0;
      } else if (magic === NCSD_MAGIC) {
        return 0x4000;
      } else {
        return -1;
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}
