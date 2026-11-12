export class StatChange {
  public stat: number;
  public values: number[];

  constructor(stat: number, ...values: number[]) {
    this.stat = stat;
    this.values = values;
  }
}
