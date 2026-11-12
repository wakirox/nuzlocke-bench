export class ItemList {
  private items: boolean[];
  private tms: boolean[];

  constructor(highestIndex: number) {
    this.items = new Array(highestIndex + 1).fill(false);
    this.tms = new Array(highestIndex + 1).fill(false);
    for (let i = 1; i <= highestIndex; i++) {
      this.items[i] = true;
    }
  }

  public isTM(index: number): boolean {
    return index >= 0 && index < this.tms.length && this.tms[index];
  }

  public isAllowed(index: number): boolean {
    return index >= 0 && index < this.items.length && this.items[index];
  }

  public banSingles(...indexes: number[]): void {
    for (const index of indexes) {
      this.items[index] = false;
    }
  }

  public banRange(startIndex: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.items[i + startIndex] = false;
    }
  }

  public tmRange(startIndex: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.tms[i + startIndex] = true;
    }
  }

  public randomItem(random: () => number): number {
    let chosen = 0;
    while (!this.items[chosen]) {
      chosen = Math.floor(random() * this.items.length);
    }
    return chosen;
  }

  public randomNonTM(random: () => number): number {
    let chosen = 0;
    while (!this.items[chosen] || this.tms[chosen]) {
      chosen = Math.floor(random() * this.items.length);
    }
    return chosen;
  }

  public randomTM(random: () => number): number {
    let chosen = 0;
    while (!this.tms[chosen]) {
      chosen = Math.floor(random() * this.items.length);
    }
    return chosen;
  }

  public copy(newMax?: number): ItemList {
    const max = newMax !== undefined ? newMax : this.items.length - 1;
    const other = new ItemList(max);
    const copyLen = Math.min(this.items.length, other.items.length);
    for (let i = 0; i < copyLen; i++) {
      other.items[i] = this.items[i];
      other.tms[i] = this.tms[i];
    }
    return other;
  }
}
