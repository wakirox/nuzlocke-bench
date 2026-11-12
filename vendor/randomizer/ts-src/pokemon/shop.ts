export class Shop {
  public items: number[] | null = null;
  public name: string | null = null;
  public isMainGame: boolean;

  constructor(otherShop?: Shop) {
    if (otherShop !== undefined) {
      this.items = otherShop.items;
      this.name = otherShop.name;
      this.isMainGame = otherShop.isMainGame;
    } else {
      this.isMainGame = false;
    }
  }
}
