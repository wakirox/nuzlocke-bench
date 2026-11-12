// The model's route book: go_to may only travel what the model itself noted.

import { describe, expect, it } from "vitest";
import { RouteBook } from "../../src/bridge/routes";

describe("route book", () => {
  it("starts empty: nothing about the world is known in advance", () => {
    const book = new RouteBook();
    expect(book.list()).toEqual([]);
    expect(book.plan("PALLET_TOWN", "ROUTE_1")).toBeNull();
  });

  it("plans only over noted links, one way each", () => {
    const book = new RouteBook();
    book.note("PALLET_TOWN", "ROUTE_1", { exit: "up" });
    book.note("ROUTE_1", "VIRIDIAN_CITY", { exit: "up" });
    book.note("VIRIDIAN_CITY", "VIRIDIAN_POKECENTER", { door: [23, 25] });
    expect(book.plan("PALLET_TOWN", "VIRIDIAN_POKECENTER")).toEqual(["ROUTE_1", "VIRIDIAN_CITY", "VIRIDIAN_POKECENTER"]);
    expect(book.plan("VIRIDIAN_POKECENTER", "PALLET_TOWN")).toBeNull(); // the way back wasn't noted
    expect(book.plan("ROUTE_1", "ROUTE_1")).toEqual([]);
  });

  it("takes the shortest chain of noted links", () => {
    const book = new RouteBook();
    book.note("A_TOWN", "B_ROUTE", { exit: "up" });
    book.note("B_ROUTE", "C_CITY", { exit: "up" });
    book.note("C_CITY", "D_CAVE", { door: [3, 4] });
    book.note("A_TOWN", "D_CAVE", { door: [9, 9], push: "up" });
    expect(book.plan("A_TOWN", "D_CAVE")).toEqual(["D_CAVE"]);
  });

  it("replaces a note, forgets one, and lists them readably", () => {
    const book = new RouteBook();
    book.note("OAKS_LAB", "PALLET_TOWN", { door: [4, 11] });
    book.note("OAKS_LAB", "PALLET_TOWN", { door: [5, 11], push: "down" });
    expect(book.list()).toEqual(["OAKS_LAB → PALLET_TOWN: door (5,11) then down"]);
    expect(book.forget("OAKS_LAB", "PALLET_TOWN")).toBe(true);
    expect(book.forget("OAKS_LAB", "PALLET_TOWN")).toBe(false);
    expect(book.list()).toEqual([]);
  });

  it("rejects malformed notes instead of keeping them", () => {
    const book = new RouteBook();
    expect(() => book.note("A", "A", { exit: "up" })).toThrow(/two different maps/);
    expect(() => book.note("A", "B", {})).toThrow(/exactly one/);
    expect(() => book.note("A", "B", { exit: "up", door: [1, 2] })).toThrow(/exactly one/);
    expect(() => book.note("A", "B", { exit: "north" })).toThrow(/exit must be/);
    expect(() => book.note("A", "B", { door: [1, 2], push: "in" })).toThrow(/push must be/);
    expect(() => book.note("A", "B", { door: [-1, 2] })).toThrow(/coordinates/);
    expect(book.list()).toEqual([]);
  });

  it("survives a reload as plain data", () => {
    const book = new RouteBook();
    book.note("PALLET_TOWN", "ROUTE_1", { exit: "up" });
    const reloaded = new RouteBook(JSON.parse(JSON.stringify(book.routes)));
    expect(reloaded.plan("PALLET_TOWN", "ROUTE_1")).toEqual(["ROUTE_1"]);
  });
});
