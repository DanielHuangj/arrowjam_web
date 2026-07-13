import type { BoardSize, Vec2 } from "../core/types.ts";
import { boardPixelSize, gameBoardPixelSize } from "./board-renderer.ts";
import { STEP, CELL } from "./colors.ts";

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  panning: boolean;
  spaceHeld: boolean;
}

export function shouldStartViewportPan(e: MouseEvent, vp: ViewportState): boolean {
  if (e.button === 1) return true;
  if (e.button !== 0) return false;
  return vp.spaceHeld || e.ctrlKey;
}

export function createViewport(): ViewportState {
  return { scale: 1, offsetX: 0, offsetY: 0, panning: false, spaceHeld: false };
}

export function applyViewportToCanvas(
  canvas: HTMLCanvasElement,
  vp: ViewportState,
): void {
  canvas.style.transform = `translate(${vp.offsetX}px, ${vp.offsetY}px) scale(${vp.scale})`;
  canvas.style.transformOrigin = "0 0";
}

export function zoomAt(
  vp: ViewportState,
  delta: number,
  cx: number,
  cy: number,
  wrap: HTMLElement,
): ViewportState {
  const factor = delta > 0 ? 0.9 : 1.1;
  const newScale = Math.min(8, Math.max(0.1, vp.scale * factor));
  const rect = wrap.getBoundingClientRect();
  const mx = cx - rect.left - vp.offsetX;
  const my = cy - rect.top - vp.offsetY;
  const ratio = newScale / vp.scale;
  return {
    ...vp,
    scale: newScale,
    offsetX: cx - rect.left - mx * ratio,
    offsetY: cy - rect.top - my * ratio,
  };
}

/** 屏幕坐标 → 棋盘像素坐标（canvas 本地空间，未取整到格） */
export function pointerToBoardPx(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  vp: ViewportState,
  contentOffsetPx = 0,
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) / vp.scale - contentOffsetPx,
    (clientY - rect.top) / vp.scale - contentOffsetPx,
  ];
}

/** 屏幕坐标 → 棋盘格（考虑 canvas 的 translate + scale） */
export function pointerToCell(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  board: BoardSize,
  vp: ViewportState,
  contentOffsetPx = 0,
  playableCells?: Set<string>,
): Vec2 | null {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / vp.scale - contentOffsetPx;
  const y = (clientY - rect.top) / vp.scale - contentOffsetPx;
  const gx = Math.floor(x / STEP);
  const gy = Math.floor(y / STEP);
  if (gx < 0 || gy < 0 || gx >= board.width || gy >= board.height) return null;
  const lx = x - gx * STEP;
  const ly = y - gy * STEP;
  if (lx > CELL || ly > CELL) return null;
  const key = `${gx},${gy}`;
  if (playableCells && !playableCells.has(key)) return null;
  return [gx, gy];
}

/** 初始缩放：尽量完整显示棋盘，最大 100%，并在可视区域内居中 */
export function resetViewport(
  wrap: HTMLElement,
  board: BoardSize,
  gameBorderPad = false,
): ViewportState {
  const { width: bw, height: bh } = gameBorderPad
    ? gameBoardPixelSize(board)
    : boardPixelSize(board);
  const pad = 16;
  const scale = Math.min(
    1,
    (wrap.clientWidth - pad * 2) / bw,
    (wrap.clientHeight - pad * 2) / bh,
  );
  const s = Math.max(0.1, scale);
  const scaledW = bw * s;
  const scaledH = bh * s;
  return {
    scale: s,
    offsetX: (wrap.clientWidth - scaledW) / 2,
    offsetY: (wrap.clientHeight - scaledH) / 2,
    panning: false,
    spaceHeld: false,
  };
}
