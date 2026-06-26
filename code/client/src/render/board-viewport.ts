import type { BoardSize } from "../core/types.ts";
import {
  applyViewportToCanvas,
  createViewport,
  resetViewport,
  shouldStartViewportPan,
  type ViewportState,
  zoomAt,
} from "./viewport.ts";

export interface BoardViewportHandle {
  getState: () => ViewportState;
  reset: (board: BoardSize) => void;
  /** 若刚完成拖拽平移，消费一次以避免误触点击 */
  consumePanClick: () => boolean;
  dispose: () => void;
}

export function attachBoardViewport(
  wrap: HTMLElement,
  canvas: HTMLCanvasElement,
): BoardViewportHandle {
  let vp = createViewport();
  let panStart: { x: number; y: number; ox: number; oy: number } | null = null;
  let panDragged = false;
  let suppressClick = false;

  const apply = () => applyViewportToCanvas(canvas, vp);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    vp = zoomAt(vp, e.deltaY, e.clientX, e.clientY, wrap);
    apply();
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!shouldStartViewportPan(e, vp)) return;
    e.preventDefault();
    e.stopPropagation();
    panDragged = false;
    panStart = { x: e.clientX, y: e.clientY, ox: vp.offsetX, oy: vp.offsetY };
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!panStart) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      panDragged = true;
    }
    vp = {
      ...vp,
      offsetX: panStart.ox + dx,
      offsetY: panStart.oy + dy,
    };
    apply();
  };

  const onMouseUp = () => {
    if (panStart && panDragged) {
      suppressClick = true;
    }
    panStart = null;
    panDragged = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      vp = { ...vp, spaceHeld: true };
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      vp = { ...vp, spaceHeld: false };
    }
  };

  const onBlur = () => {
    vp = { ...vp, spaceHeld: false };
    panStart = null;
  };

  wrap.addEventListener("wheel", onWheel, { passive: false });
  wrap.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    getState: () => vp,
    reset: (board: BoardSize) => {
      vp = resetViewport(wrap, board);
      apply();
    },
    consumePanClick: () => {
      if (!suppressClick) return false;
      suppressClick = false;
      return true;
    },
    dispose: () => {
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.style.transform = "";
    },
  };
}
