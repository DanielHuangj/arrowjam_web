import type { EditorDocument, GameLevel, Vec2 } from "@arrowjaw/shared";
import { parseLevelData, parseLevelIdFromFilename } from "@arrowjaw/shared";
import { BoardRenderer } from "@arrowjaw/client/render/board-renderer.ts";
import { STEP, CELL } from "@arrowjaw/client/render/colors.ts";
import type { CurtainItem } from "@arrowjaw/shared";
import { drawCornerRefractionPreview } from "./corner-preview.ts";

export interface CornerPreview {
  cell: Vec2;
  d1: Vec2;
  d2: Vec2;
}

function zoneItemsVisible<T extends { zoneId: number | null }>(
  items: T[],
  activeZone: number | null,
): T[] {
  if (activeZone == null) return [];
  return items.filter((i) => i.zoneId === activeZone);
}

function editorVisibleLayers(doc: EditorDocument, level: GameLevel) {
  const activeZone = doc.editContext.zoneInstanceId;
  const inZoneEdit = activeZone != null;

  return {
    zones: inZoneEdit
      ? level.zones.filter((z) => z.instanceId === activeZone)
      : level.zones,
    zoneArrows: zoneItemsVisible(level.arrows, activeZone),
    zoneCorners: zoneItemsVisible(level.corners, activeZone),
    zoneBundles: zoneItemsVisible(level.bundles, activeZone),
    zonePipes: zoneItemsVisible(level.pipes, activeZone),
    topArrows: inZoneEdit ? [] : level.arrows.filter((a) => a.zoneId == null),
    topCorners: inZoneEdit ? [] : level.corners.filter((c) => c.zoneId == null),
    topBundles: inZoneEdit ? [] : level.bundles.filter((b) => b.zoneId == null),
    topPipes: inZoneEdit ? [] : level.pipes.filter((p) => p.zoneId == null),
    keys: inZoneEdit ? [] : level.keys,
    curtains: inZoneEdit ? [] : level.curtains.map(curtainWithBounds),
  };
}

export function documentToGameLevel(doc: EditorDocument): GameLevel {
  const id = parseLevelIdFromFilename(doc.source.name);
  return parseLevelData(id, {
    width: doc.meta.width,
    height: doc.meta.height,
    name: doc.meta.name,
    durationInSec: doc.meta.durationInSec,
    difficulty: doc.meta.difficulty,
    levelKind: doc.meta.levelKind,
    itemModels: doc.itemModels,
  });
}

export function curtainWithBounds(c: CurtainItem) {
  const xs = c.occupiedPositions.map((p) => p[0]);
  const ys = c.occupiedPositions.map((p) => p[1]);
  return {
    ...c,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

export class EditorBoardView {
  private renderer: BoardRenderer;
  private overlayCtx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private overlay: HTMLCanvasElement,
  ) {
    this.renderer = new BoardRenderer(canvas);
    const ctx = overlay.getContext("2d");
    if (!ctx) throw new Error("Overlay 2D not supported");
    this.overlayCtx = ctx;
  }

  draw(
    doc: EditorDocument,
    hoverCell: Vec2 | null,
    selectedIds: Set<number>,
    draftCells: Vec2[] = [],
    marquee: { x0: number; y0: number; x1: number; y1: number } | null = null,
    cornerHover: CornerPreview | null = null,
  ): void {
    const level = documentToGameLevel(doc);
    const launchable = new Set<number>();
    const layers = editorVisibleLayers(doc, level);

    this.renderer.drawBoard(
      { width: level.width, height: level.height },
      launchable,
      layers.zones,
      layers.zoneArrows,
      layers.zoneCorners,
      layers.zoneBundles,
      layers.zonePipes,
      layers.topArrows,
      layers.topCorners,
      layers.topBundles,
      layers.topPipes,
      layers.keys,
      layers.curtains,
    );

    this.syncOverlay(level.width, level.height);
    this.drawOverlay(
      level.width,
      level.height,
      hoverCell,
      selectedIds,
      draftCells,
      layers,
      marquee,
      cornerHover,
    );
  }

  private syncOverlay(width: number, height: number): void {
    this.overlay.width = this.canvas.width;
    this.overlay.height = this.canvas.height;
    this.overlay.style.width = this.canvas.style.width;
    this.overlay.style.height = this.canvas.style.height;
    this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    this.overlayCtx.scale(dpr, dpr);
    this.overlayCtx.clearRect(0, 0, width * STEP, height * STEP);
  }

  private drawOverlay(
    width: number,
    height: number,
    hoverCell: Vec2 | null,
    selectedIds: Set<number>,
    draftCells: Vec2[],
    layers: ReturnType<typeof editorVisibleLayers>,
    marquee: { x0: number; y0: number; x1: number; y1: number } | null,
    cornerHover: CornerPreview | null,
  ): void {
    const ctx = this.overlayCtx;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(1 / dpr, 1 / dpr);
    ctx.scale(dpr, dpr);

    // Rulers
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px sans-serif";
    for (let x = 0; x < width; x++) {
      ctx.fillText(String(x), x * STEP + 4, 10);
    }
    for (let y = 0; y < height; y++) {
      ctx.fillText(String(y), 4, y * STEP + 14);
    }

    if (hoverCell) {
      const [x, y] = hoverCell;
      ctx.strokeStyle = "rgba(77, 171, 247, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x * STEP + 1, y * STEP + 1, CELL, CELL);
    }

    for (const cell of draftCells) {
      const [x, y] = cell;
      ctx.fillStyle = "rgba(77, 171, 247, 0.25)";
      ctx.fillRect(x * STEP, y * STEP, CELL, CELL);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#4dabf7";
      ctx.strokeRect(x * STEP + 1, y * STEP + 1, CELL - 2, CELL - 2);
      ctx.setLineDash([]);
    }

    if (marquee) {
      const minX = Math.min(marquee.x0, marquee.x1);
      const maxX = Math.max(marquee.x0, marquee.x1);
      const minY = Math.min(marquee.y0, marquee.y1);
      const maxY = Math.max(marquee.y0, marquee.y1);
      const px = minX * STEP;
      const py = minY * STEP;
      const pw = (maxX - minX + 1) * STEP - (STEP - CELL);
      const ph = (maxY - minY + 1) * STEP - (STEP - CELL);
      ctx.fillStyle = "rgba(252, 196, 25, 0.15)";
      ctx.fillRect(px, py, pw, ph);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#fcc419";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
      ctx.setLineDash([]);
    }

    const visibleCorners = [...layers.zoneCorners, ...layers.topCorners];
    for (const corner of visibleCorners) {
      if (!selectedIds.has(corner.instanceId)) continue;
      const cell = corner.occupiedPositions[0];
      if (!cell) continue;
      drawCornerRefractionPreview(ctx, cell, corner.direction1, corner.direction2);
    }

    if (cornerHover) {
      drawCornerRefractionPreview(ctx, cornerHover.cell, cornerHover.d1, cornerHover.d2);
    }

    const allItems = [
      ...layers.zoneArrows,
      ...layers.topArrows,
      ...visibleCorners,
      ...layers.zoneBundles,
      ...layers.topBundles,
      ...layers.zonePipes,
      ...layers.topPipes,
      ...layers.curtains,
      ...layers.keys,
      ...layers.zones,
    ];
    for (const item of allItems) {
      if (!selectedIds.has(item.instanceId)) continue;
      for (const [x, y] of item.occupiedPositions) {
        ctx.strokeStyle = "#fcc419";
        ctx.lineWidth = 3;
        ctx.strokeRect(x * STEP + 1, y * STEP + 1, CELL - 2, CELL - 2);
      }
    }

    ctx.restore();
  }
}
