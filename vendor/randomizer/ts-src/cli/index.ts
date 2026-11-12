#!/usr/bin/env node

/**
 * CLI entry point for the Universal Pokemon Randomizer ZX.
 *
 * Usage:
 *   randomizer-cli -s <settings> -i <input ROM> -o <output ROM> [-d] [-u <update>] [-l]
 *
 * Flags:
 *   -s  Path to settings file (required)
 *   -i  Path to source ROM file (required)
 *   -o  Path for output ROM file (required)
 *   -d  Save 3DS game as directory (LayeredFS)
 *   -u  Path to 3DS game update file
 *   -l  Save randomization log
 *   --help  Show usage information
 */

import { invoke } from "./cli-randomizer";

// Strip the first two args (node binary and script path)
const args = process.argv.slice(2);
const exitCode = invoke(args);
process.exit(exitCode);
