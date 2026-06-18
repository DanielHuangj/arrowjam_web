import type { Direction, MovingWallItem, Vec2 } from "../types.ts";
import { DIR_VEC, vecKey } from "../types.ts";

export function wouldStepIntoWall(
  head: Vec2,
  dir: Direction,
  wallCells: Set<string>,
): boolean {
  const [dx, dy] = DIR_VEC[dir];
  return wallCells.has(vecKey([head[0] + dx, head[1] + dy]));
}

export interface WallState {
  wall: MovingWallItem;
  pathIndex: number;
  direction: 1 | -1;
  segmentCount: number;
}

function stepAlongPath(
  pathIndex: number,
  direction: 1 | -1,
  steps: number,
  maxIndex: number,
): { pathIndex: number; direction: 1 | -1 } {
  let idx = pathIndex;
  let dir = direction;
  for (let i = 0; i < steps; i++) {
    const next = idx + dir;
    if (next < 0 || next > maxIndex) {
      dir = (dir * -1) as 1 | -1;
      idx = idx + dir;
    } else {
      idx = next;
    }
  }
  return { pathIndex: idx, direction: dir };
}

function resolveInitialPathIndex(wall: MovingWallItem): number {
  const anchor = wall.occupiedPositions[0];
  if (!anchor) return 0;
  const idx = wall.movingPath.findIndex(
    (p) => p[0] === anchor[0] && p[1] === anchor[1],
  );
  return idx >= 0 ? idx : 0;
}

function wallBodyFromPathIndex(
  wall: MovingWallItem,
  pathIndex: number,
  segmentCount: number,
): Vec2[] {
  const path = wall.movingPath;
  const pathLen = path.length;
  const positions: Vec2[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const idx =
      wall.movingType === 2 ? (pathIndex + i) % pathLen : pathIndex + i;
    const cell = path[idx];
    if (!cell) continue;
    positions.push([cell[0], cell[1]]);
  }
  return positions;
}

export class MovingWallManager {
  private states: WallState[];

  constructor(walls: MovingWallItem[]) {
    this.states = walls.map((wall) => {
      const segmentCount = wall.occupiedPositions.length;
      const pathIndex = resolveInitialPathIndex(wall);
      return {
        wall: {
          ...wall,
          occupiedPositions: wallBodyFromPathIndex(
            wall,
            pathIndex,
            segmentCount,
          ),
        },
        pathIndex,
        direction: 1 as const,
        segmentCount,
      };
    });
  }

  getWalls(): MovingWallItem[] {
    return this.states.map((s) => s.wall);
  }

  getBlockerCells(): Set<string> {
    const cells = new Set<string>();
    for (const s of this.states) {
      for (const p of s.wall.occupiedPositions) {
        cells.add(vecKey(p));
      }
    }
    return cells;
  }

  advanceAll(): void {
    for (const state of this.states) {
      const path = state.wall.movingPath;
      const pathLen = path.length;
      if (pathLen < 2) continue;

      if (state.wall.movingType === 2) {
        state.pathIndex =
          (state.pathIndex + state.wall.movingDistance) % pathLen;
      } else {
        const maxIndex = Math.max(0, pathLen - state.segmentCount);
        const stepped = stepAlongPath(
          state.pathIndex,
          state.direction,
          state.wall.movingDistance,
          maxIndex,
        );
        state.pathIndex = stepped.pathIndex;
        state.direction = stepped.direction;
      }

      state.wall = {
        ...state.wall,
        occupiedPositions: wallBodyFromPathIndex(
          state.wall,
          state.pathIndex,
          state.segmentCount,
        ),
      };
    }
  }
}
