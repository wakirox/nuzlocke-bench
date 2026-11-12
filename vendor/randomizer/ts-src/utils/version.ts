export class Version {
  static readonly VERSION = 322;
  static readonly VERSION_STRING = "4.6.1";

  static readonly oldVersions: Map<number, string> =
    Version.setupVersionsMap();

  private static setupVersionsMap(): Map<number, string> {
    const map = new Map<number, string>();

    map.set(100, "1.0.1a");
    map.set(102, "1.0.2a");
    map.set(110, "1.1.0");
    map.set(111, "1.1.1");
    map.set(112, "1.1.2");
    map.set(120, "1.2.0a");
    map.set(150, "1.5.0");
    map.set(160, "1.6.0a");
    map.set(161, "1.6.1");
    map.set(162, "1.6.2");
    map.set(163, "1.6.3b");
    map.set(170, "1.7.0b");
    map.set(171, "1.7.1");
    map.set(172, "1.7.2");
    map.set(310, "3.1.0");
    map.set(311, "4.0.0");
    map.set(312, "4.0.1");
    map.set(313, "4.0.2");
    map.set(314, "4.1.0");
    map.set(315, "4.2.0");
    map.set(316, "4.2.1");
    map.set(317, "4.3.0");
    map.set(318, "4.4.0");
    map.set(319, "4.5.0");
    map.set(320, "4.5.1");
    map.set(321, "4.6.0");

    // Latest version
    map.set(Version.VERSION, Version.VERSION_STRING);

    return map;
  }

  static isReleaseVersionNewer(releaseVersion: string): boolean {
    if (Version.VERSION_STRING.includes("dev")) {
      return false;
    }
    try {
      const releaseVersionTrimmed = releaseVersion.substring(1);
      const thisVersionPieces = Version.VERSION_STRING.split(".");
      const releaseVersionPieces = releaseVersionTrimmed.split(".");
      const smallestLength = Math.min(
        thisVersionPieces.length,
        releaseVersionPieces.length
      );
      for (let i = 0; i < smallestLength; i++) {
        const thisVersionPiece = parseInt(thisVersionPieces[i], 10);
        const releaseVersionPiece = parseInt(
          releaseVersionPieces[i],
          10
        );
        if (thisVersionPiece < releaseVersionPiece) {
          return true;
        } else if (thisVersionPiece > releaseVersionPiece) {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
}
