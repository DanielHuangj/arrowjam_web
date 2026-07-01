import { describe, expect, it } from "vitest";
import type { ArrowItem, ControllerItem, MovingWallItem, ToggleItem } from "../types.ts";
import { MovingWallManager } from "./moving-wall.ts";
import { ShrinkPipeManager } from "./shrink-pipe.ts";
import { ToggleManager } from "./toggle.ts";

describe("toggle", () => {
  it("collectCrossedToggleIds defers flip until commitToggles", () => {
    const toggle: ToggleItem = {
      kind: 15,
      instanceId: 150,
      layer: 3,
      zoneId: null,
      groupID: 1,
      direction: 1,
      occupiedPositions: [[4, 5]],
    };
    const ctx = {
      arrows: [],
      corners: [],
      shrinkPipes: [],
      controllers: [],
      wallManager: new MovingWallManager([]),
      shrinkPipeManager: new ShrinkPipeManager([], []),
      isToggleCovered: () => false,
      isControllerCovered: () => false,
      wallHasController: () => false,
    };
    const mgr = new ToggleManager([toggle], []);

    const ids = mgr.collectCrossedToggleIds(
      [[2, 5], [3, 5]],
      [[3, 5], [4, 5]],
      ctx,
    );
    expect(ids).toEqual([150]);
    expect(toggle.direction).toBe(1);

    mgr.commitToggles(ids, ctx);
    expect(toggle.direction).toBe(2);
  });

  it("fires controller when arrow crosses toggle", () => {
    const wall: MovingWallItem = {
      kind: 7,
      instanceId: 70,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[5, 5], [5, 6]],
      movingPath: [[5, 5], [5, 6], [5, 7]],
      movingDistance: 1,
      movingType: 1,
    };
    const toggle: ToggleItem = {
      kind: 15,
      instanceId: 150,
      layer: 3,
      zoneId: null,
      groupID: 1,
      direction: 1,
      occupiedPositions: [[4, 5]],
    };
    const ctrl: ControllerItem = {
      kind: 16,
      instanceId: 160,
      layer: 3,
      zoneId: null,
      groupID: 1,
      bindInstanceId: 70,
      occupiedPositions: [[5, 5]],
    };
    const arrows: ArrowItem[] = [];
    const wallMgr = new MovingWallManager([wall]);
    const shrinkMgr = new ShrinkPipeManager([], []);
    const mgr = new ToggleManager([toggle], [ctrl]);

    mgr.onArrowStepped(
      [[2, 5], [3, 5]],
      [[3, 5], [4, 5]],
      {
        arrows,
        corners: [],
        shrinkPipes: [],
        controllers: [ctrl],
        wallManager: wallMgr,
        shrinkPipeManager: shrinkMgr,
        isToggleCovered: () => false,
        isControllerCovered: () => false,
        wallHasController: () => true,
      },
    );

    expect(toggle.direction).toBe(2);
    expect(ctrl.occupiedPositions[0]).toEqual([5, 6]);
    expect(wallMgr.getWalls()[0]!.occupiedPositions).not.toEqual([
      [5, 5],
      [5, 6],
    ]);
    expect(mgr.getFlashGroupIds().has(1)).toBe(true);
  });

  it("toggles only once when multi-cell arrow steps through toggle", () => {
    const wall: MovingWallItem = {
      kind: 7,
      instanceId: 70,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[6, 5], [6, 6]],
      movingPath: [[6, 5], [6, 6], [6, 7]],
      movingDistance: 1,
      movingType: 1,
    };
    const toggle: ToggleItem = {
      kind: 15,
      instanceId: 150,
      layer: 3,
      zoneId: null,
      groupID: 1,
      direction: 1,
      occupiedPositions: [[4, 5]],
    };
    const ctrl: ControllerItem = {
      kind: 16,
      instanceId: 160,
      layer: 3,
      zoneId: null,
      groupID: 1,
      bindInstanceId: 70,
      occupiedPositions: [[6, 5]],
    };
    const arrows: ArrowItem[] = [];
    const wallMgr = new MovingWallManager([wall]);
    const shrinkMgr = new ShrinkPipeManager([], []);
    const mgr = new ToggleManager([toggle], [ctrl]);
    const ctx = {
      arrows,
      corners: [],
      shrinkPipes: [],
      controllers: [ctrl],
      wallManager: wallMgr,
      shrinkPipeManager: shrinkMgr,
      isToggleCovered: () => false,
      isControllerCovered: () => false,
      wallHasController: () => true,
    };
    const beforeWall = wallMgr.getWalls()[0]!.occupiedPositions.map((p) => p.join(","));

    mgr.onArrowStepped(
      [
        [1, 5],
        [2, 5],
        [3, 5],
      ],
      [
        [2, 5],
        [3, 5],
        [4, 5],
      ],
      ctx,
    );
    expect(toggle.direction).toBe(2);
    const afterFirstWall = wallMgr.getWalls()[0]!.occupiedPositions.map((p) => p.join(","));
    expect(afterFirstWall).not.toEqual(beforeWall);

    mgr.onArrowStepped(
      [
        [2, 5],
        [3, 5],
        [4, 5],
      ],
      [
        [3, 5],
        [4, 5],
        [5, 5],
      ],
      ctx,
    );
    expect(toggle.direction).toBe(2);
    expect(wallMgr.getWalls()[0]!.occupiedPositions.map((p) => p.join(","))).toEqual(
      afterFirstWall,
    );
  });

  it("moves controller with bound flip arrow on toggle", () => {
    const flip: ArrowItem = {
      kind: 2,
      instanceId: 20,
      layer: 2,
      zoneId: null,
      direction: 3,
      direction1: 3,
      direction2: 1,
      colorId: 7,
      occupiedPositions: [
        [10, 10],
        [11, 10],
      ],
    };
    const toggle: ToggleItem = {
      kind: 15,
      instanceId: 150,
      layer: 3,
      zoneId: null,
      groupID: 1,
      direction: 1,
      occupiedPositions: [[8, 10]],
    };
    const ctrl: ControllerItem = {
      kind: 16,
      instanceId: 160,
      layer: 3,
      zoneId: null,
      groupID: 1,
      bindInstanceId: 20,
      occupiedPositions: [[10, 10]],
    };
    const arrows = [flip];
    const shrinkMgr = new ShrinkPipeManager([], []);
    const mgr = new ToggleManager([toggle], [ctrl]);

    mgr.onArrowStepped(
      [[6, 10], [7, 10]],
      [[7, 10], [8, 10]],
      {
        arrows,
        corners: [],
        shrinkPipes: [],
        controllers: [ctrl],
        wallManager: new MovingWallManager([]),
        shrinkPipeManager: shrinkMgr,
        isToggleCovered: () => false,
        isControllerCovered: () => false,
        wallHasController: () => false,
      },
    );

    expect(ctrl.occupiedPositions[0]).toEqual([11, 10]);
  });

  it("moves controller to shrink strip middle on toggle", () => {
    const strip = {
      kind: 14 as const,
      instanceId: 140,
      layer: 3,
      zoneId: null,
      bindCoordinate: [4, 5] as [number, number],
      bindPipeId: 100,
      shorten: 2,
      occupiedPositions: [
        [4, 5],
        [4, 6],
        [4, 7],
        [4, 8],
      ] as [number, number][],
    };
    const toggle: ToggleItem = {
      kind: 15,
      instanceId: 150,
      layer: 3,
      zoneId: null,
      groupID: 2,
      direction: 1,
      occupiedPositions: [[8, 10]],
    };
    const ctrl: ControllerItem = {
      kind: 16,
      instanceId: 161,
      layer: 3,
      zoneId: null,
      groupID: 2,
      bindInstanceId: 140,
      occupiedPositions: [[4, 7]],
    };
    const strips = [strip];
    const shrinkMgr = new ShrinkPipeManager(strips, []);
    const mgr = new ToggleManager([toggle], [ctrl]);

    mgr.onArrowStepped(
      [[6, 10], [7, 10]],
      [[7, 10], [8, 10]],
      {
        arrows: [],
        corners: [],
        shrinkPipes: strips,
        controllers: [ctrl],
        wallManager: new MovingWallManager([]),
        shrinkPipeManager: shrinkMgr,
        isToggleCovered: () => false,
        isControllerCovered: () => false,
        wallHasController: () => false,
      },
    );

    expect(shrinkMgr.getStrips()[0]!.occupiedPositions).toEqual([
      [4, 5],
      [4, 6],
    ]);
    expect(ctrl.occupiedPositions[0]).toEqual([4, 6]);
  });
});
