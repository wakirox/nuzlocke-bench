import * as os from "os";

const CUSTOM_NAMES_VERSION = 1;

export class CustomNamesSet {
  private trainerNames: string[];
  private trainerClasses: string[];
  private doublesTrainerNames: string[];
  private doublesTrainerClasses: string[];
  private pokemonNicknames: string[];

  constructor(data?: Uint8Array) {
    if (data !== undefined) {
      let offset = 0;
      if (data[offset++] !== CUSTOM_NAMES_VERSION) {
        throw new Error("Invalid custom names file provided.");
      }
      const result1 = CustomNamesSet.readNamesBlock(data, offset);
      this.trainerNames = result1.names;
      offset = result1.nextOffset;

      const result2 = CustomNamesSet.readNamesBlock(data, offset);
      this.trainerClasses = result2.names;
      offset = result2.nextOffset;

      const result3 = CustomNamesSet.readNamesBlock(data, offset);
      this.doublesTrainerNames = result3.names;
      offset = result3.nextOffset;

      const result4 = CustomNamesSet.readNamesBlock(data, offset);
      this.doublesTrainerClasses = result4.names;
      offset = result4.nextOffset;

      const result5 = CustomNamesSet.readNamesBlock(data, offset);
      this.pokemonNicknames = result5.names;
    } else {
      this.trainerNames = [];
      this.trainerClasses = [];
      this.doublesTrainerNames = [];
      this.doublesTrainerClasses = [];
      this.pokemonNicknames = [];
    }
  }

  private static readNamesBlock(
    data: Uint8Array,
    offset: number
  ): { names: string[]; nextOffset: number } {
    if (offset + 4 > data.length) {
      throw new Error("Invalid size specified.");
    }
    // Read big-endian 4-byte size
    const size =
      ((data[offset] & 0xff) << 24) |
      ((data[offset + 1] & 0xff) << 16) |
      ((data[offset + 2] & 0xff) << 8) |
      (data[offset + 3] & 0xff);
    offset += 4;

    if (offset + size > data.length) {
      throw new Error("Invalid size specified.");
    }

    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(data.subarray(offset, offset + size));
    const lines = text.split(/\r?\n/);
    const names: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        names.push(trimmed);
      }
    }

    return { names, nextOffset: offset + size };
  }

  getBytes(): Uint8Array {
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([CUSTOM_NAMES_VERSION]));
    parts.push(CustomNamesSet.writeNamesBlock(this.trainerNames));
    parts.push(CustomNamesSet.writeNamesBlock(this.trainerClasses));
    parts.push(CustomNamesSet.writeNamesBlock(this.doublesTrainerNames));
    parts.push(CustomNamesSet.writeNamesBlock(this.doublesTrainerClasses));
    parts.push(CustomNamesSet.writeNamesBlock(this.pokemonNicknames));

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  private static writeNamesBlock(names: string[]): Uint8Array {
    const newln = os.EOL;
    let outNames = "";
    let first = true;
    for (const name of names) {
      if (!first) {
        outNames += newln;
      }
      first = false;
      outNames += name;
    }
    const encoder = new TextEncoder();
    const namesData = encoder.encode(outNames);
    const szData = new Uint8Array(4);
    szData[0] = (namesData.length >>> 24) & 0xff;
    szData[1] = (namesData.length >>> 16) & 0xff;
    szData[2] = (namesData.length >>> 8) & 0xff;
    szData[3] = namesData.length & 0xff;

    const result = new Uint8Array(4 + namesData.length);
    result.set(szData, 0);
    result.set(namesData, 4);
    return result;
  }

  getTrainerNames(): readonly string[] {
    return [...this.trainerNames];
  }

  getTrainerClasses(): readonly string[] {
    return [...this.trainerClasses];
  }

  getDoublesTrainerNames(): readonly string[] {
    return [...this.doublesTrainerNames];
  }

  getDoublesTrainerClasses(): readonly string[] {
    return [...this.doublesTrainerClasses];
  }

  getPokemonNicknames(): readonly string[] {
    return [...this.pokemonNicknames];
  }

  setTrainerNames(names: string[]): void {
    this.trainerNames = [...names];
  }

  setTrainerClasses(names: string[]): void {
    this.trainerClasses = [...names];
  }

  setDoublesTrainerNames(names: string[]): void {
    this.doublesTrainerNames = [...names];
  }

  setDoublesTrainerClasses(names: string[]): void {
    this.doublesTrainerClasses = [...names];
  }

  setPokemonNicknames(names: string[]): void {
    this.pokemonNicknames = [...names];
  }
}
