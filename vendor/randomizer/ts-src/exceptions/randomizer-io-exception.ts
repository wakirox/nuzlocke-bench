export class RandomizerIOException extends Error {
  constructor(cause: Error);
  constructor(text: string);
  constructor(text: string, cause: Error);
  constructor(arg1: Error | string, arg2?: Error) {
    if (arg1 instanceof Error) {
      super(arg1.message);
      this.cause = arg1;
    } else if (arg2 instanceof Error) {
      super(arg1);
      this.cause = arg2;
    } else {
      super(arg1);
    }
    this.name = "RandomizerIOException";
    Object.setPrototypeOf(this, RandomizerIOException.prototype);
  }
}
