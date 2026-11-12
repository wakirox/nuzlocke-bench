export class MoveLearnt {
  public move: number = 0;
  public level: number = 0;

  public toString(): string {
    return "move " + this.move + " at level " + this.level;
  }
}
