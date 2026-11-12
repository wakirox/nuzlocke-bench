/**
 * CRC32 implementation matching Java's java.util.zip.CRC32.
 */

const crcTable: number[] = new Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if ((c & 1) !== 0) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

export function crc32(data: Uint8Array, initial = 0): number {
  let crc = ~initial >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (~crc) >>> 0;
}
