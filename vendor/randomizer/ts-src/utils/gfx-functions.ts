/**
 * Represents a pixel image as a flat array of ARGB integers.
 * Width and height are stored alongside the pixel data.
 */
export interface PixelImage {
  width: number;
  height: number;
  pixels: Int32Array; // ARGB values, row-major
}

function createImage(width: number, height: number): PixelImage {
  return {
    width,
    height,
    pixels: new Int32Array(width * height),
  };
}

function setRGB(img: PixelImage, x: number, y: number, argb: number): void {
  img.pixels[y * img.width + x] = argb;
}

function getRGB(img: PixelImage, x: number, y: number): number {
  return img.pixels[y * img.width + x];
}

export class GFXFunctions {
  static drawTiledImage(
    data: Uint8Array,
    palette: number[],
    width: number,
    height: number,
    bpp: number
  ): PixelImage;
  static drawTiledImage(
    data: Uint8Array,
    palette: number[],
    offset: number,
    width: number,
    height: number,
    bpp: number
  ): PixelImage;
  static drawTiledImage(
    data: Uint8Array,
    palette: number[],
    arg3: number,
    arg4: number,
    arg5: number,
    arg6?: number
  ): PixelImage {
    if (arg6 === undefined) {
      // (data, palette, width, height, bpp)
      return GFXFunctions._drawTiledImage(
        data,
        palette,
        0,
        arg3,
        arg4,
        8,
        8,
        arg5
      );
    } else {
      // (data, palette, offset, width, height, bpp)
      return GFXFunctions._drawTiledImage(
        data,
        palette,
        arg3,
        arg4,
        arg5,
        8,
        8,
        arg6
      );
    }
  }

  private static _drawTiledImage(
    data: Uint8Array,
    palette: number[],
    offset: number,
    width: number,
    height: number,
    tileWidth: number,
    tileHeight: number,
    bpp: number
  ): PixelImage {
    if (bpp !== 1 && bpp !== 2 && bpp !== 4 && bpp !== 8) {
      throw new Error("Bits per pixel must be a multiple of 2.");
    }
    const pixelsPerByte = 8 / bpp;
    if (
      Math.floor((width * height) / pixelsPerByte) + offset >
      data.length
    ) {
      throw new Error("Invalid input image.");
    }

    const bytesPerTile = Math.floor(
      (tileWidth * tileHeight) / pixelsPerByte
    );
    const numTiles = Math.floor(
      (width * height) / (tileWidth * tileHeight)
    );
    const widthInTiles = Math.floor(width / tileWidth);

    const img = createImage(width, height);

    for (let tile = 0; tile < numTiles; tile++) {
      const tileX = tile % widthInTiles;
      const tileY = Math.floor(tile / widthInTiles);
      for (let yT = 0; yT < tileHeight; yT++) {
        for (let xT = 0; xT < tileWidth; xT++) {
          let value =
            data[
              tile * bytesPerTile +
                Math.floor((yT * tileWidth) / pixelsPerByte) +
                Math.floor(xT / pixelsPerByte) +
                offset
            ] & 0xff;
          if (pixelsPerByte !== 1) {
            value =
              (value >>> ((xT % pixelsPerByte) * bpp)) &
              ((1 << bpp) - 1);
          }
          setRGB(
            img,
            tileX * tileWidth + xT,
            tileY * tileHeight + yT,
            palette[value]
          );
        }
      }
    }

    return img;
  }

  static drawTiledZOrderImage(
    data: Uint8Array,
    palette: number[],
    offset: number,
    width: number,
    height: number,
    bpp: number
  ): PixelImage {
    return GFXFunctions._drawTiledZOrderImage(
      data,
      palette,
      offset,
      width,
      height,
      8,
      8,
      bpp
    );
  }

  private static _drawTiledZOrderImage(
    data: Uint8Array,
    palette: number[],
    offset: number,
    width: number,
    height: number,
    tileWidth: number,
    tileHeight: number,
    bpp: number
  ): PixelImage {
    if (bpp !== 1 && bpp !== 2 && bpp !== 4 && bpp !== 8) {
      throw new Error("Bits per pixel must be a multiple of 2.");
    }
    const pixelsPerByte = 8 / bpp;
    if (
      Math.floor((width * height) / pixelsPerByte) + offset >
      data.length
    ) {
      throw new Error("Invalid input image.");
    }

    const bytesPerTile = Math.floor(
      (tileWidth * tileHeight) / pixelsPerByte
    );
    const numTiles = Math.floor(
      (width * height) / (tileWidth * tileHeight)
    );
    const widthInTiles = Math.floor(width / tileWidth);

    const img = createImage(width, height);

    for (let tile = 0; tile < numTiles; tile++) {
      const tileX = tile % widthInTiles;
      const tileY = Math.floor(tile / widthInTiles);
      for (let yT = 0; yT < tileHeight; yT++) {
        for (let xT = 0; xT < tileWidth; xT++) {
          let value =
            data[
              tile * bytesPerTile +
                Math.floor((yT * tileWidth) / pixelsPerByte) +
                Math.floor(xT / pixelsPerByte) +
                offset
            ] & 0xff;
          if (pixelsPerByte !== 1) {
            value =
              (value >>> (((xT + 1) % pixelsPerByte) * bpp)) &
              ((1 << bpp) - 1);
          }

          const withinTile = yT * tileWidth + xT;
          const subX =
            (withinTile & 0b000001) |
            ((withinTile & 0b000100) >>> 1) |
            ((withinTile & 0b010000) >>> 2);
          const subY =
            ((withinTile & 0b000010) >>> 1) |
            ((withinTile & 0b001000) >>> 2) |
            ((withinTile & 0b100000) >>> 3);
          setRGB(
            img,
            tileX * tileWidth + subX,
            tileY * tileHeight + subY,
            palette[value]
          );
        }
      }
    }

    return img;
  }

  static conv16BitColorToARGB(palValue: number): number {
    const red = Math.floor((palValue & 0x1f) * 8.25);
    const green = Math.floor(((palValue & 0x3e0) >> 5) * 8.25);
    const blue = Math.floor(((palValue & 0x7c00) >> 10) * 8.25);
    return (0xff000000 | (red << 16) | (green << 8) | blue) >>> 0;
  }

  static conv3DS16BitColorToARGB(palValue: number): number {
    const alpha = (palValue & 0x1) * 0xff;
    const blue = Math.floor(((palValue & 0x3e) >> 1) * 8.25);
    const green = Math.floor(((palValue & 0x7c0) >> 6) * 8.25);
    const red = Math.floor(((palValue & 0xf800) >> 11) * 8.25);
    return ((alpha << 24) | (red << 16) | (green << 8) | blue) >>> 0;
  }

  static pseudoTransparency(
    img: PixelImage,
    transColor: number
  ): void {
    const width = img.width;
    const height = img.height;
    const visitPixels: number[] = [];
    const queued: boolean[][] = Array.from({ length: width }, () =>
      new Array(height).fill(false)
    );

    const queuePixel = (x: number, y: number) => {
      if (
        x >= 0 &&
        x < width &&
        y >= 0 &&
        y < height &&
        !queued[x][y]
      ) {
        visitPixels.push(y * width + x);
        queued[x][y] = true;
      }
    };

    for (let x = 0; x < width; x++) {
      queuePixel(x, 0);
      queuePixel(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      queuePixel(0, y);
      queuePixel(width - 1, y);
    }

    while (visitPixels.length > 0) {
      const nextPixel = visitPixels.shift()!;
      const x = nextPixel % width;
      const y = Math.floor(nextPixel / width);
      if (getRGB(img, x, y) === transColor) {
        setRGB(img, x, y, 0);
        queuePixel(x - 1, y);
        queuePixel(x + 1, y);
        queuePixel(x, y - 1);
        queuePixel(x, y + 1);
      }
    }
  }
}
