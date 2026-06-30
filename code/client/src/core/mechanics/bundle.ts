import type {
  ArrowItem,
  BoardSize,
  BundleGroup,
  BundleItem,
  CornerItem,
  Direction,
  PipeItem,
  Vec2,
} from "../types.ts";
import { vecKey } from "../types.ts";
import { snakeStepArrow } from "../board/cell-map.ts";
import { getCornerAt } from "./corner.ts";
import {
  isHeadBlockedByPipe,
  tryStartPipeTransit,
} from "./pipe.ts";
import { wouldStepIntoWall } from "./moving-wall.ts";

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

function isHeadBlockedByOtherArrows(
  head: Vec2,
  board: BoardSize,
  memberSet: Set<number>,
  allArrows: ArrowItem[],
  extraBlockerCells: Set<string>,
): boolean {
  if (
    head[0] < 0 ||
    head[0] >= board.width ||
    head[1] < 0 ||
    head[1] >= board.height
  ) {
    return false;
  }
  if (extraBlockerCells.has(vecKey(head))) return true;
  for (const other of allArrows) {
    if (memberSet.has(other.instanceId)) continue;
    for (const p of other.occupiedPositions) {
      if (p[0] === head[0] && p[1] === head[1]) return true;
    }
  }
  return false;
}

/** 捆绑箭整体前进一步：共用方向、不可进管道/反射角，碰到则 blocked */
export function advanceBundleStep(
  memberIds: number[],
  members: ArrowItem[],
  getPositions: (id: number) => Vec2[],
  dir: Direction,
  board: BoardSize,
  corners: CornerItem[],
  pipes: PipeItem[],
  curtainCells: Set<string>,
  extraBlockerCells: Set<string>,
  allArrows: ArrowItem[],
  memberSet: Set<number>,
): { arrows: ArrowItem[]; blocked: boolean } {
  const stepped: ArrowItem[] = [];

  for (const id of memberIds) {
    const member = members.find((a) => a.instanceId === id)!;
    const current = getPositions(id);
    const arrow: ArrowItem = { ...member, occupiedPositions: current, direction: dir };
    const head = current.at(-1)!;

    if (extraBlockerCells.size > 0 && wouldStepIntoWall(head, dir, extraBlockerCells)) {
      return { arrows: stepped, blocked: true };
    }

    const next = snakeStepArrow(arrow, dir);
    const nextHead = next.occupiedPositions.at(-1)!;

    if (curtainCells.has(vecKey(nextHead))) {
      return { arrows: stepped, blocked: true };
    }

    const corner = getCornerAt(nextHead, corners);
    if (corner) {
      return { arrows: stepped, blocked: true };
    }

    if (isHeadBlockedByPipe(nextHead, dir, pipes)) {
      return { arrows: stepped, blocked: true };
    }

    if (tryStartPipeTransit(nextHead, dir, pipes)) {
      return { arrows: stepped, blocked: true };
    }

    if (
      isHeadBlockedByOtherArrows(
        nextHead,
        board,
        memberSet,
        allArrows,
        extraBlockerCells,
      )
    ) {
      return { arrows: stepped, blocked: true };
    }

    stepped.push(next);
  }

  return { arrows: stepped, blocked: false };
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
  const dir = members[0]!.direction;
  for (const arrow of members) {
    positions.set(arrow.instanceId, clonePositions(arrow.occupiedPositions));
  }

  const simPipes = activePipes(pipes);

  const maxLen = Math.max(...members.map((a) => a.occupiedPositions.length), 1);
  const maxSteps = (board.width + board.height) * maxLen * 8;

  for (let step = 0; step < maxSteps; step++) {
    const result = advanceBundleStep(
      memberIds,
      members,
      (id) => positions.get(id)!,
      dir,
      board,
      corners,
      simPipes,
      curtainCells,
      extraBlockerCells,
      allArrows,
      memberSet,
    );
    if (result.blocked) return false;

    for (const arrow of result.arrows) {
      positions.set(arrow.instanceId, clonePositions(arrow.occupiedPositions));
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

  /** 与 member 箭身锚定相连的所有条带 id（不依赖捆绑组） */
  getStripIdsForArrowIds(arrowIds: number[], bundles: BundleItem[]): number[] {
    const members = new Set(arrowIds);
    const result = new Set<number>();
    for (const strip of bundles) {
      const anchors = this.liveAnchors.get(strip.instanceId);
      if (!anchors) continue;
      if (anchors.some((a) => members.has(a.arrowId))) {
        result.add(strip.instanceId);
      }
    }
    return [...result].sort((a, b) => a - b);
  }

  /** 动画步进后：条带锚点随蛇身 segment 移动（不递减 segmentIndex，否则条带会留在原格子） */
  syncGroupStrips(
    stripIds: number[],
    bundles: BundleItem[],
    arrows: ArrowItem[],
    _stepped = true,
  ): void {
    for (const stripId of stripIds) {
      const anchors = this.liveAnchors.get(stripId);
      const strip = bundles.find((b) => b.instanceId === stripId);
      if (!anchors || !strip) continue;
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
    launchableArrows: ArrowItem[],
    corners: CornerItem[],
    board: BoardSize,
    pipes: PipeItem[] = [],
    curtainCells: Set<string> = new Set(),
    extraBlockerCells: Set<string> = new Set(),
    blockingArrows: ArrowItem[] = launchableArrows,
  ): boolean {
    const members = group.arrowIds
      .map((id) => launchableArrows.find((a) => a.instanceId === id))
      .filter((a): a is ArrowItem => a != null);
    if (members.length !== group.arrowIds.length) return false;
    return simulateCanExitBundle(
      group.arrowIds,
      blockingArrows,
      corners,
      board,
      pipes,
      curtainCells,
      extraBlockerCells,
    );
  }
}
