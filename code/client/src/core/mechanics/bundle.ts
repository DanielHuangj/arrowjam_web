import type {
  ArrowItem,
  BoardSize,
  BundleGroup,
  BundleItem,
  CornerItem,
  Direction,
  PipeItem,
  PipeTransitState,
  Vec2,
} from "../types.ts";
import { vecKey } from "../types.ts";
import { advanceArrowStep } from "./pipe.ts";

function positionsFullyOffBoard(positions: Vec2[], board: BoardSize): boolean {
  return positions.every(
    ([x, y]) => x < 0 || x >= board.width || y < 0 || y >= board.height,
  );
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y]);
}

export interface StripAnchor {
  arrowId: number;
  segmentIndex: number;
}

function sameZoneContext(
  a: { zoneId: number | null },
  b: { zoneId: number | null },
): boolean {
  return a.zoneId === b.zoneId;
}

export function buildStripAnchors(
  strip: BundleItem,
  arrows: ArrowItem[],
): StripAnchor[] {
  const anchors: StripAnchor[] = [];
  for (const cell of strip.occupiedPositions) {
    for (const arrow of arrows) {
      if (!sameZoneContext(strip, arrow)) continue;
      const idx = arrow.occupiedPositions.findIndex(
        (p) => p[0] === cell[0] && p[1] === cell[1],
      );
      if (idx !== -1) {
        anchors.push({ arrowId: arrow.instanceId, segmentIndex: idx });
        break;
      }
    }
  }
  return anchors;
}

export function syncStripPositions(
  strip: BundleItem,
  anchors: StripAnchor[],
  arrows: ArrowItem[],
): void {
  const next: Vec2[] = [];
  for (const anchor of anchors) {
    const arrow = arrows.find((a) => a.instanceId === anchor.arrowId);
    if (!arrow) continue;
    const { segmentIndex } = anchor;
    if (segmentIndex < 0 || segmentIndex >= arrow.occupiedPositions.length) {
      continue;
    }
    const p = arrow.occupiedPositions[segmentIndex]!;
    next.push([p[0], p[1]]);
  }
  strip.occupiedPositions = next;
}

export function stepStripAnchors(anchors: StripAnchor[]): void {
  for (const anchor of anchors) {
    anchor.segmentIndex -= 1;
  }
}

export function cloneStripAnchors(anchors: StripAnchor[]): StripAnchor[] {
  return anchors.map((a) => ({ ...a }));
}

function stripTouchesArrow(strip: BundleItem, arrow: ArrowItem): boolean {
  const cells = new Set(strip.occupiedPositions.map((p) => vecKey(p)));
  return arrow.occupiedPositions.some((p) => cells.has(vecKey(p)));
}

class UnionFind {
  private parent = new Map<number, number>();

  add(x: number): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: number): number {
    let p = this.parent.get(x)!;
    while (p !== this.parent.get(p)) {
      p = this.parent.get(p)!;
      this.parent.set(x, p);
    }
    return p;
  }

  union(a: number, b: number): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function buildBundleGroups(
  bundles: BundleItem[],
  arrows: ArrowItem[],
): BundleGroup[] {
  if (bundles.length === 0) return [];

  const uf = new UnionFind();
  const stripToArrows = new Map<number, number[]>();

  for (const strip of bundles) {
    uf.add(strip.instanceId);
    const arrowIds: number[] = [];
    for (const arrow of arrows) {
      if (!sameZoneContext(strip, arrow)) continue;
      if (stripTouchesArrow(strip, arrow)) {
        arrowIds.push(arrow.instanceId);
        uf.add(arrow.instanceId);
        uf.union(strip.instanceId, arrow.instanceId);
      }
    }
    stripToArrows.set(strip.instanceId, arrowIds);
  }

  const grouped = new Map<
    number,
    { stripIds: Set<number>; arrowIds: Set<number> }
  >();

  for (const strip of bundles) {
    const root = uf.find(strip.instanceId);
    let bucket = grouped.get(root);
    if (!bucket) {
      bucket = { stripIds: new Set(), arrowIds: new Set() };
      grouped.set(root, bucket);
    }
    bucket.stripIds.add(strip.instanceId);
    for (const id of stripToArrows.get(strip.instanceId) ?? []) {
      bucket.arrowIds.add(id);
    }
  }

  let nextId = 1;
  const groups: BundleGroup[] = [];
  for (const bucket of grouped.values()) {
    if (bucket.arrowIds.size === 0) continue;
    groups.push({
      id: nextId++,
      stripIds: [...bucket.stripIds].sort((a, b) => a - b),
      arrowIds: [...bucket.arrowIds].sort((a, b) => a - b),
    });
  }
  return groups;
}

export function hasConsistentDirections(arrows: ArrowItem[]): boolean {
  if (arrows.length === 0) return false;
  const dir = arrows[0]!.direction;
  return arrows.every((a) => a.direction === dir);
}

function activePipes(pipes: PipeItem[]): PipeItem[] {
  return pipes.filter((p) => p.health > 0);
}

export function simulateCanExitBundle(
  memberIds: number[],
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[] = [],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  const members = memberIds
    .map((id) => allArrows.find((a) => a.instanceId === id))
    .filter((a): a is ArrowItem => a != null);
  if (members.length !== memberIds.length) return false;
  if (!hasConsistentDirections(members)) return false;

  const memberSet = new Set(memberIds);
  const positions = new Map<number, Vec2[]>();
  const dirs = new Map<number, Direction>();
  for (const arrow of members) {
    positions.set(
      arrow.instanceId,
      clonePositions(arrow.occupiedPositions),
    );
    dirs.set(arrow.instanceId, arrow.direction);
  }

  const simPipes = pipes.map((p) => ({
    ...p,
    occupiedPositions: p.occupiedPositions.map(([x, y]) => [x, y] as Vec2),
    passes: p.passes.map((pass) => ({
      position: [pass.position[0], pass.position[1]] as Vec2,
      directions: pass.directions.map(([x, y]) => [x, y] as Vec2),
    })),
    health: p.health,
  }));

  const transitById = new Map<number, PipeTransitState | null>(
    memberIds.map((id) => [id, null]),
  );

  const maxLen = Math.max(...members.map((a) => a.occupiedPositions.length), 1);
  const maxSteps = (board.width + board.height) * maxLen * 8;

  for (let step = 0; step < maxSteps; step++) {
    for (const id of memberIds) {
      const member = members.find((a) => a.instanceId === id)!;
      const fakeArrow: ArrowItem = {
        ...member,
        occupiedPositions: positions.get(id)!,
        direction: dirs.get(id)!,
      };
      const result = advanceArrowStep(
        fakeArrow,
        dirs.get(id)!,
        transitById.get(id) ?? null,
        corners,
        activePipes(simPipes),
        curtainCells,
        extraBlockerCells,
      );

      if (result.blocked) return false;

      positions.set(id, result.arrow.occupiedPositions);
      dirs.set(id, result.dir);
      transitById.set(id, result.transit);

      if (!result.transit) {
        const head = result.arrow.occupiedPositions.at(-1)!;
        if (
          head[0] >= 0 &&
          head[0] < board.width &&
          head[1] >= 0 &&
          head[1] < board.height
        ) {
          if (extraBlockerCells.has(vecKey(head))) return false;
          for (const other of allArrows) {
            if (memberSet.has(other.instanceId)) continue;
            for (const p of other.occupiedPositions) {
              if (p[0] === head[0] && p[1] === head[1]) return false;
            }
          }
        }
      }
    }

    if (
      memberIds.every((id) =>
        positionsFullyOffBoard(positions.get(id)!, board),
      )
    ) {
      return true;
    }
  }
  return false;
}

export class BundleManager {
  private groups: BundleGroup[];
  private arrowToGroup = new Map<number, BundleGroup>();
  private initialAnchors = new Map<number, StripAnchor[]>();
  private liveAnchors = new Map<number, StripAnchor[]>();
  private initialStripPositions = new Map<number, Vec2[]>();

  constructor(bundles: BundleItem[], arrows: ArrowItem[]) {
    for (const strip of bundles) {
      const anchors = buildStripAnchors(strip, arrows);
      this.initialAnchors.set(strip.instanceId, cloneStripAnchors(anchors));
      this.liveAnchors.set(strip.instanceId, cloneStripAnchors(anchors));
      this.initialStripPositions.set(
        strip.instanceId,
        strip.occupiedPositions.map(([x, y]) => [x, y]),
      );
    }
    this.groups = buildBundleGroups(bundles, arrows);
    for (const group of this.groups) {
      for (const id of group.arrowIds) {
        this.arrowToGroup.set(id, group);
      }
    }
  }

  getGroups(): BundleGroup[] {
    return this.groups;
  }

  getGroupForArrow(arrowId: number): BundleGroup | null {
    return this.arrowToGroup.get(arrowId) ?? null;
  }

  getMemberIds(arrowId: number): number[] {
    return this.getGroupForArrow(arrowId)?.arrowIds ?? [arrowId];
  }

  getStripIds(arrowId: number): number[] {
    return this.getGroupForArrow(arrowId)?.stripIds ?? [];
  }

  /** 动画步进后：条带锚点随蛇身移动 */
  syncGroupStrips(
    stripIds: number[],
    bundles: BundleItem[],
    arrows: ArrowItem[],
    stepped: boolean,
  ): void {
    for (const stripId of stripIds) {
      const anchors = this.liveAnchors.get(stripId);
      const strip = bundles.find((b) => b.instanceId === stripId);
      if (!anchors || !strip) continue;
      if (stepped) stepStripAnchors(anchors);
      syncStripPositions(strip, anchors, arrows);
    }
  }

  resetGroupStrips(stripIds: number[], bundles: BundleItem[]): void {
    for (const stripId of stripIds) {
      const initial = this.initialAnchors.get(stripId);
      const positions = this.initialStripPositions.get(stripId);
      const strip = bundles.find((b) => b.instanceId === stripId);
      if (!initial || !positions || !strip) continue;
      this.liveAnchors.set(stripId, cloneStripAnchors(initial));
      strip.occupiedPositions = positions.map(([x, y]) => [x, y]);
    }
  }

  snapshotStripPositions(
    stripIds: number[],
    bundles: BundleItem[],
  ): Record<number, Vec2[]> {
    const out: Record<number, Vec2[]> = {};
    for (const stripId of stripIds) {
      const strip = bundles.find((b) => b.instanceId === stripId);
      if (strip) {
        out[stripId] = strip.occupiedPositions.map(([x, y]) => [x, y]);
      }
    }
    return out;
  }

  restoreStripPositions(
    positionsById: Record<number, Vec2[]>,
    bundles: BundleItem[],
  ): void {
    for (const [idStr, positions] of Object.entries(positionsById)) {
      const strip = bundles.find((b) => b.instanceId === Number(idStr));
      if (strip) strip.occupiedPositions = positions.map(([x, y]) => [x, y]);
    }
  }

  removeGroup(group: BundleGroup): void {
    this.groups = this.groups.filter((g) => g.id !== group.id);
    for (const id of group.arrowIds) {
      this.arrowToGroup.delete(id);
    }
    for (const stripId of group.stripIds) {
      this.initialAnchors.delete(stripId);
      this.liveAnchors.delete(stripId);
      this.initialStripPositions.delete(stripId);
    }
  }

  canLaunchGroup(
    group: BundleGroup,
    activeArrows: ArrowItem[],
    corners: CornerItem[],
    board: BoardSize,
    pipes: PipeItem[] = [],
    curtainCells: Set<string> = new Set(),
    extraBlockerCells: Set<string> = new Set(),
  ): boolean {
    const members = group.arrowIds
      .map((id) => activeArrows.find((a) => a.instanceId === id))
      .filter((a): a is ArrowItem => a != null);
    if (members.length !== group.arrowIds.length) return false;
    return simulateCanExitBundle(
      group.arrowIds,
      activeArrows,
      corners,
      board,
      pipes,
      curtainCells,
      extraBlockerCells,
    );
  }
}
