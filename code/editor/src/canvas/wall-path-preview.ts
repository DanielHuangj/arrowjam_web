import type { RawItem, Vec2 } from "@arrowjaw/shared";
import { STEP, CELL } from "@arrowjaw/client/render/colors.ts";

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

export function drawWallPathPreview(
  ctx: CanvasRenderingContext2D,
  path: Vec2[],
  movingType: 1 | 2,
): void {
  if (path.length < 2) return;
  const color = movingType === 2 ? "#51cf66" : "#ff922b";

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(movingType === 2 ? [6, 4] : []);
  ctx.beginPath();
  const [x0, y0] = cellCenter(path[0]![0], path[0]![1]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < path.length; i++) {
    const [x, y] = cellCenter(path[i]![0], path[i]![1]);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < path.length; i++) {
    const [cx, cy] = cellCenter(path[i]![0], path[i]![1]);
    ctx.fillStyle = i === 0 ? color : "rgba(255,255,255,0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (i < path.length - 1) {
      const [nx, ny] = cellCenter(path[i + 1]![0], path[i + 1]![1]);
      const angle = Math.atan2(ny - cy, nx - cx);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx - Math.cos(angle - 0.4) * 8, ny - Math.sin(angle - 0.4) * 8);
      ctx.lineTo(nx - Math.cos(angle + 0.4) * 8, ny - Math.sin(angle + 0.4) * 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (movingType === 2 && path.length >= 2) {
    const first = path[0]!;
    const last = path.at(-1)!;
    const [fx, fy] = cellCenter(first[0], first[1]);
    const [lx, ly] = cellCenter(last[0], last[1]);
    ctx.strokeStyle = "rgba(81, 207, 102, 0.5)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export function getWallPathFromItem(item: RawItem): Vec2[] {
  return (item.movingPath as Vec2[] | undefined) ?? [];
}

export function appendWallPathPoint(path: Vec2[], cell: Vec2): Vec2[] {
  if (path.length === 0) return [cell];
  const last = path.at(-1)!;
  if (last[0] === cell[0] && last[1] === cell[1]) return path;
  const dx = Math.abs(cell[0] - last[0]);
  const dy = Math.abs(cell[1] - last[1]);
  if (dx + dy !== 1) return path;
  return [...path, cell];
}

/** 从路径末端沿曼哈顿路径延伸到 target（用于按住拖拽连续画格） */
export function extendWallPathToCell(path: Vec2[], target: Vec2): Vec2[] {
  if (path.length === 0) return [target];
  let result = path;
  let last = result.at(-1)!;
  if (last[0] === target[0] && last[1] === target[1]) return result;

  while (last[0] !== target[0] || last[1] !== target[1]) {
    let nx = last[0];
    let ny = last[1];
    if (nx !== target[0]) nx += Math.sign(target[0] - nx);
    else ny += Math.sign(target[1] - ny);
    const next: Vec2 = [nx, ny];
    const extended = appendWallPathPoint(result, next);
    if (extended.length === result.length) break;
    result = extended;
    last = next;
  }
  return result;
}
