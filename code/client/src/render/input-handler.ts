import type { GameState } from "../core/game/game-state.ts";
import { pointerToCell, type ViewportState } from "./viewport.ts";

export class InputHandler {
  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => GameState | null,
    private getViewport: () => ViewportState,
    private consumePanClick: () => boolean = () => false,
    private isTargetVanishMode: () => boolean = () => false,
    private onTargetVanishHover?: (invalid: boolean) => void,
  ) {
    this.canvas.addEventListener("click", this.onClick);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseleave", this.onMouseLeave);
  }

  dispose(): void {
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
    this.onTargetVanishHover?.(false);
  }

  private cellAt(clientX: number, clientY: number): [number, number] | null {
    const state = this.getState();
    if (!state) return null;
    return pointerToCell(
      clientX,
      clientY,
      this.canvas,
      state.level,
      this.getViewport(),
    );
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isTargetVanishMode()) {
      this.onTargetVanishHover?.(false);
      return;
    }
    const state = this.getState();
    if (!state || state.phase !== "playing") {
      this.onTargetVanishHover?.(false);
      return;
    }

    const cell = this.cellAt(e.clientX, e.clientY);
    if (!cell) {
      this.onTargetVanishHover?.(false);
      return;
    }

    const hover = state.getTargetVanishHoverAtCell(cell);
    this.onTargetVanishHover?.(hover === "invalid");
  };

  private onMouseLeave = (): void => {
    this.onTargetVanishHover?.(false);
  };

  private onClick = (e: MouseEvent): void => {
    if (this.consumePanClick() || e.ctrlKey || e.metaKey) return;

    const state = this.getState();
    if (!state) return;

    state.recoverAnimationState();
    if (!state.canAcceptLaunchClick()) return;

    const cell = this.cellAt(e.clientX, e.clientY);
    if (!cell) return;

    if (this.isTargetVanishMode()) {
      state.tryTargetVanishAtCell(cell);
      return;
    }

    const arrow = state.findOperableArrowAtCell(cell);
    if (!arrow) return;

    state.tryLaunch(arrow.instanceId);
  };
}
