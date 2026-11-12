import { describe, expect, it } from "vitest";
import { menuLabel } from "../../src/bridge/menu-label";

describe("menuLabel", () => {
  it("drops a shop line's price", () => {
    expect(menuLabel("ITEM A ¥200")).toBe("ITEM A");
    expect(menuLabel("ITEM B ¥1200")).toBe("ITEM B");
  });

  it("drops a bag line's quantity", () => {
    expect(menuLabel("ITEM 28 × 1")).toBe("ITEM 28");
    expect(menuLabel("ITEM A ×12")).toBe("ITEM A");
  });

  it("drops the scroll arrow, with or without a price before it", () => {
    expect(menuLabel("ITEM C ¥100▼")).toBe("ITEM C");
    expect(menuLabel("CANCEL ▼")).toBe("CANCEL");
  });

  it("keeps plain options, digits in a name included", () => {
    expect(menuLabel("YES")).toBe("YES");
    expect(menuLabel("ITEM 28")).toBe("ITEM 28");
    expect(menuLabel("NEW NAME")).toBe("NEW NAME");
  });

  it("never returns nothing", () => {
    expect(menuLabel("¥200")).toBe("¥200");
  });
});
