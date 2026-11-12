export const minRomSize = 0x80000;
export const maxRomSize = 0x200000;

export const jpFlagOffset = 0x14A;
export const versionOffset = 0x14C;
export const crcOffset = 0x14E;
export const romSigOffset = 0x134;
export const isGBCOffset = 0x143;
export const romCodeOffset = 0x13F;

export const stringTerminator = 0x50;
export const stringPrintedTextEnd = 0x57;
export const stringPrintedTextPromptEnd = 0x58;

export const bankSize = 0x4000;

export const gbZ80Jump = 0xC3;
export const gbZ80Nop = 0x00;
export const gbZ80XorA = 0xAF;
export const gbZ80LdA = 0x3E;
export const gbZ80LdAToFar = 0xEA;
export const gbZ80Ret = 0xC9;
export const gbZ80JumpRelative = 0x18;

export const physicalTypes: ReadonlySet<string> = new Set([ "NORMAL", "FIGHTING", "POISON", "GROUND", "FLYING", "BUG", "ROCK", "GHOST", "STEEL"]);
