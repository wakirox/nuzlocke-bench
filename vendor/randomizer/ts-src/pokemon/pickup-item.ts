export class PickupItem {
  public item: number;
  public probabilities: number[];

  constructor(item: number) {
    this.item = item;
    this.probabilities = new Array(10).fill(0);
  }
}
