import * as os from "os";
import { SysConstants } from "../utils/sys-constants";

export class BatchRandomizationSettings {
  batchRandomizationEnabled: boolean = false;
  generateLogFile: boolean = false;
  autoAdvanceStartingIndex: boolean = true;
  numberOfRandomizedROMs: number = 10;
  startingIndex: number = 0;
  fileNamePrefix: string = "random";
  outputDirectory: string = SysConstants.ROOT_PATH;

  toString(): string {
    const lines = [
      `batchrandomization.enabled=${this.batchRandomizationEnabled}`,
      `batchrandomization.generatelogfiles=${this.generateLogFile}`,
      `batchrandomization.autoadvanceindex=${this.autoAdvanceStartingIndex}`,
      `batchrandomization.numberofrandomizedroms=${this.numberOfRandomizedROMs}`,
      `batchrandomization.startingindex=${this.startingIndex}`,
      `batchrandomization.filenameprefix=${this.fileNamePrefix}`,
      `batchrandomization.outputdirectory=${this.outputDirectory}`,
    ];
    return lines.join(os.EOL);
  }

  clone(): BatchRandomizationSettings {
    const copy = new BatchRandomizationSettings();
    copy.batchRandomizationEnabled = this.batchRandomizationEnabled;
    copy.generateLogFile = this.generateLogFile;
    copy.autoAdvanceStartingIndex = this.autoAdvanceStartingIndex;
    copy.numberOfRandomizedROMs = this.numberOfRandomizedROMs;
    copy.startingIndex = this.startingIndex;
    copy.fileNamePrefix = this.fileNamePrefix;
    copy.outputDirectory = this.outputDirectory;
    return copy;
  }
}
