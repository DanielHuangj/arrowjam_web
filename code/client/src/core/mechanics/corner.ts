import type { CornerItem, Direction, Vec2 } from "../types.ts";
import { DIR_VEC } from "../types.ts";

export function vecToDirection(v: Vec2): Direction | null {
  for (const d of [1, 2, 3, 4] as Direction[]) {
    const dv = DIR_VEC[d];
    if (dv[0] === v[0] && dv[1] === v[1]) return d;
  }
  return null;
}

/** Entry is valid when movement direction is opposite to an outgoing face. */
export function isValidCornerEntry(
  incident: Direction,
  corner: CornerItem,
): boolean {
  const inc = DIR_VEC[incident];
  const neg1: Vec2 = [-corner.direction1[0], -corner.direction1[1]];
  const neg2: Vec2 = [-corner.direction2[0], -corner.direction2[1]];
  return (
    (inc[0] === neg1[0] && inc[1] === neg1[1]) ||
    (inc[0] === neg2[0] && inc[1] === neg2[1])
  );
}

/** Pick outgoing direction perpendicular to incident (prefers direction1). */
export function getReflectedDirection(
  incident: Direction,
  corner: CornerItem,
): Direction {
  const inc = DIR_VEC[incident];
  for (const outVec of [corner.direction1, corner.direction2]) {
    const out = vecToDirection(outVec);
    if (!out) continue;
    const ov = DIR_VEC[out];
    if (ov[0] * inc[0] + ov[1] * inc[1] === 0) return out;
  }
  return vecToDirection(corner.direction1) ?? incident;
}

export function getCornerAt(
  pos: Vec2,
  corners: CornerItem[],
): CornerItem | null {
  for (const c of corners) {
    const p = c.occupiedPositions[0];
    if (p && p[0] === pos[0] && p[1] === pos[1]) return c;
  }
  return null;
}

function rotateVec(v: Vec2, steps: number): Vec2 {
  let [x, y] = v;
  for (let i = 0; i < steps; i++) {
    const nx = -y;
    const ny = x;
    x = nx === 0 ? 0 : nx;
    y = ny;
  }
  return [x, y];
}

/** 按 spin（90° 倍数）与 spinDirection 旋转反射角向量 */
export function rotateCorner(
  corner: CornerItem,
  spin: 0 | 90 | 180 | 270,
  spinDirection: 0 | 1,
): CornerItem {
  if (spin === 0) return corner;
  const steps = spin / 90;
  const rot = spinDirection === 0 ? steps : (4 - steps) % 4;
  return {
    ...corner,
    direction1: rotateVec(corner.direction1, rot),
    direction2: rotateVec(corner.direction2, rot),
  };
}
