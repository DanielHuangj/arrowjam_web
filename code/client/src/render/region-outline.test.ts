import { describe, expect, it } from "vitest";
import { appendRoundedRegionCellPath } from "./region-outline.ts";

function mockCtx() {
  const path: string[] = [];
  return {
    path,
    ctx: {
      moveTo(x: number, y: number) {
        path.push(`M${x},${y}`);
      },
      lineTo(x: number, y: number) {
        path.push(`L${x},${y}`);
      },
      arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
        path.push(`A${x1},${y1},${x2},${y2},${r}`);
      },
      closePath() {
        path.push("Z");
      },
    } as unknown as CanvasRenderingContext2D,
  };
}

describe("region-outline", () => {
  it("rounds outer convex corners of a connected block", () => {
    const cells = new Set(["0,0", "1,0", "0,1", "1,1"]);
    const { path, ctx } = mockCtx();

    appendRoundedRegionCellPath(ctx, 0, 0, cells, 34, 37, 6);
    expect(path.join("")).toContain("A");

    path.length = 0;
    appendRoundedRegionCellPath(ctx, 1, 1, cells, 34, 37, 6);
    expect(path.join("")).toContain("A");
  });

  it("does not round shared interior edges", () => {
    const cells = new Set(["0,0", "1,0"]);
    const { path, ctx } = mockCtx();

    appendRoundedRegionCellPath(ctx, 0, 0, cells, 34, 37, 6);
    const leftCell = path.join("");
    const arcCount = (leftCell.match(/A/g) ?? []).length;
    expect(arcCount).toBe(2);
  });
});
