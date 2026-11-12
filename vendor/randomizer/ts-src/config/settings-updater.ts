import { crc32 } from "../utils/crc32";
import { FileFunctions } from "../utils/file-functions";
import { MiscTweak } from "../utils/misc-tweak";

/**
 * Given a quicksettings config string from an old randomizer version,
 * update it to be compatible with the currently running randomizer version.
 */
export class SettingsUpdater {
  private dataBlock: Uint8Array = new Uint8Array(0);
  private actualDataLength: number = 0;

  update(oldVersion: number, configString: string): string {
    const data = base64Decode(configString);
    this.dataBlock = new Uint8Array(200);
    this.actualDataLength = data.length;
    this.dataBlock.set(data.subarray(0, this.actualDataLength));

    if (oldVersion < 102) {
      this.dataBlock[1] |= 0x10;
    }

    if (oldVersion < 110) {
      this.insertExtraByte(15, 0x04 | 0x10);
    }

    if (oldVersion < 150) {
      this.insertExtraByte(16, 0x40);
      this.insertExtraByte(17, 0x04);
      this.actualDataLength += 4;
    }

    if (oldVersion < 160) {
      const firstByte = this.dataBlock[0] & 0xff;
      const updateMoves = firstByte & 0x08;
      const laterFields = firstByte & (0x10 | 0x20 | 0x40);
      this.dataBlock[0] =
        (firstByte & (0x01 | 0x02 | 0x04 | 0x08)) | (updateMoves << 1) | (laterFields << 1);

      const hasBWPatch = (this.dataBlock[2] & 0x08) >> 3;
      const hasHeldItems = (this.dataBlock[2] & 0x80) >> 7;
      this.dataBlock[2] &= 0x01 | 0x02 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40;

      if (hasHeldItems > 0) {
        this.dataBlock[3] |= 0x10;
      }

      const wpNoLegendaries = (this.dataBlock[11] & 0x80) >> 7;
      const tpNoEarlyShedinja = (this.dataBlock[13] & 0x10) >> 4;
      const wpCatchRate = (this.dataBlock[13] & 0x08) >> 3;
      this.dataBlock[11] =
        (this.dataBlock[11] & (0x01 | 0x02 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40)) |
        (tpNoEarlyShedinja << 7);

      this.insertExtraByte(
        13,
        wpCatchRate | (wpNoLegendaries << 1) | (hasHeldItems << 3)
      );

      this.dataBlock[14] &= 0x07;

      this.insertIntField(19, 0);
      this.insertIntField(23, hasBWPatch);
    }

    if (oldVersion < 162) {
      this.insertExtraByte(3, 0);
    }

    if (oldVersion < 170) {
      this.insertExtraByte(17, 0);
      this.insertExtraByte(21, 0);
      this.insertExtraByte(22, 1);

      let oldTweaks = FileFunctions.readFullIntBigEndian(this.dataBlock, 27);
      if ((this.dataBlock[0] & 1) !== 0) {
        oldTweaks |= MiscTweak.LOWER_CASE_POKEMON_NAMES.getValue();
      }
      if ((this.dataBlock[0] & (1 << 1)) !== 0) {
        oldTweaks |= MiscTweak.NATIONAL_DEX_AT_START.getValue();
      }
      if ((this.dataBlock[0] & (1 << 5)) !== 0) {
        oldTweaks |= MiscTweak.UPDATE_TYPE_EFFECTIVENESS.getValue();
      }
      if ((this.dataBlock[2] & (1 << 5)) !== 0) {
        oldTweaks |= MiscTweak.FORCE_CHALLENGE_MODE.getValue();
      }
      FileFunctions.writeFullIntBigEndian(this.dataBlock, 27, oldTweaks);

      this.dataBlock[0] = SettingsUpdater.getRemappedByte(this.dataBlock[0], [2, 3, 4, 6, 7]);
      this.dataBlock[2] = SettingsUpdater.getRemappedByte(this.dataBlock[2], [0, 1, 2, 4, 6, 7]);
    }

    if (oldVersion < 171) {
      if ((this.dataBlock[1] & 1) !== 0) {
        this.dataBlock[1] |= 1 << 1;
      }
      if ((this.dataBlock[3] & 1) !== 0) {
        this.dataBlock[0] |= 1 << 5;
      }
      this.dataBlock[3] = (this.dataBlock[1] & 0x70) >> 4;
      this.dataBlock[1] = (this.dataBlock[1] & 0x0f) | ((this.dataBlock[1] & 0x80) >> 3);

      this.insertExtraByte(13, 30);
      this.insertExtraByte(12, 0);
      this.insertExtraByte(20, 0);
      this.insertExtraByte(22, 0);
    }

    if (oldVersion < 172) {
      this.actualDataLength -= 8;
      this.dataBlock[16] = this.dataBlock[16] ^ (1 << 1);
      this.insertExtraByte(35, 50);
    }

    if (oldVersion < 300) {
      this.insertExtraByte(38, 50);
      this.insertExtraByte(39, 1);
    }

    if (oldVersion < 311) {
      this.insertExtraByte(40, 0);
      this.insertExtraByte(41, 8);
      this.insertExtraByte(42, 9);
      this.insertExtraByte(43, 50);
      this.insertExtraByte(44, 0);
      this.insertExtraByte(45, 0);
    }

    if (oldVersion < 314) {
      this.insertExtraByte(46, 0);
      this.insertExtraByte(47, 50);
    }

    if (oldVersion < 315) {
      let oldTweaks = FileFunctions.readFullIntBigEndian(this.dataBlock, 32);
      oldTweaks &= ~MiscTweak.FORCE_CHALLENGE_MODE.getValue();
      FileFunctions.writeFullIntBigEndian(this.dataBlock, 32, oldTweaks);
      this.insertExtraByte(48, 0);
    }

    if (oldVersion < 317) {
      this.insertExtraByte(49, 0);
      let genRestrictions = FileFunctions.readFullIntBigEndian(this.dataBlock, 28);
      genRestrictions &= 127;
      FileFunctions.writeFullIntBigEndian(this.dataBlock, 28, genRestrictions);
    }

    if (oldVersion < 319) {
      let starter1 = FileFunctions.read2ByteInt(this.dataBlock, 5);
      let starter2 = FileFunctions.read2ByteInt(this.dataBlock, 7);
      let starter3 = FileFunctions.read2ByteInt(this.dataBlock, 9);
      starter1 += 1;
      starter2 += 1;
      starter3 += 1;
      FileFunctions.write2ByteInt(this.dataBlock, 5, starter1);
      FileFunctions.write2ByteInt(this.dataBlock, 7, starter2);
      FileFunctions.write2ByteInt(this.dataBlock, 9, starter3);
      this.insertExtraByte(50, 0);
    }

    if (oldVersion < 321) {
      const oldMinimumCatchRate = ((this.dataBlock[16] & 0x60) >> 5) + 1;
      this.dataBlock[16] &= ~0x60;
      this.dataBlock[50] |= (oldMinimumCatchRate - 1) << 3;
    }

    // Fix checksum
    const checksumData = this.dataBlock.subarray(0, this.actualDataLength - 8);
    const checksumValue = crc32(checksumData);

    const crcBuf = new Uint8Array(4);
    const crcView = new DataView(crcBuf.buffer);
    crcView.setInt32(0, checksumValue, false);
    this.dataBlock.set(crcBuf, this.actualDataLength - 8);

    const finalConfigString = this.dataBlock.subarray(0, this.actualDataLength);
    return base64Encode(finalConfigString);
  }

  private static getRemappedByte(old: number, oldIndexes: number[]): number {
    let newValue = 0;
    const oldValue = old & 0xff;
    for (let i = 0; i < oldIndexes.length; i++) {
      if ((oldValue & (1 << oldIndexes[i])) !== 0) {
        newValue |= 1 << i;
      }
    }
    return newValue;
  }

  private insertIntField(position: number, value: number): void {
    if (this.actualDataLength + 4 > this.dataBlock.length) {
      return;
    }
    for (let j = this.actualDataLength; j > position + 3; j--) {
      this.dataBlock[j] = this.dataBlock[j - 4];
    }
    const view = new DataView(this.dataBlock.buffer, this.dataBlock.byteOffset);
    view.setInt32(position, value, false);
    this.actualDataLength += 4;
  }

  private insertExtraByte(position: number, value: number): void {
    if (this.actualDataLength === this.dataBlock.length) {
      return;
    }
    for (let j = this.actualDataLength; j > position; j--) {
      this.dataBlock[j] = this.dataBlock[j - 1];
    }
    this.dataBlock[position] = value & 0xff;
    this.actualDataLength++;
  }
}

function base64Decode(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64Encode(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
