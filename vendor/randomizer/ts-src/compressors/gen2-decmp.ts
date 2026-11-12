/**
 * Pokemon Gen 2 sprite decompressor
 * Source: https://github.com/pret/pokemon-reverse-engineering-tools/blob/master/pokemontools/lz.py
 * (and gfx.py for flatten())
 * Ported to Java by Dabomstew, then to TypeScript.
 */

const LZ_END = 0xff;
const INITIAL_BUF_SIZE = 0x1000;

const bit_flipped: number[] = new Array(0x100);
for (let b = 0; b < 0x100; b++) {
  bit_flipped[b] = 0;
  for (let i = 0; i < 8; i++) {
    bit_flipped[b] += ((b >> i) & 1) << (7 - i);
  }
}

export class Gen2Decmp {
  private input: Uint8Array;
  private address: number;
  private output!: Uint8Array;
  private out_idx = 0;
  private cmd = 0;
  private len = 0;
  private offset = 0;

  constructor(
    input: Uint8Array,
    baseOffset: number,
    tilesWide: number,
    tilesHigh: number,
  ) {
    this.input = input;
    this.address = baseOffset;
    this.decompress();
    this.cutAndTranspose(tilesWide, tilesHigh);
  }

  getData(): Uint8Array {
    return this.output;
  }

  getFlattenedData(): Uint8Array {
    return flatten(this.output);
  }

  private cutAndTranspose(width: number, height: number): void {
    if (this.output === null || this.output === undefined) {
      return;
    }
    const tiles = width * height;

    const newData = new Uint8Array(width * height * 16);
    for (let tile = 0; tile < tiles; tile++) {
      const oldTileX = tile % width;
      const oldTileY = Math.floor(tile / width);
      const newTileNum = oldTileX * height + oldTileY;
      newData.set(
        this.output.subarray(tile * 16, tile * 16 + 16),
        newTileNum * 16,
      );
    }
    this.output = newData;
  }

  private decompress(): void {
    let outputBuf = new Uint8Array(INITIAL_BUF_SIZE);
    this.out_idx = 0;

    while (true) {
      if (this.peek() === LZ_END) {
        this.next();
        break;
      }

      this.cmd = (this.peek() & 0xe0) >> 5;
      if (this.cmd === 7) {
        // LONG command
        this.cmd = (this.peek() & 0x1c) >> 2;
        this.len = (this.next() & 0x03) * 0x100 + this.next() + 1;
      } else {
        // Normal length
        this.len = (this.next() & 0x1f) + 1;
      }

      while (this.out_idx + this.len > outputBuf.length) {
        outputBuf = this.resizeOutput(outputBuf);
      }

      switch (this.cmd) {
        case 0: {
          // Literal
          for (let i = 0; i < this.len; i++) {
            outputBuf[this.out_idx + i] = this.input[this.address + i];
          }
          this.out_idx += this.len;
          this.address += this.len;
          break;
        }
        case 1: {
          // Iterate
          const repe = this.next();
          for (let i = 0; i < this.len; i++) {
            outputBuf[this.out_idx++] = repe & 0xff;
          }
          break;
        }
        case 2: {
          // Alternate
          const alts = [this.next() & 0xff, this.next() & 0xff];
          for (let i = 0; i < this.len; i++) {
            outputBuf[this.out_idx++] = alts[i & 1];
          }
          break;
        }
        case 3: {
          // Zero-fill (Uint8Array is initialized to 0)
          this.out_idx += this.len;
          break;
        }
        case 4: {
          // Default repeat
          this.repeat(outputBuf, 1, null);
          break;
        }
        case 5: {
          this.repeat(outputBuf, 1, bit_flipped);
          break;
        }
        case 6: {
          this.repeat(outputBuf, -1, null);
          break;
        }
      }
    }

    this.output = outputBuf.slice(0, this.out_idx);
  }

  private repeat(
    outputBuf: Uint8Array,
    direction: number,
    table: number[] | null,
  ): void {
    this.getOffset(outputBuf);
    for (let i = 0; i < this.len; i++) {
      const value = outputBuf[this.offset + i * direction] & 0xff;
      outputBuf[this.out_idx++] = table === null ? value : table[value];
    }
  }

  private getOffset(_outputBuf: Uint8Array): void {
    if (this.peek() >= 0x80) {
      // Negative
      this.offset = this.next() & 0x7f;
      this.offset = this.out_idx - this.offset - 1;
    } else {
      // Positive, extended
      this.offset = this.next() * 0x100 + this.next();
    }
  }

  private resizeOutput(buf: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const newOut = new Uint8Array(buf.length * 2);
    newOut.set(buf.subarray(0, this.out_idx));
    return newOut;
  }

  private peek(): number {
    return this.input[this.address] & 0xff;
  }

  private next(): number {
    return this.input[this.address++] & 0xff;
  }
}

function flatten(planar: Uint8Array): Uint8Array {
  const strips = new Uint8Array(planar.length * 4);
  for (let j = 0; j < Math.floor(planar.length / 2); j++) {
    const bottom = planar[j * 2] & 0xff;
    const top = planar[j * 2 + 1] & 0xff;
    const strip = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      strip[7 - i] = ((bottom >>> i) & 1) + (((top * 2) >>> i) & 2);
    }
    strips.set(strip, j * 8);
  }
  return strips;
}
