/*----------------------------------------------------------------------------*/
/*--  bflim.ts - class for reading/parsing BFLIM images.                    --*/
/*--             Note that this class is optimized around handling Gen 7     --*/
/*--             Pokemon icons, and won't work for all types of BFLIMs       --*/
/*--                                                                        --*/
/*--  Code based on "Switch Toolbox", copyright (C) KillzXGaming            --*/
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

const SWIZZLE_LUT = [
  0, 1, 8, 9, 2, 3, 10, 11, 16, 17, 24, 25, 18, 19, 26, 27, 4, 5, 12, 13, 6,
  7, 14, 15, 20, 21, 28, 29, 22, 23, 30, 31, 32, 33, 40, 41, 34, 35, 42, 43,
  48, 49, 56, 57, 50, 51, 58, 59, 36, 37, 44, 45, 38, 39, 46, 47, 52, 53, 60,
  61, 54, 55, 62, 63,
];

interface BFLIMHeader {
  version: number;
}

interface BFLIMImage {
  size: number;
  width: number;
  height: number;
  alignment: number;
  format: number;
  flags: number;
  imageSize: number;
}

export class BFLIM {
  public readonly width: number;
  public readonly height: number;
  private imageData: Uint8Array;
  private header: BFLIMHeader;
  private image: BFLIMImage;

  constructor(bflimBytes: Uint8Array) {
    if (bflimBytes.length < 0x28) {
      throw new Error("Invalid BFLIM: not long enough to contain a header");
    }
    this.header = BFLIM.parseHeader(bflimBytes);
    this.image = BFLIM.parseImage(bflimBytes);
    this.width = this.image.width;
    this.height = this.image.height;
    this.imageData = new Uint8Array(this.image.imageSize);
    this.imageData.set(bflimBytes.subarray(0, this.image.imageSize));
  }

  /** Returns ARGB pixel data as a flat array (width * height entries). */
  getImageData(): number[] {
    // Swap width and height because image is rendered on its side
    const swappedWidth = this.height;
    const swappedHeight = this.width;
    const decoded = this.decodeBlock(
      this.imageData,
      swappedWidth,
      swappedHeight
    );
    const colorData = BFLIM.convertToColorData(decoded);
    return BFLIM.rearrangeImage(colorData, this.width, this.height);
  }

  private decodeBlock(
    data: Uint8Array,
    width: number,
    height: number
  ): number[] {
    const output = new Array(width * height * 4).fill(0);
    let inputOffset = 0;
    for (let ty = 0; ty < height; ty += 8) {
      for (let tx = 0; tx < width; tx += 8) {
        for (let px = 0; px < 64; px++) {
          const x = SWIZZLE_LUT[px] & 7;
          const y = (SWIZZLE_LUT[px] - x) >> 3;
          const outputOffset =
            (tx + x + (height - 1 - (ty + y)) * width) * 4;
          const value = FileFunctions.read2ByteInt(data, inputOffset);
          if (this.image.format === 7) {
            BFLIM.decodeRGBA5551(output, outputOffset, value);
          } else if (this.image.format === 8) {
            BFLIM.decodeRGBA4(output, outputOffset, value);
          } else {
            throw new Error("Unsupported BFLIM: unsupported image format");
          }
          inputOffset += 2;
        }
      }
    }
    return output;
  }

  private static convertToColorData(decodedImageData: number[]): number[] {
    const output = new Array(decodedImageData.length / 4);
    for (let i = 0; i < decodedImageData.length; i += 4) {
      const a = decodedImageData[i];
      const b = decodedImageData[i + 1];
      const g = decodedImageData[i + 2];
      const r = decodedImageData[i + 3];
      output[i / 4] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    return output;
  }

  private static rearrangeImage(
    colorData: number[],
    width: number,
    height: number
  ): number[] {
    const output = new Array(colorData.length);
    for (let destY = 0; destY < height; destY++) {
      for (let destX = 0; destX < width; destX++) {
        const srcX = height - destY - 1;
        const srcY = width - destX - 1;
        const srcIndex = srcX + srcY * height;
        const destIndex = destX + destY * width;
        output[destIndex] = colorData[srcIndex];
      }
    }
    return output;
  }

  private static decodeRGBA5551(
    output: number[],
    outputOffset: number,
    value: number
  ): void {
    let R = ((value >> 1) & 0x1f) << 3;
    let G = ((value >> 6) & 0x1f) << 3;
    let B = ((value >> 11) & 0x1f) << 3;
    const A = (value & 1) * 0xff;
    R = R | (R >> 5);
    G = G | (G >> 5);
    B = B | (B >> 5);
    output[outputOffset] = A;
    output[outputOffset + 1] = B;
    output[outputOffset + 2] = G;
    output[outputOffset + 3] = R;
  }

  private static decodeRGBA4(
    output: number[],
    outputOffset: number,
    value: number
  ): void {
    let R = (value >> 4) & 0xf;
    let G = (value >> 8) & 0xf;
    let B = (value >> 12) & 0xf;
    const A = (value & 1) | (value << 4);
    R = R | (R << 4);
    G = G | (G << 4);
    B = B | (B << 4);
    output[outputOffset] = A & 0xff;
    output[outputOffset + 1] = B;
    output[outputOffset + 2] = G;
    output[outputOffset + 3] = R;
  }

  private static parseHeader(bflimBytes: Uint8Array): BFLIMHeader {
    const headerOffset = bflimBytes.length - 0x28;
    const signature = FileFunctions.readFullIntBigEndian(
      bflimBytes,
      headerOffset
    );
    if (signature !== 0x464c494d) {
      throw new Error("Invalid BFLIM: cannot find FLIM header");
    }
    const bigEndian =
      FileFunctions.read2ByteInt(bflimBytes, headerOffset + 4) === 0xfffe;
    if (bigEndian) {
      throw new Error("Unsupported BFLIM: this is a big endian BFLIM");
    }
    const headerSize = FileFunctions.read2ByteInt(
      bflimBytes,
      headerOffset + 6
    );
    if (headerSize !== 0x14) {
      throw new Error("Invalid BFLIM: header length does not equal 0x14");
    }
    const version = FileFunctions.readFullInt(bflimBytes, headerOffset + 8);
    return { version };
  }

  private static parseImage(bflimBytes: Uint8Array): BFLIMImage {
    const imageHeaderOffset = bflimBytes.length - 0x14;
    const signature = FileFunctions.readFullIntBigEndian(
      bflimBytes,
      imageHeaderOffset
    );
    if (signature !== 0x696d6167) {
      throw new Error("Invalid BFLIM: cannot find imag header");
    }
    const size = FileFunctions.readFullInt(bflimBytes, imageHeaderOffset + 4);
    const width = FileFunctions.read2ByteInt(bflimBytes, imageHeaderOffset + 8);
    const height = FileFunctions.read2ByteInt(
      bflimBytes,
      imageHeaderOffset + 10
    );
    const alignment = FileFunctions.read2ByteInt(
      bflimBytes,
      imageHeaderOffset + 12
    );
    const format = bflimBytes[imageHeaderOffset + 14];
    const flags = bflimBytes[imageHeaderOffset + 15];
    const imageSize = FileFunctions.readFullInt(
      bflimBytes,
      imageHeaderOffset + 16
    );
    return { size, width, height, alignment, format, flags, imageSize };
  }
}
