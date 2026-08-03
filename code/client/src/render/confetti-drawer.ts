import type { ConfettiState } from "../core/mechanics/win-celebration.ts";

/** 棋盘范围内撒花 */
export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  state: ConfettiState,
): void {
  const life = Math.max(0, 1 - state.elapsed / state.duration);
  for (const p of state.particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, life * 1.2);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
}
