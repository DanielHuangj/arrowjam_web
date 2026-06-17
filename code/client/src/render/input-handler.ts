import type { GameState } from "../core/game/game-state.ts";
import type { BoardRenderer } from "./board-renderer.ts";

export class InputHandler {
  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => GameState | null,
    private renderer: BoardRenderer,
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

    const cell = this.renderer.canvasToCell(
      state.level,
      e.clientX,
      e.clientY,
    );
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
    const state = this.getState();
    if (!state) return;

    state.recoverAnimationState();
    if (state.phase !== "playing") return;

    const cell = this.renderer.canvasToCell(
      state.level,
      e.clientX,
      e.clientY,
    );
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
