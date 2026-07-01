import { describe, expect, it } from "vitest";
import {
  cornerDiagonalInCell,
  cornerNonReflectiveTriangleCentroid,
  cornerReflectionSideNormal,
} from "./corner-drawer.ts";

function slope(d: { x1: number; y1: number; x2: number; y2: number }): number {
  return (d.y2 - d.y1) / (d.x2 - d.x1);
}

describe("cornerDiagonalInCell", () => {
  it("bottom-left corner: d1=right d2=up -> backslash diagonal", () => {
    const d = cornerDiagonalInCell([1, 0], [0, -1], 34, 0);
    expect(slope(d)).toBeGreaterThan(0);
  });

  it("bottom-right corner: d1=left d2=up -> slash diagonal", () => {
    const d = cornerDiagonalInCell([-1, 0], [0, -1], 34, 0);
    expect(slope(d)).toBeLessThan(0);
  });

  it("top corner: d1=right d2=down -> slash diagonal", () => {
    const d = cornerDiagonalInCell([1, 0], [0, 1], 34, 0);
    expect(slope(d)).toBeLessThan(0);
  });

  it("top corner: d1=left d2=down -> backslash diagonal", () => {
    const d = cornerDiagonalInCell([-1, 0], [0, 1], 34, 0);
    expect(slope(d)).toBeGreaterThan(0);
  });
});

describe("cornerReflectionSideNormal", () => {
  it("points toward bounce side for bottom-left corner", () => {
    const { nx, ny } = cornerReflectionSideNormal([1, 0], [0, -1]);
    expect(nx).toBeGreaterThan(0);
    expect(ny).toBeLessThan(0);
  });

  it("points toward bounce side for bottom-right corner", () => {
    const { nx, ny } = cornerReflectionSideNormal([-1, 0], [0, -1]);
    expect(nx).toBeLessThan(0);
    expect(ny).toBeLessThan(0);
  });
});

describe("cornerNonReflectiveTriangle", () => {
  it("centroid lies on non-reflective side for bottom-left corner", () => {
    const d1: [number, number] = [1, 0];
    const d2: [number, number] = [0, -1];
    const { nx, ny } = cornerReflectionSideNormal(d1, d2);
    const [cx, cy] = cornerNonReflectiveTriangleCentroid(d1, d2, 34);
    const dot = (cx - 17) * nx + (cy - 17) * ny;
    expect(dot).toBeLessThan(0);
  });
});
