export class EncryptedROMException extends Error {
  constructor(cause: Error);
  constructor(text: string);
  constructor(arg: Error | string) {
    if (arg instanceof Error) {
      super(arg.message);
      this.cause = arg;
    } else {
      super(arg);
    }
    this.name = "EncryptedROMException";
    Object.setPrototypeOf(this, EncryptedROMException.prototype);
  }
}
