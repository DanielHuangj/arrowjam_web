import type { BoardSize, Vec2 } from "@arrowjaw/shared";
import { STEP, CELL } from "@arrowjaw/client/render/colors.ts";

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  panning: boolean;
  spaceHeld: boolean;
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

/** 屏幕坐标 → 棋盘格（考虑 canvas 的 translate + scale） */
export function pointerToCell(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  board: BoardSize,
  vp: ViewportState,
): Vec2 | null {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / vp.scale;
  const y = (clientY - rect.top) / vp.scale;
  const gx = Math.floor(x / STEP);
  const gy = Math.floor(y / STEP);
  if (gx < 0 || gy < 0 || gx >= board.width || gy >= board.height) return null;
  const lx = x - gx * STEP;
  const ly = y - gy * STEP;
  if (lx > CELL || ly > CELL) return null;
  return [gx, gy];
}

export function resetViewport(wrap: HTMLElement, board: BoardSize): ViewportState {
  const bw = board.width * STEP;
  const bh = board.height * STEP;
  const pad = 40;
  const scale = Math.min(
    1,
    (wrap.clientWidth - pad * 2) / bw,
    (wrap.clientHeight - pad * 2) / bh,
  );
  return {
    scale: Math.max(0.1, scale),
    offsetX: pad,
    offsetY: pad,
    panning: false,
    spaceHeld: false,
  };
}
