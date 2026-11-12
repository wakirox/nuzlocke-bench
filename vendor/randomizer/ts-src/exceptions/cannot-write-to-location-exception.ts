export class CannotWriteToLocationException extends Error {
  constructor(cause: Error);
  constructor(text: string);
  constructor(arg: Error | string) {
    if (arg instanceof Error) {
      super(arg.message);
      this.cause = arg;
    } else {
      super(arg);
    }
    this.name = "CannotWriteToLocationException";
    Object.setPrototypeOf(this, CannotWriteToLocationException.prototype);
  }
}
