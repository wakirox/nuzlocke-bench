import * as path from "path";
import * as os from "os";

function getRootPath(): string {
  try {
    return path.dirname(process.argv[1]) + path.sep;
  } catch {
    return "./";
  }
}

export class SysConstants {
  static readonly AUTOUPDATE_URL =
    "http://pokehacks.dabomstew.com/randomizer/autoupdate/";
  static readonly WEBSITE_URL =
    "http://pokehacks.dabomstew.com/randomizer/";
  static readonly WEBSITE_URL_ZX =
    "https://github.com/Ajarmar/universal-pokemon-randomizer-zx/releases";
  static readonly WIKI_URL_ZX =
    "https://github.com/Ajarmar/universal-pokemon-randomizer-zx/wiki";
  static readonly API_URL_ZX =
    "https://api.github.com/repos/ajarmar/universal-pokemon-randomizer-zx/releases/latest";
  static readonly UPDATE_VERSION = 1721;
  static readonly ROOT_PATH: string = getRootPath();
  static readonly LINE_SEP: string = os.EOL;
  static readonly customNamesFile = "customnames.rncn";

  // OLD custom names files
  static readonly tnamesFile = "trainernames.txt";
  static readonly tclassesFile = "trainerclasses.txt";
  static readonly nnamesFile = "nicknames.txt";
}
