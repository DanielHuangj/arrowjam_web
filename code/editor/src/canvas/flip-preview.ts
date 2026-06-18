import type { ArrowItem } from "@arrowjaw/shared";
import { DIR_NAME } from "@arrowjaw/shared";
import { STEP, CELL } from "@arrowjaw/client/render/colors.ts";

const GAME_DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -11], [8.5, 5], [-8.5, 5]],
  down: [[0, 11], [8.5, -5], [-8.5, -5]],
  left: [[-11, 0], [5, 8.5], [5, -8.5]],
  right: [[11, 0], [-5, 8.5], [-5, -8.5]],
};

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

function drawWedgeHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dirName: string,
  dashed: boolean,
): void {
  const pts = GAME_DIR_TRI[dirName];
  if (!pts) return;
  ctx.save();
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cx + pts[0]![0], cy + pts[0]![1]);
  ctx.lineTo(cx + pts[1]![0], cy + pts[1]![1]);
  ctx.lineTo(cx + pts[2]![0], cy + pts[2]![1]);
  ctx.closePath();
  ctx.fillStyle = dashed ? "rgba(173, 181, 189, 0.85)" : "rgba(252, 196, 25, 0.9)";
  ctx.fill();
  ctx.strokeStyle = dashed ? "#868e96" : "#fab005";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function drawFlipArrowPreview(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowItem,
): void {
  const positions = arrow.occupiedPositions;
  if (positions.length < 2) return;

  const head = positions.at(-1)!;
  const [hcx, hcy] = cellCenter(head[0], head[1]);
  const d1 = arrow.kind === 2 ? arrow.direction1 : arrow.direction;
  drawWedgeHead(ctx, hcx, hcy, DIR_NAME[d1], false);

  if (arrow.kind === 2) {
    const tail = positions[0]!;
    const [tcx, tcy] = cellCenter(tail[0], tail[1]);
    drawWedgeHead(ctx, tcx, tcy, DIR_NAME[arrow.direction2], true);
  }
}

export function drawFlipPolylinePreview(
  ctx: CanvasRenderingContext2D,
  polyline: [number, number][],
  direction1: number,
  direction2: number,
): void {
  if (polyline.length < 2) return;
  const head = polyline.at(-1)!;
  const [hcx, hcy] = cellCenter(head[0], head[1]);
  drawWedgeHead(ctx, hcx, hcy, DIR_NAME[direction1 as 1], false);
  const tail = polyline[0]!;
  const [tcx, tcy] = cellCenter(tail[0], tail[1]);
  drawWedgeHead(ctx, tcx, tcy, DIR_NAME[direction2 as 1], true);
}
