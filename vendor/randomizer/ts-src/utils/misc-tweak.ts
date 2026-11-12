export class MiscTweak {
  static readonly NO_MISC_TWEAKS = 0;

  static readonly allTweaks: MiscTweak[] = [];

  readonly value: number;
  readonly tweakName: string;
  readonly tooltipText: string;
  private readonly priority: number;

  constructor(
    value: number,
    tweakName: string,
    tooltipText: string,
    priority: number
  ) {
    this.value = value;
    this.tweakName = tweakName;
    this.tooltipText = tooltipText;
    this.priority = priority;
    MiscTweak.allTweaks.push(this);
  }

  getValue(): number {
    return this.value;
  }

  getTweakName(): string {
    return this.tweakName;
  }

  getTooltipText(): string {
    return this.tooltipText;
  }

  compareTo(o: MiscTweak): number {
    return o.priority - this.priority;
  }

  // Static instances - names and tooltips are provided directly since
  // we don't have a ResourceBundle in TypeScript.
  // These use the tweakID as both name and tooltip placeholder;
  // consumers should replace with localized strings.
  static readonly BW_EXP_PATCH = new MiscTweak(
    1,
    "BW Exp Patch",
    "Patches the BW Exp system to the newer one used in later games.",
    0
  );
  static readonly NERF_X_ACCURACY = new MiscTweak(
    1 << 1,
    "Nerf X Accuracy",
    "Nerfs X Accuracy to only boost accuracy by one stage, like in Gen 5+.",
    0
  );
  static readonly FIX_CRIT_RATE = new MiscTweak(
    1 << 2,
    "Fix Crit Rate",
    "Fixes the critical hit rate in Gen 1 to work as intended.",
    0
  );
  static readonly FASTEST_TEXT = new MiscTweak(
    1 << 3,
    "Fastest Text",
    "Makes text appear instantly.",
    0
  );
  static readonly RUNNING_SHOES_INDOORS = new MiscTweak(
    1 << 4,
    "Running Shoes Indoors",
    "Allows the Running Shoes to be used indoors.",
    0
  );
  static readonly RANDOMIZE_PC_POTION = new MiscTweak(
    1 << 5,
    "Randomize PC Potion",
    "Randomizes the Potion found in the player's PC at the start.",
    0
  );
  static readonly ALLOW_PIKACHU_EVOLUTION = new MiscTweak(
    1 << 6,
    "Allow Pikachu Evolution",
    "In Yellow, allows Pikachu to evolve.",
    0
  );
  static readonly NATIONAL_DEX_AT_START = new MiscTweak(
    1 << 7,
    "National Dex at Start",
    "Gives the player the National Dex at the start of the game.",
    0
  );
  static readonly UPDATE_TYPE_EFFECTIVENESS = new MiscTweak(
    1 << 8,
    "Update Type Effectiveness",
    "Updates type effectiveness to Gen 6+ values.",
    0
  );
  static readonly FORCE_CHALLENGE_MODE = new MiscTweak(
    1 << 9,
    "Force Challenge Mode",
    "Forces BW2 Challenge Mode from the start.",
    0
  );
  static readonly LOWER_CASE_POKEMON_NAMES = new MiscTweak(
    1 << 10,
    "Lower Case Pokemon Names",
    "Converts all-caps Pokemon names to mixed case.",
    0
  );
  static readonly RANDOMIZE_CATCHING_TUTORIAL = new MiscTweak(
    1 << 11,
    "Randomize Catching Tutorial",
    "Randomizes the Pokemon used in the catching tutorial.",
    0
  );
  static readonly BAN_LUCKY_EGG = new MiscTweak(
    1 << 12,
    "Ban Lucky Egg",
    "Bans Lucky Egg from appearing as a held item on wild Pokemon.",
    1
  );
  static readonly NO_FREE_LUCKY_EGG = new MiscTweak(
    1 << 13,
    "No Free Lucky Egg",
    "Removes the free Lucky Egg given in certain games.",
    0
  );
  static readonly BAN_BIG_MANIAC_ITEMS = new MiscTweak(
    1 << 14,
    "Ban Big Maniac Items",
    "Bans big maniac items from appearing as held items on wild Pokemon.",
    1
  );
  static readonly SOS_BATTLES_FOR_ALL = new MiscTweak(
    1 << 15,
    "SOS Battles for All",
    "Allows SOS battles to occur for all Pokemon.",
    0
  );
  static readonly BALANCE_STATIC_LEVELS = new MiscTweak(
    1 << 16,
    "Balance Static Levels",
    "Balances the levels of static Pokemon encounters.",
    0
  );
  static readonly RETAIN_ALT_FORMES = new MiscTweak(
    1 << 17,
    "Retain Alt Formes",
    "Retains alternate formes when randomizing Pokemon.",
    0
  );
  static readonly RUN_WITHOUT_RUNNING_SHOES = new MiscTweak(
    1 << 18,
    "Run Without Running Shoes",
    "Allows the player to run even without the Running Shoes.",
    0
  );
  static readonly FASTER_HP_AND_EXP_BARS = new MiscTweak(
    1 << 19,
    "Faster HP and Exp Bars",
    "Makes HP and Exp bars animate faster.",
    0
  );
  static readonly FAST_DISTORTION_WORLD = new MiscTweak(
    1 << 20,
    "Fast Distortion World",
    "Speeds up the Distortion World in Platinum.",
    0
  );
  static readonly UPDATE_ROTOM_FORME_TYPING = new MiscTweak(
    1 << 21,
    "Update Rotom Forme Typing",
    "Updates Rotom forme typing to Gen 5+ values.",
    0
  );
  static readonly DISABLE_LOW_HP_MUSIC = new MiscTweak(
    1 << 22,
    "Disable Low HP Music",
    "Disables the low HP music that plays during battle.",
    0
  );
}
