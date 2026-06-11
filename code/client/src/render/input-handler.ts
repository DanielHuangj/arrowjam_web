import type { GameState } from "../core/game/game-state.ts";
import type { BoardRenderer } from "./board-renderer.ts";

export class InputHandler {
  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => GameState | null,
    private renderer: BoardRenderer,
  ) {
    this.canvas.addEventListener("click", this.onClick);
  }

  dispose(): void {
    this.canvas.removeEventListener("click", this.onClick);
  }

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

    const arrow = state.findOperableArrowAtCell(cell);
    if (!arrow) return;

    state.tryLaunch(arrow.instanceId);
  };
}
