/**
 * CliRandomizer.ts - Command-line interface for the randomizer.
 *
 * Ported from Java: com.dabomstew.pkrandom.cli.CliRandomizer
 */

import * as fs from "fs";
import * as path from "path";
import { Settings, StartersMod } from "../config/settings";
import { Randomizer, StringLogStream } from "../randomizer";
import { RomHandlerFactory } from "../romhandlers/rom-handler";
import type { RomHandler } from "../romhandlers/rom-handler";
import { RandomSource } from "../utils/random-source";
import { FileFunctions } from "../utils/file-functions";
import { Gen1RomHandlerFactory } from "../romhandlers/gen1-rom-handler";
import { Gen2RomHandlerFactory } from "../romhandlers/gen2-rom-handler";
import { Gen3RomHandlerFactory } from "../romhandlers/gen3-rom-handler";
import { Gen4RomHandlerFactory } from "../romhandlers/gen4-rom-handler";

/**
 * Parsed CLI arguments.
 */
export interface CliArgs {
  settingsFilePath: string | null;
  settingsString: string | null;
  sourceRomFilePath: string | null;
  outputRomFilePath: string | null;
  saveAsDirectory: boolean;
  updateFilePath: string | null;
  saveLog: boolean;
  showHelp: boolean;
}

/**
 * Interface for ROM handler factories used by the CLI.
 * Each gen provides a factory that can detect and create ROM handlers.
 */
export interface CliRomHandlerFactory {
  isLoadable(filename: string): boolean;
  create(): RomHandler;
}

/**
 * Default set of ROM handler factories, using the abstract RomHandlerFactory class.
 * In the full build, this would include Gen1-Gen7 factories.
 * The CLI accepts these via dependency injection for testability.
 */
export function getDefaultFactories(): RomHandlerFactory[] {
  return [new Gen1RomHandlerFactory(), new Gen2RomHandlerFactory(), new Gen3RomHandlerFactory(), new Gen4RomHandlerFactory()];
}

function printError(
  text: string,
  stderr: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
): void {
  stderr("ERROR: " + text);
}

function printWarning(
  text: string,
  stderr: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
): void {
  stderr("WARNING: " + text);
}

function printUsage(
  stderr: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
): void {
  stderr(
    "Usage: randomizer-cli (-s <settings file> | -ss <settings string>) " +
      "-i <source ROM> -o <output ROM> [-l][-d][-u <3DS update>]",
  );
  stderr("  -s   Path to a binary settings file");
  stderr("  -ss  Settings string (from Java GUI, with or without 3-digit version prefix)");
  stderr("  -i   Path to source ROM");
  stderr("  -o   Path for output ROM");
  stderr("  -l   Save randomization log alongside output");
  stderr("  -d   Save 3DS game as directory (LayeredFS)");
}

/**
 * Parse command-line arguments into a structured object.
 */
export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    settingsFilePath: null,
    settingsString: null,
    sourceRomFilePath: null,
    outputRomFilePath: null,
    saveAsDirectory: false,
    updateFilePath: null,
    saveLog: false,
    showHelp: false,
  };

  const allowedFlags = ["-i", "-o", "-s", "-ss", "-d", "-u", "-l", "--help"];

  for (let i = 0; i < args.length; i++) {
    if (allowedFlags.includes(args[i])) {
      switch (args[i]) {
        case "-i":
          result.sourceRomFilePath = args[i + 1] ?? null;
          i++;
          break;
        case "-o":
          result.outputRomFilePath = args[i + 1] ?? null;
          i++;
          break;
        case "-ss":
          result.settingsString = args[i + 1] ?? null;
          i++;
          break;
        case "-s":
          result.settingsFilePath = args[i + 1] ?? null;
          i++;
          break;
        case "-d":
          result.saveAsDirectory = true;
          break;
        case "-u":
          result.updateFilePath = args[i + 1] ?? null;
          i++;
          break;
        case "-l":
          result.saveLog = true;
          break;
        case "--help":
          result.showHelp = true;
          break;
      }
    }
  }

  return result;
}

/**
 * Perform the actual randomization process.
 *
 * @param settingsSource - Path to settings file, or an already-parsed Settings object
 * @param sourceRomFilePath - Path to the source ROM
 * @param destinationRomFilePath - Path for the output ROM
 * @param saveAsDirectory - Whether to save as a directory (LayeredFS for 3DS)
 * @param updateFilePath - Optional path to a 3DS game update
 * @param saveLog - Whether to save the randomization log
 * @param factories - ROM handler factories to try
 * @param stderr - Function for writing error/warning output
 * @param stdout - Function for writing standard output
 * @returns true if randomization succeeded, false otherwise
 */
export function performDirectRandomization(
  settingsSource: string | Settings,
  sourceRomFilePath: string,
  destinationRomFilePath: string,
  saveAsDirectory: boolean,
  updateFilePath: string | null,
  saveLog: boolean,
  factories: RomHandlerFactory[],
  stderr: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
  stdout: (msg: string) => void = (msg) => process.stdout.write(msg + "\n"),
): boolean {
  // Load settings
  let settings: Settings;
  try {
    if (settingsSource instanceof Settings) {
      settings = settingsSource;
    } else {
      const data = new Uint8Array(fs.readFileSync(settingsSource));
      settings = Settings.read(data);
    }
  } catch (ex) {
    stderr(String(ex));
    return false;
  }

  // Set up log stream
  const logStream = new StringLogStream();

  try {
    const romFilePath = path.resolve(sourceRomFilePath);

    for (const factory of factories) {
      if (factory.isLoadable(romFilePath)) {
        const romHandler = factory.create(RandomSource.instance());
        romHandler.loadRom(romFilePath);

        // Handle game updates for 3DS games (Gen 6/7)
        if (
          updateFilePath !== null &&
          (romHandler.generationOfPokemon() === 6 ||
            romHandler.generationOfPokemon() === 7)
        ) {
          romHandler.loadGameUpdate(updateFilePath);
          if (!saveAsDirectory) {
            printWarning(
              "Forcing save as directory since a game update was supplied.",
              stderr,
            );
          }
          saveAsDirectory = true;
        }

        // Directory save only makes sense for 3DS games
        if (
          saveAsDirectory &&
          romHandler.generationOfPokemon() !== 6 &&
          romHandler.generationOfPokemon() !== 7
        ) {
          saveAsDirectory = false;
          printWarning(
            'Saving as directory does not make sense for non-3DS games, ignoring "-d" flag...',
            stderr,
          );
        }

        // Fix filename extension
        let outputPath = path.resolve(destinationRomFilePath);
        if (!saveAsDirectory) {
          const extensions = ["sgb", "gbc", "gba", "nds", "cxi"];
          const defaultExt = romHandler.getDefaultExtension();
          const bannedExtensions = extensions.filter(
            (ext) => ext !== defaultExt,
          );
          outputPath = FileFunctions.fixFilename(
            outputPath,
            defaultExt,
            bannedExtensions,
          );

          // Prevent overwriting the source ROM for DS/3DS games
          const currentFN = romHandler.loadedFilename();
          if (currentFN === outputPath) {
            printError("Cannot overwrite the source ROM for DS/3DS games.", stderr);
            return false;
          }
        }

        // Perform randomization
        const randomizer = new Randomizer(
          settings,
          romHandler,
          saveAsDirectory,
        );
        randomizer.randomize(outputPath, logStream);

        // Save log if requested
        if (saveLog) {
          try {
            const logContent = logStream.getOutput();
            // Write BOM + log content
            const bom = Buffer.from([0xef, 0xbb, 0xbf]);
            const logData = Buffer.from(logContent, "utf-8");
            const combined = Buffer.concat([bom, logData]);
            fs.writeFileSync(outputPath + ".log", combined);
          } catch (_e) {
            printWarning("Could not write log.", stderr);
          }
        }

        stdout("Randomized successfully!");
        return true;
      }
    }

    // No ROM handler matched
    printError(
      `Unsupported ROM file: ${path.basename(sourceRomFilePath)}`,
      stderr,
    );
  } catch (e) {
    if (e instanceof Error) {
      stderr(e.message);
      stderr(e.stack ?? '');
    } else {
      stderr(String(e));
    }
  }
  return false;
}

/**
 * Main CLI entry point. Parses arguments and runs the randomizer.
 *
 * @param args - Command-line arguments (without node/script path)
 * @param factories - ROM handler factories to try
 * @param stderr - Function for writing error/warning output
 * @param stdout - Function for writing standard output
 * @returns exit code (0 = success, 1 = failure)
 */
export function invoke(
  args: string[],
  factories?: RomHandlerFactory[],
  stderr: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
  stdout: (msg: string) => void = (msg) => process.stdout.write(msg + "\n"),
): number {
  const parsed = parseArgs(args);

  if (parsed.showHelp) {
    printUsage(stderr);
    return 0;
  }

  if (
    (parsed.settingsFilePath === null && parsed.settingsString === null) ||
    parsed.sourceRomFilePath === null ||
    parsed.outputRomFilePath === null
  ) {
    printError("Missing required argument", stderr);
    printUsage(stderr);
    return 1;
  }

  // Resolve settings from file or string
  let settingsSource: string | Settings;
  if (parsed.settingsString !== null) {
    try {
      // Strip 3-digit version prefix if present (Java GUI adds it)
      let str = parsed.settingsString;
      if (str.length > 3 && /^\d{3}/.test(str)) {
        str = str.substring(3);
      }
      settingsSource = Settings.fromString(str);
    } catch (ex) {
      printError("Invalid settings string: " + String(ex), stderr);
      return 1;
    }
  } else {
    if (!fs.existsSync(parsed.settingsFilePath!)) {
      printError("Could not read settings file", stderr);
      printUsage(stderr);
      return 1;
    }
    settingsSource = parsed.settingsFilePath!;
  }

  // Validate source ROM exists
  if (!fs.existsSync(parsed.sourceRomFilePath)) {
    printError("Could not read source ROM file", stderr);
    printUsage(stderr);
    return 1;
  }

  // Validate output directory is writable
  const outputDir = path.dirname(path.resolve(parsed.outputRomFilePath));
  try {
    fs.accessSync(outputDir, fs.constants.W_OK);
  } catch {
    printError("Destination ROM path not writable", stderr);
    printUsage(stderr);
    return 1;
  }

  const romFactories = factories ?? getDefaultFactories();

  const processResult = performDirectRandomization(
    settingsSource,
    parsed.sourceRomFilePath,
    parsed.outputRomFilePath,
    parsed.saveAsDirectory,
    parsed.updateFilePath,
    parsed.saveLog,
    romFactories,
    stderr,
    stdout,
  );

  if (!processResult) {
    printError("Randomization failed", stderr);
    printUsage(stderr);
    return 1;
  }

  return 0;
}

// Auto-invoke when run as a script
const scriptArgs = process.argv.slice(2);
if (scriptArgs.length > 0) {
  const exitCode = invoke(scriptArgs);
  process.exit(exitCode);
}
