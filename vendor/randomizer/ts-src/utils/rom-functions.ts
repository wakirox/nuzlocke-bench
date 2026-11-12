import { Pokemon } from "../pokemon/pokemon";
import { MoveLearnt } from "../pokemon/move-learnt";

/**
 * Interface for determining the rendered length of encoded text strings.
 */
export interface StringSizeDeterminer {
  lengthFor(encodedText: string): number;
}

/**
 * Default StringSizeDeterminer that uses string length.
 */
export class StringLengthSD implements StringSizeDeterminer {
  lengthFor(encodedText: string): number {
    return encodedText.length;
  }
}

/**
 * Minimal interface for a RomHandler, used by the functions in this file.
 */
export interface RomHandler {
  getPokemon(): (Pokemon | null)[];
  getPokemonInclFormes(): (Pokemon | null)[];
}

export class RomFunctions {
  static getBasicPokemon(baseRom: RomHandler): Set<Pokemon> {
    const allPokes = baseRom.getPokemonInclFormes();
    const basicPokes = new Set<Pokemon>();
    for (const pkmn of allPokes) {
      if (pkmn != null) {
        if (pkmn.evolutionsTo.length < 1) {
          basicPokes.add(pkmn);
        }
      }
    }
    return basicPokes;
  }

  static getSplitEvolutions(baseRom: RomHandler): Set<Pokemon> {
    const allPokes = baseRom.getPokemonInclFormes();
    const splitEvos = new Set<Pokemon>();
    for (const pkmn of allPokes) {
      if (pkmn != null) {
        if (pkmn.evolutionsTo.length > 0) {
          const onlyEvo = pkmn.evolutionsTo[0];
          if (!onlyEvo.carryStats) {
            splitEvos.add(pkmn);
          }
        }
      }
    }
    return splitEvos;
  }

  static getMiddleEvolutions(
    baseRom: RomHandler,
    includeSplitEvos: boolean
  ): Set<Pokemon> {
    const allPokes = baseRom.getPokemon();
    const middleEvolutions = new Set<Pokemon>();
    for (const pkmn of allPokes) {
      if (pkmn != null) {
        if (
          pkmn.evolutionsTo.length === 1 &&
          pkmn.evolutionsFrom.length > 0
        ) {
          const onlyEvo = pkmn.evolutionsTo[0];
          if (onlyEvo.carryStats || includeSplitEvos) {
            middleEvolutions.add(pkmn);
          }
        }
      }
    }
    return middleEvolutions;
  }

  static getFinalEvolutions(
    baseRom: RomHandler,
    includeSplitEvos: boolean
  ): Set<Pokemon> {
    const allPokes = baseRom.getPokemon();
    const finalEvolutions = new Set<Pokemon>();
    for (const pkmn of allPokes) {
      if (pkmn != null) {
        if (
          pkmn.evolutionsTo.length === 1 &&
          pkmn.evolutionsFrom.length === 0
        ) {
          const onlyEvo = pkmn.evolutionsTo[0];
          if (onlyEvo.carryStats || includeSplitEvos) {
            finalEvolutions.add(pkmn);
          }
        }
      }
    }
    return finalEvolutions;
  }

  /**
   * Get the 4 moves known by a Pokemon at a particular level.
   */
  static getMovesAtLevel(
    pkmn: number,
    movesets: Map<number, MoveLearnt[]>,
    level: number,
    emptyValue = 0
  ): number[] {
    const curMoves = new Array(4).fill(emptyValue);
    let moveCount = 0;
    const movepool = movesets.get(pkmn);
    if (!movepool) return curMoves;

    for (const ml of movepool) {
      if (ml.level > level) {
        break;
      }

      let alreadyKnownMove = false;
      for (let i = 0; i < moveCount; i++) {
        if (curMoves[i] === ml.move) {
          alreadyKnownMove = true;
          break;
        }
      }

      if (!alreadyKnownMove) {
        if (moveCount === 4) {
          // shift moves up and add to last slot
          curMoves[0] = curMoves[1];
          curMoves[1] = curMoves[2];
          curMoves[2] = curMoves[3];
          curMoves[3] = ml.move;
        } else {
          curMoves[moveCount++] = ml.move;
        }
      }
    }

    return curMoves;
  }

  static camelCase(original: string): string {
    const chars = original.toLowerCase().split("");
    let docap = true;
    for (let j = 0; j < chars.length; j++) {
      const current = chars[j];
      if (docap && /[a-zA-Z]/.test(current)) {
        chars[j] = current.toUpperCase();
        docap = false;
      } else {
        if (
          !docap &&
          !/[a-zA-Z]/.test(current) &&
          current !== "'" &&
          current !== "\u2019"
        ) {
          docap = true;
        }
      }
    }
    return chars.join("");
  }

  static freeSpaceFinder(
    rom: Uint8Array,
    freeSpace: number,
    amount: number,
    offset: number,
    longAligned = true
  ): number {
    if (!longAligned) {
      const searchNeedle = new Uint8Array(amount + 2).fill(
        freeSpace & 0xff
      );
      return RomFunctions.searchForFirst(rom, offset, searchNeedle) + 2;
    } else {
      const searchNeedle = new Uint8Array(amount + 5).fill(
        freeSpace & 0xff
      );
      return (
        (RomFunctions.searchForFirst(rom, offset, searchNeedle) + 5) & ~3
      );
    }
  }

  static search(
    haystack: Uint8Array,
    needle: Uint8Array
  ): number[];
  static search(
    haystack: Uint8Array,
    beginOffset: number,
    needle: Uint8Array
  ): number[];
  static search(
    haystack: Uint8Array,
    beginOffset: number,
    endOffset: number,
    needle: Uint8Array
  ): number[];
  static search(
    haystack: Uint8Array,
    arg2: Uint8Array | number,
    arg3?: Uint8Array | number,
    arg4?: Uint8Array
  ): number[] {
    let beginOffset: number;
    let endOffset: number;
    let needle: Uint8Array;

    if (arg2 instanceof Uint8Array) {
      beginOffset = 0;
      endOffset = haystack.length;
      needle = arg2;
    } else if (arg4 instanceof Uint8Array) {
      beginOffset = arg2;
      endOffset = arg3 as number;
      needle = arg4;
    } else {
      beginOffset = arg2;
      endOffset = haystack.length;
      needle = arg3 as Uint8Array;
    }

    let currentMatchStart = beginOffset;
    let currentCharacterPosition = 0;
    const needleSize = needle.length;
    const toFillTable = RomFunctions.buildKMPSearchTable(needle);
    const results: number[] = [];

    while (currentMatchStart + currentCharacterPosition < endOffset) {
      if (
        needle[currentCharacterPosition] ===
        haystack[currentCharacterPosition + currentMatchStart]
      ) {
        currentCharacterPosition++;
        if (currentCharacterPosition === needleSize) {
          results.push(currentMatchStart);
          currentCharacterPosition = 0;
          currentMatchStart += needleSize;
        }
      } else {
        currentMatchStart +=
          currentCharacterPosition -
          toFillTable[currentCharacterPosition];
        if (toFillTable[currentCharacterPosition] > -1) {
          currentCharacterPosition =
            toFillTable[currentCharacterPosition];
        } else {
          currentCharacterPosition = 0;
        }
      }
    }
    return results;
  }

  private static searchForFirst(
    haystack: Uint8Array,
    beginOffset: number,
    needle: Uint8Array
  ): number {
    let currentMatchStart = beginOffset;
    let currentCharacterPosition = 0;
    const docSize = haystack.length;
    const needleSize = needle.length;
    const toFillTable = RomFunctions.buildKMPSearchTable(needle);

    while (currentMatchStart + currentCharacterPosition < docSize) {
      if (
        needle[currentCharacterPosition] ===
        haystack[currentCharacterPosition + currentMatchStart]
      ) {
        currentCharacterPosition++;
        if (currentCharacterPosition === needleSize) {
          return currentMatchStart;
        }
      } else {
        currentMatchStart +=
          currentCharacterPosition -
          toFillTable[currentCharacterPosition];
        if (toFillTable[currentCharacterPosition] > -1) {
          currentCharacterPosition =
            toFillTable[currentCharacterPosition];
        } else {
          currentCharacterPosition = 0;
        }
      }
    }
    return -1;
  }

  private static buildKMPSearchTable(needle: Uint8Array): number[] {
    const stable = new Array<number>(needle.length);
    let pos = 2;
    let j = 0;
    stable[0] = -1;
    if (needle.length > 1) {
      stable[1] = 0;
    }
    while (pos < needle.length) {
      if (needle[pos - 1] === needle[j]) {
        stable[pos] = j + 1;
        pos++;
        j++;
      } else if (j > 0) {
        j = stable[j];
      } else {
        stable[pos] = 0;
        pos++;
      }
    }
    return stable;
  }

  static rewriteDescriptionForNewLineSize(
    moveDesc: string,
    newline: string,
    lineSize: number,
    ssd: StringSizeDeterminer
  ): string {
    // Remove hyphenated line breaks and replace newlines with spaces
    moveDesc = moveDesc
      .split("-" + newline)
      .join("")
      .split(newline)
      .join(" ");
    // Keep spatk/spdef as one word on one line
    moveDesc = moveDesc.replace(/Sp\. Atk/g, "Sp__Atk");
    moveDesc = moveDesc.replace(/Sp\. Def/g, "Sp__Def");
    moveDesc = moveDesc.replace(/SP\. ATK/g, "SP__ATK");
    moveDesc = moveDesc.replace(/SP\. DEF/g, "SP__DEF");

    const words = moveDesc.split(" ");
    let fullDesc = "";
    let thisLine = "";
    let currLineWC = 0;
    let currLineCC = 0;
    let linesWritten = 0;

    for (let i = 0; i < words.length; i++) {
      words[i] = words[i].replace(/SP__/g, "SP. ");
      words[i] = words[i].replace(/Sp__/g, "Sp. ");
      let reqLength = ssd.lengthFor(words[i]);
      if (currLineWC > 0) {
        reqLength++;
      }
      if (currLineCC + reqLength <= lineSize) {
        if (currLineWC > 0) {
          thisLine += " ";
        }
        thisLine += words[i];
        currLineWC++;
        currLineCC += reqLength;
      } else {
        if (currLineWC > 0) {
          if (linesWritten > 0) {
            fullDesc += newline;
          }
          fullDesc += thisLine;
          linesWritten++;
          thisLine = "";
        }
        thisLine = words[i];
        currLineWC = 1;
        currLineCC = ssd.lengthFor(words[i]);
      }
    }

    if (currLineWC > 0) {
      if (linesWritten > 0) {
        fullDesc += newline;
      }
      fullDesc += thisLine;
    }

    return fullDesc;
  }

  static formatTextWithReplacements(
    text: string,
    replacements: Map<string, string> | null,
    newline: string,
    extraline: string,
    newpara: string,
    maxLineLength: number,
    ssd: StringSizeDeterminer
  ): string {
    let endsWithPara = false;
    if (text.endsWith(newpara)) {
      endsWithPara = true;
      text = text.substring(0, text.length - newpara.length);
    }
    text = text.split(newline).join(" ").split(extraline).join(" ");

    if (replacements != null) {
      let index = 0;
      for (const [key] of replacements) {
        index++;
        text = text.split(key).join("<tmpreplace" + index + ">");
      }
      index = 0;
      for (const [, value] of replacements) {
        index++;
        text = text
          .split("<tmpreplace" + index + ">")
          .join(value);
      }
    }

    const escapedNewpara = newpara.replace(/\\/g, "\\\\");
    const oldParagraphs = text.split(new RegExp(escapedNewpara));
    let finalResult = "";
    const sentenceNewLineSize = Math.max(10, Math.floor(maxLineLength / 2));

    for (let para = 0; para < oldParagraphs.length; para++) {
      const words = oldParagraphs[para].split(" ");
      let fullPara = "";
      let thisLine = "";
      let currLineWC = 0;
      let currLineCC = 0;
      let linesWritten = 0;
      let currLineLastChar = "\0";

      for (const word of words) {
        let reqLength = ssd.lengthFor(word);
        if (currLineWC > 0) {
          reqLength++;
        }
        if (
          currLineCC + reqLength > maxLineLength ||
          (currLineCC >= sentenceNewLineSize &&
            (currLineLastChar === "." ||
              currLineLastChar === "?" ||
              currLineLastChar === "!" ||
              currLineLastChar === "\u2026" ||
              currLineLastChar === ","))
        ) {
          if (currLineWC > 0) {
            if (linesWritten > 1) {
              fullPara += extraline;
            } else if (linesWritten === 1) {
              fullPara += newline;
            }
            fullPara += thisLine;
            linesWritten++;
            thisLine = "";
          }
          thisLine = word;
          currLineWC = 1;
          currLineCC = ssd.lengthFor(word);
          currLineLastChar =
            word.length === 0
              ? "\0"
              : word.charAt(word.length - 1);
        } else {
          if (currLineWC > 0) {
            thisLine += " ";
          }
          thisLine += word;
          currLineWC++;
          currLineCC += reqLength;
          currLineLastChar =
            word.length === 0
              ? "\0"
              : word.charAt(word.length - 1);
        }
      }

      if (currLineWC > 0) {
        if (linesWritten > 1) {
          fullPara += extraline;
        } else if (linesWritten === 1) {
          fullPara += newline;
        }
        fullPara += thisLine;
      }

      if (para > 0) {
        finalResult += newpara;
      }
      finalResult += fullPara;
    }

    if (endsWithPara) {
      finalResult += newpara;
    }
    return finalResult;
  }
}
