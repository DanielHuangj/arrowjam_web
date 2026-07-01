import { describe, expect, it } from "vitest";
import {
  validateShrinkStripAgainstPipe,
  findControllerCellConflict,
  syncControllersWithShrinkHosts,
} from "./items.ts";

describe("validateShrinkStripAgainstPipe", () => {
  const pipe: [number, number][] = [
    [4, 5],
    [5, 5],
    [6, 5],
    [7, 5],
  ];

  it("allows strip extending along pipe side without each cell touching pipe", () => {
    const bind: [number, number] = [4, 5];
    const strip: [number, number][] = [
      [4, 6],
      [5, 6],
      [6, 6],
    ];
    expect(validateShrinkStripAgainstPipe(bind, strip, pipe)).toBeNull();
  });

  it("rejects strip on opposite side of pipe", () => {
    const bind: [number, number] = [5, 5];
    const strip: [number, number][] = [
      [5, 4],
      [5, 6],
    ];
    expect(validateShrinkStripAgainstPipe(bind, strip, pipe)).toContain("同一侧");
  });
});

describe("findControllerCellConflict", () => {
  it("allows controller cell on host body", () => {
    const host = {
      kind: 2,
      instanceId: 10,
      layer: 2,
      occupiedPositions: [
        [3, 5],
        [4, 5],
        [5, 5],
      ],
    };
    const conflict = findControllerCellConflict([host], [4, 5], 10);
    expect(conflict).toBeNull();
  });

  it("blocks controller when another item shares cell", () => {
    const host = {
      kind: 4,
      instanceId: 10,
      layer: 2,
      occupiedPositions: [[4, 5]],
    };
    const toggle = {
      kind: 15,
      instanceId: 20,
      layer: 3,
      occupiedPositions: [[4, 5]],
    };
    expect(findControllerCellConflict([host, toggle], [4, 5], 10)).toBe(toggle);
  });
});

describe("syncControllersWithShrinkHosts", () => {
  it("snaps bound controller to middle cell after strip shortens", () => {
    const controllers = [
      {
        kind: 16,
        instanceId: 160,
        bindInstanceId: 140,
        occupiedPositions: [[4, 7] as [number, number]],
      },
    ];
    const strips = [
      {
        instanceId: 140,
        occupiedPositions: [
          [4, 5],
          [4, 6],
        ] as [number, number][],
      },
    ];
    syncControllersWithShrinkHosts(controllers, strips);
    expect(controllers[0]!.occupiedPositions[0]).toEqual([4, 6]);
  });
});
