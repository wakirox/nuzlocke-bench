export class RandomizationException extends Error {
  constructor(text: string) {
    super(text);
    this.name = "RandomizationException";
    Object.setPrototypeOf(this, RandomizationException.prototype);
  }
}
