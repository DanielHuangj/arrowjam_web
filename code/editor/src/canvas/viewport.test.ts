import { describe, expect, it } from "vitest";
import { pointerToCell } from "./viewport.ts";

describe("pointerToCell", () => {
  it("maps click to grid cell with scale 1", () => {
    const canvas = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 370,
        height: 370,
        right: 0,
        bottom: 0,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    // STEP=37, CELL=34 — click inside cell (2,3)
    const cell = pointerToCell(100 + 2 * 37 + 10, 50 + 3 * 37 + 10, canvas, { width: 20, height: 20 }, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      panning: false,
      spaceHeld: false,
    });
    expect(cell).toEqual([2, 3]);
  });

  it("accounts for viewport scale", () => {
    const canvas = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 74,
        height: 74,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    const cell = pointerToCell(37, 37, canvas, { width: 10, height: 10 }, {
      scale: 2,
      offsetX: 0,
      offsetY: 0,
      panning: false,
      spaceHeld: false,
    });
    expect(cell).toEqual([0, 0]);
  });
});
