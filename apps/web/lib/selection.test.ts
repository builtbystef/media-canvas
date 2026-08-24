import { describe, expect, it } from "vitest";
import { marqueeSelection, selectionTarget, toggleSelection, unionBounds } from "./selection";

describe("selection", () => {
  it("selects the scope child, or the deepest mounted element with the modifier", () => {
    const mountedChain = ["leaf", "inner", "outer"];

    expect(selectionTarget(mountedChain, [])).toBe("outer");
    expect(selectionTarget(mountedChain, ["outer"])).toBe("inner");
    expect(selectionTarget(mountedChain, ["outer", "inner"])).toBe("leaf");
    expect(selectionTarget(mountedChain, [], true)).toBe("leaf");
  });

  it("adds and removes with shift", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("takes every sibling whose mounted bounds intersect the marquee", () => {
    const chosen = marqueeSelection({ left: 5, top: 5, right: 15, bottom: 15 }, [
      { id: "touches", bounds: { left: 10, top: 10, right: 20, bottom: 20 } },
      { id: "contains", bounds: { left: 7, top: 7, right: 8, bottom: 8 } },
      { id: "outside", bounds: { left: 16, top: 16, right: 20, bottom: 20 } },
    ]);

    expect(chosen).toEqual(["touches", "contains"]);
  });

  it("forms one axis-aligned union box", () => {
    expect(
      unionBounds([
        { left: 10, top: 4, right: 20, bottom: 8 },
        { left: -3, top: 6, right: 12, bottom: 30 },
      ]),
    ).toEqual({ left: -3, top: 4, right: 20, bottom: 30 });
  });
});
