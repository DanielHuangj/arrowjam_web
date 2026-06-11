import { CELL, KEY_COLOR, KEY_STROKE } from "./colors.ts";

export function drawKeyInCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  step: number,
): void {
  const cx = x * step + CELL / 2;
  const cy = y * step + CELL / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // 钥匙头圆环
  ctx.strokeStyle = KEY_STROKE;
  ctx.lineWidth = 2;
  ctx.fillStyle = KEY_COLOR;
  ctx.beginPath();
  ctx.arc(-3, -4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 钥匙柄
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 8);
  ctx.moveTo(0, 4);
  ctx.lineTo(4, 4);
  ctx.moveTo(0, 7);
  ctx.lineTo(3, 7);
  ctx.stroke();

  ctx.restore();
}
