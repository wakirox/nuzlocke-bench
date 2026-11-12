/*----------------------------------------------------------------------------*/
/*--  smdh.ts - a class for dealing with 3DS SMDH (icon.bin) files.         --*/
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

import { FileFunctions } from "../utils/file-functions.js";

const SMDH_MAGIC = 0x48444d53; // "SMDH" as big-endian int
const LENGTH_OF_TITLE = 0x200;
const SHORT_DESCRIPTION_LENGTH = 0x80;
const LONG_DESCRIPTION_LENGTH = 0x100;
const PUBLISHER_LENGTH = 0x80;

function decodeUtf16LE(data: Uint8Array, offset: number, len: number): string {
  const bytes = data.subarray(offset, offset + len);
  const codeUnits: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const unit = bytes[i] | (bytes[i + 1] << 8);
    if (unit === 0) break;
    codeUnits.push(unit);
  }
  return String.fromCharCode(...codeUnits);
}

function encodeUtf16LE(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

export class SMDH {
  private data: Uint8Array;
  private shortDescriptions: string[] = new Array(12).fill("");
  private longDescriptions: string[] = new Array(12).fill("");
  private publishers: string[] = new Array(12).fill("");

  constructor(smdhData: Uint8Array) {
    this.data = smdhData;
    if (this.isValid()) {
      this.readDescriptionsAndPublishers();
    }
  }

  getBytes(): Uint8Array {
    return this.data;
  }

  setAllDescriptions(newDescription: string): void {
    const encoded = encodeUtf16LE(newDescription);
    if (encoded.length <= SHORT_DESCRIPTION_LENGTH) {
      for (let i = 0; i < 12; i++) {
        this.shortDescriptions[i] = newDescription;
        this.longDescriptions[i] = newDescription;
      }
      this.writeDescriptionsAndPublishers();
    }
  }

  setAllPublishers(newPublisher: string): void {
    const encoded = encodeUtf16LE(newPublisher);
    if (encoded.length <= PUBLISHER_LENGTH) {
      for (let i = 0; i < 12; i++) {
        this.publishers[i] = newPublisher;
      }
      this.writeDescriptionsAndPublishers();
    }
  }

  isValid(): boolean {
    const magic = FileFunctions.readFullInt(this.data, 0x0);
    return magic === SMDH_MAGIC;
  }

  getShortDescription(index: number): string {
    return this.shortDescriptions[index];
  }

  getLongDescription(index: number): string {
    return this.longDescriptions[index];
  }

  getPublisher(index: number): string {
    return this.publishers[index];
  }

  private readDescriptionsAndPublishers(): void {
    for (let i = 0; i < 12; i++) {
      const shortDescriptionOffset = 0x08 + LENGTH_OF_TITLE * i;
      this.shortDescriptions[i] = decodeUtf16LE(
        this.data,
        shortDescriptionOffset,
        SHORT_DESCRIPTION_LENGTH
      );

      const longDescriptionOffset = 0x88 + LENGTH_OF_TITLE * i;
      this.longDescriptions[i] = decodeUtf16LE(
        this.data,
        longDescriptionOffset,
        LONG_DESCRIPTION_LENGTH
      );

      const publisherOffset = 0x188 + LENGTH_OF_TITLE * i;
      this.publishers[i] = decodeUtf16LE(
        this.data,
        publisherOffset,
        PUBLISHER_LENGTH
      );
    }
  }

  private writeDescriptionsAndPublishers(): void {
    for (let i = 0; i < 12; i++) {
      // Short description
      const shortDescOffset = 0x08 + LENGTH_OF_TITLE * i;
      this.data.fill(0, shortDescOffset, shortDescOffset + SHORT_DESCRIPTION_LENGTH);
      const shortBytes = encodeUtf16LE(this.shortDescriptions[i]);
      this.data.set(shortBytes, shortDescOffset);

      // Long description
      const longDescOffset = 0x88 + LENGTH_OF_TITLE * i;
      this.data.fill(0, longDescOffset, longDescOffset + LONG_DESCRIPTION_LENGTH);
      const longBytes = encodeUtf16LE(this.longDescriptions[i]);
      this.data.set(longBytes, longDescOffset);

      // Publisher
      const publisherOffset = 0x188 + LENGTH_OF_TITLE * i;
      this.data.fill(0, publisherOffset, publisherOffset + PUBLISHER_LENGTH);
      const publisherBytes = encodeUtf16LE(this.publishers[i]);
      this.data.set(publisherBytes, publisherOffset);
    }
  }
}
