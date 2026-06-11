import type { CurtainItem } from "../core/types.ts";
import {
  CURTAIN_FILL,
  CURTAIN_HEALTH_COLOR,
  CURTAIN_STROKE,
} from "./colors.ts";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 斜纹纹理，整片幕布遮罩用 */
function createCurtainPattern(): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 12;
  tile.height = 12;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.strokeStyle = "rgba(255,255,255,0.07)";
  t.lineWidth = 2;
  t.beginPath();
  t.moveTo(0, 12);
  t.lineTo(12, 0);
  t.moveTo(-6, 6);
  t.lineTo(6, -6);
  t.moveTo(6, 18);
  t.lineTo(18, 6);
  t.stroke();
  return t.createPattern(tile, "repeat");
}

let curtainPattern: CanvasPattern | null | undefined;

function getCurtainPattern(): CanvasPattern | null {
  if (curtainPattern === undefined) {
    curtainPattern = createCurtainPattern();
  }
  return curtainPattern;
}

export function drawCurtainInBoard(
  ctx: CanvasRenderingContext2D,
  curtain: CurtainItem & {
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  },
  step: number,
): void {
  const { minX, minY, maxX, maxY } = curtain.bounds;
  const x = minX * step - 2;
  const y = minY * step - 2;
  const w = (maxX - minX + 1) * step + 4;
  const h = (maxY - minY + 1) * step + 4;
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();

  // 整片幕布：圆角矩形 + 渐变 + 斜纹
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();

  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, "rgba(134, 142, 150, 0.72)");
  grad.addColorStop(0.5, CURTAIN_FILL);
  grad.addColorStop(1, "rgba(73, 80, 87, 0.78)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  const pattern = getCurtainPattern();
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
  }

  ctx.restore();

  ctx.strokeStyle = CURTAIN_STROKE;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  // 所需钥匙数：大号黄色，带描边增强对比
  const label = String(curtain.health);
  const fontSize = Math.min(40, Math.max(26, Math.min(w, h) * 0.38));
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(26, 27, 38, 0.85)";
  ctx.lineWidth = Math.max(4, fontSize * 0.14);
  ctx.strokeText(label, cx, cy);
  ctx.fillStyle = CURTAIN_HEALTH_COLOR;
  ctx.fillText(label, cx, cy);
}
