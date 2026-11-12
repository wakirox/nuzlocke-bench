import * as crypto from "crypto";

const MULTIPLIER = 0x5DEECE66Dn;
const ADDEND = 0xBn;
const MASK = (1n << 48n) - 1n;

/**
 * A faithful port of java.util.Random's LCG algorithm using BigInt for 48-bit math.
 * Same seed produces the same sequence as Java's Random.
 */
class JavaRandom {
  private seed: bigint = 0n;
  private haveNextNextGaussian = false;
  private nextNextGaussian = 0;

  constructor(seedValue?: bigint) {
    if (seedValue !== undefined) {
      this.setSeed(seedValue);
    } else {
      // Use current time as seed, similar to Java's default
      this.setSeed(BigInt(Date.now()));
    }
  }

  setSeed(seedValue: bigint): void {
    // Java's Random XORs the seed with the multiplier before storing
    this.seed = (seedValue ^ MULTIPLIER) & MASK;
    this.haveNextNextGaussian = false;
  }

  private next(bits: number): number {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    // Unsigned right shift of 48-bit value by (48 - bits)
    return Number(this.seed >> BigInt(48 - bits));
  }

  nextInt(): number;
  nextInt(bound: number): number;
  nextInt(bound?: number): number {
    if (bound === undefined) {
      return this.next(32) | 0; // Force signed 32-bit integer
    }
    if (bound <= 0) {
      throw new Error("bound must be positive");
    }
    // If bound is a power of 2
    if ((bound & (bound - 1)) === 0) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextLong(): bigint {
    const high = BigInt(this.next(32)) << 32n;
    const low = BigInt(this.next(32));
    return this.toSignedLong(high + low);
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  nextFloat(): number {
    return this.next(24) / (1 << 24);
  }

  nextDouble(): number {
    const high = BigInt(this.next(26)) << 27n;
    const low = BigInt(this.next(27));
    return Number(high + low) / 2 ** 53;
  }

  nextGaussian(): number {
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    let v1: number;
    let v2: number;
    let s: number;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const multiplier = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextNextGaussian = v2 * multiplier;
    this.haveNextNextGaussian = true;
    return v1 * multiplier;
  }

  nextBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; ) {
      let rnd = this.nextInt();
      for (let n = Math.min(bytes.length - i, 4); n > 0; n--) {
        bytes[i++] = rnd & 0xff;
        rnd >>= 8;
      }
    }
  }

  private toSignedLong(value: bigint): bigint {
    // Convert to signed 64-bit
    value = value & 0xFFFFFFFFFFFFFFFFn;
    if (value >= 0x8000000000000000n) {
      return value - 0x10000000000000000n;
    }
    return value;
  }
}

/**
 * RandomSourceInstance delegates all calls back to RandomSource static methods,
 * matching the Java pattern where instance() returns a Random-like object
 * that uses the shared source.
 */
class RandomSourceInstance {
  setSeed(seed: bigint): void {
    RandomSource.seed(seed);
  }

  nextBytes(bytes: Uint8Array): void {
    RandomSource.nextBytes(bytes);
  }

  nextInt(): number;
  nextInt(n: number): number;
  nextInt(n?: number): number {
    if (n !== undefined) {
      return RandomSource.nextInt(n);
    }
    return RandomSource.nextIntUnbounded();
  }

  nextLong(): bigint {
    return RandomSource.nextLong();
  }

  nextBoolean(): boolean {
    return RandomSource.nextBoolean();
  }

  nextFloat(): number {
    return RandomSource.nextFloat();
  }

  nextDouble(): number {
    return RandomSource.nextDouble();
  }

  nextGaussian(): number {
    return RandomSource.nextGaussian();
  }
}

/**
 * CosmeticRandomSourceInstance only supports nextInt(n) via cosmetic source.
 * All other methods are stubs (matching Java's @Deprecated no-ops).
 */
class CosmeticRandomSourceInstance {
  setSeed(seed: bigint): void {
    RandomSource.seed(seed);
  }

  nextBytes(_bytes: Uint8Array): void {
    // no-op (deprecated in Java)
  }

  nextInt(): number;
  nextInt(n: number): number;
  nextInt(n?: number): number {
    if (n !== undefined) {
      return RandomSource.nextIntCosmetic(n);
    }
    return 0; // deprecated in Java
  }

  nextLong(): bigint {
    return 0n; // deprecated in Java
  }

  nextBoolean(): boolean {
    return false; // deprecated in Java
  }

  nextFloat(): number {
    return 0; // deprecated in Java
  }

  nextDouble(): number {
    return 0; // deprecated in Java
  }

  nextGaussian(): number {
    return 0; // deprecated in Java
  }
}

export type RandomInstance =
  | RandomSourceInstance
  | CosmeticRandomSourceInstance
  | JavaRandom;

export class RandomSource {
  private static source: JavaRandom = new JavaRandom();
  private static cosmeticSource: JavaRandom = new JavaRandom();
  private static calls = 0;
  private static cosmeticCalls = 0;
  private static _instance: RandomSourceInstance =
    new RandomSourceInstance();
  private static _cosmeticInstance: CosmeticRandomSourceInstance =
    new CosmeticRandomSourceInstance();

  static reset(): void {
    RandomSource.source = new JavaRandom();
    RandomSource.cosmeticSource = new JavaRandom();
    RandomSource.calls = 0;
    RandomSource.cosmeticCalls = 0;
  }

  static seed(seed: bigint): void {
    RandomSource.source.setSeed(seed);
    RandomSource.cosmeticSource.setSeed(seed);
    RandomSource.calls = 0;
    RandomSource.cosmeticCalls = 0;
  }

  static random(): number {
    RandomSource.calls++;
    return RandomSource.source.nextDouble();
  }

  static nextInt(size: number): number {
    RandomSource.calls++;
    return RandomSource.source.nextInt(size);
  }

  static nextIntCosmetic(size: number): number {
    RandomSource.cosmeticCalls++;
    return RandomSource.cosmeticSource.nextInt(size);
  }

  static nextBytes(bytes: Uint8Array): void {
    RandomSource.calls++;
    RandomSource.source.nextBytes(bytes);
  }

  static nextIntUnbounded(): number {
    RandomSource.calls++;
    return RandomSource.source.nextInt();
  }

  static nextLong(): bigint {
    RandomSource.calls++;
    return RandomSource.source.nextLong();
  }

  static nextBoolean(): boolean {
    RandomSource.calls++;
    return RandomSource.source.nextBoolean();
  }

  static nextFloat(): number {
    RandomSource.calls++;
    return RandomSource.source.nextFloat();
  }

  static nextDouble(): number {
    RandomSource.calls++;
    return RandomSource.source.nextDouble();
  }

  static nextGaussian(): number {
    RandomSource.calls++;
    return RandomSource.source.nextGaussian();
  }

  static pickSeed(): bigint {
    const bytes = crypto.randomBytes(6);
    let value = 0n;
    for (let i = 0; i < bytes.length; i++) {
      value |= BigInt(bytes[i] & 0xff) << BigInt(8 * i);
    }
    return value;
  }

  static instance(): RandomSourceInstance {
    return RandomSource._instance;
  }

  static cosmeticInstance(): CosmeticRandomSourceInstance {
    return RandomSource._cosmeticInstance;
  }

  static callsSinceSeed(): number {
    return RandomSource.calls + RandomSource.cosmeticCalls;
  }
}

export { JavaRandom };
