import { describe, expect, it } from "vitest";
import { boardPixelSize } from "./board-renderer.ts";
import { resetViewport, shouldStartViewportPan, zoomAt } from "./viewport.ts";

describe("viewport", () => {
  const vp = { scale: 1, offsetX: 0, offsetY: 0, panning: false, spaceHeld: false };

  it("starts pan on middle button or space+left", () => {
    expect(shouldStartViewportPan({ button: 1 } as MouseEvent, vp)).toBe(true);
    expect(
      shouldStartViewportPan({ button: 0, ctrlKey: false } as MouseEvent, {
        ...vp,
        spaceHeld: true,
      }),
    ).toBe(true);
    expect(shouldStartViewportPan({ button: 0, ctrlKey: true } as MouseEvent, vp)).toBe(true);
    expect(shouldStartViewportPan({ button: 0, ctrlKey: false } as MouseEvent, vp)).toBe(false);
  });

  it("zooms toward cursor", () => {
    const wrap = {
      getBoundingClientRect: () =>
        ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect,
    } as HTMLElement;
    const next = zoomAt(vp, -100, 400, 300, wrap);
    expect(next.scale).toBeGreaterThan(1);
  });

  it("centers board in wrap on reset", () => {
    const wrap = { clientWidth: 800, clientHeight: 600 } as HTMLElement;
    const board = { width: 10, height: 10 };
    const vp = resetViewport(wrap, board);
    const { width: bw, height: bh } = boardPixelSize(board);
    expect(vp.offsetX).toBeCloseTo((800 - bw * vp.scale) / 2);
    expect(vp.offsetY).toBeCloseTo((600 - bh * vp.scale) / 2);
  });
});
