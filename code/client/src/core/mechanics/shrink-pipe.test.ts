import { describe, expect, it } from "vitest";
import type { PipeItem, ShrinkPipeItem } from "../types.ts";
import {
  ShrinkPipeManager,
  canShortenStrip,
  shortenStripPositions,
} from "./shrink-pipe.ts";

const pipe: PipeItem = {
  kind: 3,
  instanceId: 100,
  layer: 2,
  zoneId: null,
  occupiedPositions: [
    [4, 5],
    [5, 5],
    [6, 5],
    [7, 5],
  ],
  health: 3,
  passes: [
    { position: [4, 5], directions: [[-1, 0], [1, 0]] },
    { position: [7, 5], directions: [[-1, 0], [1, 0]] },
  ],
  healthViewPathIndex: 1,
};

const strip: ShrinkPipeItem = {
  kind: 14,
  instanceId: 140,
  layer: 3,
  zoneId: null,
  bindCoordinate: [4, 5],
  bindPipeId: 100,
  shorten: 2,
  occupiedPositions: [
    [4, 5],
    [4, 6],
    [4, 7],
    [4, 8],
  ],
};

describe("shrink-pipe", () => {
  it("shortens from far end of bind coordinate", () => {
    expect(shortenStripPositions(strip, 2)).toEqual([
      [4, 5],
      [4, 6],
    ]);
  });

  it("stops shortening at one cell when pipe alive", () => {
    expect(canShortenStrip({ ...strip, occupiedPositions: [[4, 5]] }, 2)).toBe(
      false,
    );
    expect(canShortenStrip(strip, 2)).toBe(true);
  });

  it("onPipeTraversed shortens bound strip", () => {
    const mgr = new ShrinkPipeManager([{ ...strip }], [{ ...pipe }]);
    mgr.onPipeTraversed([100]);
    expect(mgr.getStrips()[0]!.occupiedPositions).toEqual([
      [4, 5],
      [4, 6],
    ]);
  });

  it("multiple traversals shorten shared strip array until one cell", () => {
    const shared: ShrinkPipeItem[] = [
      {
        ...strip,
        occupiedPositions: [
          [4, 6],
          [4, 7],
          [4, 8],
          [4, 9],
        ],
      },
    ];
    const pipes: PipeItem[] = [{ ...pipe, health: 3 }];
    const mgr = new ShrinkPipeManager(shared, pipes);

    mgr.onPipeTraversed([100]);
    mgr.removeForDeadPipes(new Set([100]));
    expect(shared[0]!.occupiedPositions).toHaveLength(2);

    mgr.onPipeTraversed([100]);
    mgr.removeForDeadPipes(new Set([100]));
    expect(shared[0]!.occupiedPositions).toHaveLength(1);

    mgr.onPipeTraversed([100]);
    expect(shared[0]!.occupiedPositions).toHaveLength(1);
  });

  it("removeForDeadPipes splices bound strips in place", () => {
    const shared: ShrinkPipeItem[] = [{ ...strip }];
    const mgr = new ShrinkPipeManager(shared, []);
    mgr.removeForDeadPipes(new Set());
    expect(mgr.getStrips()).toHaveLength(0);
    expect(shared).toHaveLength(0);
  });

  it("exposes blocker cells excluding pipe body", () => {
    const mgr = new ShrinkPipeManager([{ ...strip }], [pipe]);
    expect(mgr.getBlockerCells().has("4,5")).toBe(false);
    expect(mgr.getBlockerCells().has("4,6")).toBe(true);
  });
});
