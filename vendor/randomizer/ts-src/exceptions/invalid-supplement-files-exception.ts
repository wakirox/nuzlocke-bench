export enum InvalidSupplementFilesType {
  UNKNOWN = "UNKNOWN",
  TOO_SHORT = "TOO_SHORT",
  CUSTOM_NAMES = "CUSTOM_NAMES",
}

export class InvalidSupplementFilesException extends Error {
  private readonly type: InvalidSupplementFilesType;

  constructor(type: InvalidSupplementFilesType, message: string) {
    super(message);
    this.type = type;
    this.name = "InvalidSupplementFilesException";
    Object.setPrototypeOf(this, InvalidSupplementFilesException.prototype);
  }

  getType(): InvalidSupplementFilesType {
    return this.type;
  }
}
