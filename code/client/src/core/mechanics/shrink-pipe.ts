import type { PipeItem, ShrinkPipeItem, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y]);
}

/** 距 bindCoordinate 最远端作为裁切端 */
export function shortenStripPositions(
  strip: ShrinkPipeItem,
  amount: number,
): Vec2[] {
  const positions = strip.occupiedPositions;
  if (positions.length <= 1) return clonePositions(positions);

  const bind = strip.bindCoordinate;
  const first = positions[0]!;
  const last = positions.at(-1)!;
  const cutFromStart = manhattan(first, bind) >= manhattan(last, bind);
  const removeCount = Math.min(amount, positions.length - 1);
  if (removeCount <= 0) return clonePositions(positions);

  if (cutFromStart) {
    return clonePositions(positions.slice(removeCount));
  }
  return clonePositions(positions.slice(0, positions.length - removeCount));
}

export function canShortenStrip(
  strip: ShrinkPipeItem,
  _pipeHealth: number,
  _fromToggle = false,
): boolean {
  return strip.occupiedPositions.length > 1;
}

export class ShrinkPipeManager {
  constructor(
    private strips: ShrinkPipeItem[],
    private pipes: PipeItem[],
  ) {}

  getStrips(): ShrinkPipeItem[] {
    return this.strips;
  }

  /** 管道列表被 prune 替换后须同步，否则血量读取会过期 */
  setPipes(pipes: PipeItem[]): void {
    this.pipes = pipes;
  }

  private pipeCells(pipeId: number): Set<string> {
    const pipe = this.pipes.find((p) => p.instanceId === pipeId);
    if (!pipe) return new Set();
    return new Set(pipe.occupiedPositions.map(vecKey));
  }

  getBlockerCells(): Set<string> {
    const cells = new Set<string>();
    for (const strip of this.strips) {
      const pipeKeys = this.pipeCells(strip.bindPipeId);
      for (const p of strip.occupiedPositions) {
        const key = vecKey(p);
        if (!pipeKeys.has(key)) cells.add(key);
      }
    }
    return cells;
  }

  private pipeHealth(pipeId: number): number {
    return this.pipes.find((p) => p.instanceId === pipeId)?.health ?? 0;
  }

  shortenById(stripId: number, fromToggle = false): boolean {
    const idx = this.strips.findIndex((s) => s.instanceId === stripId);
    if (idx === -1) return false;
    const strip = this.strips[idx]!;
    const health = this.pipeHealth(strip.bindPipeId);
    if (!canShortenStrip(strip, health, fromToggle)) return false;
    const next = shortenStripPositions(strip, strip.shorten);
    this.strips[idx] = { ...strip, occupiedPositions: next };
    return true;
  }

  onPipeTraversed(pipeIds: number[]): void {
    for (const pipeId of pipeIds) {
      const health = this.pipeHealth(pipeId);
      if (health <= 0) continue;
      for (const strip of this.strips) {
        if (strip.bindPipeId !== pipeId) continue;
        if (canShortenStrip(strip, health, false)) {
          this.shortenById(strip.instanceId, false);
        }
      }
    }
  }

  /** 原地移除绑定已毁管道的障碍，保持与 GameState.shrinkPipes 同一数组引用 */
  removeForDeadPipes(livePipeIds: Set<number>): void {
    for (let i = this.strips.length - 1; i >= 0; i--) {
      if (!livePipeIds.has(this.strips[i]!.bindPipeId)) {
        this.strips.splice(i, 1);
      }
    }
  }

  shortenByToggle(stripId: number): boolean {
    return this.shortenById(stripId, true);
  }
}
