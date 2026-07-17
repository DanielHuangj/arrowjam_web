import type { EditorDocument, GameLevel, RawItem, Vec2 } from "@arrowjaw/shared";
import { parseLevelData, parseLevelIdFromFilename, vecKey } from "@arrowjaw/shared";
import { drawBomb, drawBombExplosion, drawBuff, drawController, drawFrozenOverlay, drawMovingWall, drawShrinkPipe, drawToggle } from "@arrowjaw/client/render/mechanics-drawer.ts";
import { BoardRenderer } from "@arrowjaw/client/render/board-renderer.ts";
import { STEP, CELL, EDITOR_BLACK_HOLE_FILL, EDITOR_BLACK_HOLE_STROKE } from "@arrowjaw/client/render/colors.ts";
import { splitBlackHoleComponents } from "@arrowjaw/client/render/black-hole-region-drawer.ts";
import {
  fillRoundedRegionCells,
  strokeRoundedRegionOutline,
  REGION_OUTER_CORNER_RADIUS,
} from "@arrowjaw/client/render/region-outline.ts";
import type { CurtainItem } from "@arrowjaw/shared";
import { drawCornerRefractionPreview } from "./corner-preview.ts";
import { drawFlipArrowPreview, drawFlipPolylinePreview } from "./flip-preview.ts";
import { drawWallPathPreview } from "./wall-path-preview.ts";
import {
  loadRegionDraftCells,
  resolveBlackHoleCells,
  resolvePlayableCells,
} from "../document/board-region.ts";

export interface EditorBoardOverlayState {
  wallPathDraft?: Vec2[];
  wallPathEditId?: number | null;
  flipPolyline?: Vec2[];
  flipDirection1?: number;
  flipDirection2?: number;
  regionDraftCells?: Set<string>;
  regionEditMode?: null | "playable" | "blackHole" | "invalidColor";
  regionColorDraft?: Map<string, number>;
  regionColorSelection?: Set<string>;
  boldRulers?: boolean;
}

function computeInvalidCells(level: GameLevel): Set<string> | undefined {
  if (level.boardShape !== "custom") return undefined;
  const invalid = new Set<string>();
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const key = vecKey([x, y]);
      if (!level.playableCells.has(key)) invalid.add(key);
    }
  }
  return invalid;
}

export interface CornerPreview {
  cell: Vec2;
  d1: Vec2;
  d2: Vec2;
}

function zoneMechanicsVisible<T extends { zoneId: number | null }>(
  items: T[] | undefined,
  activeZone: number | null,
): T[] {
  const list = items ?? [];
  if (activeZone == null) {
    return list.filter((i) => i.zoneId == null);
  }
  return list.filter((i) => i.zoneId === activeZone);
}

function collectMechanicsDrawOptions(doc: EditorDocument, level: GameLevel) {
  const activeZone = doc.editContext.zoneInstanceId;
  const bombs = zoneMechanicsVisible(level.bombs, activeZone);
  const frozenOverlays = zoneMechanicsVisible(level.frozenOverlays, activeZone);
  return {
    movingWalls: activeZone == null ? level.movingWalls : [],
    frozenOverlays,
    bombStates: bombs.map((bomb) => ({ bomb, remaining: null as number | null })),
    shrinkPipes: zoneMechanicsVisible(level.shrinkPipes, activeZone),
    toggles: zoneMechanicsVisible(level.toggles, activeZone),
    controllers: zoneMechanicsVisible(level.controllers, activeZone),
    buffs: zoneMechanicsVisible(level.buffs, activeZone),
  };
}

function findRawItem(doc: EditorDocument, id: number): RawItem | null {
  function walk(items: RawItem[]): RawItem | null {
    for (const item of items) {
      if (item.instanceId === id) return item;
      if (item.items) {
        const found = walk(item.items);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(doc.itemModels);
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
  const m = doc.meta;
  return parseLevelData(
    id,
    {
      width: m.width,
      height: m.height,
      name: m.name,
      durationInSec: m.durationInSec,
      difficulty: m.difficulty,
      levelKind: m.levelKind,
      gameMode: m.gameMode,
      spawnIntervalSec: m.spawnIntervalSec,
      spawnPool: m.spawnPool,
      spawnWeightAdjust: m.spawnWeightAdjust,
      levelGoals: m.levelGoals,
      comboEnabled: m.comboEnabled,
      boardShape: m.boardShape,
      playableMask: m.playableMask,
      blackHoleRegions: m.blackHoleRegions,
      invalidCellColors: m.invalidCellColors,
      itemModels: doc.itemModels,
    },
    { allowIncompleteMovingWalls: true },
  );
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
  private backgroundImage: HTMLImageElement | null = null;
  private backgroundImageUrl: string | null = null;

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
    overlayState: EditorBoardOverlayState = {},
  ): void {
    const level = documentToGameLevel(doc);
    const launchable = new Set<number>();
    const layers = editorVisibleLayers(doc, level);
    const mechanics = collectMechanicsDrawOptions(doc, level);
    const regionMode = doc.editContext.regionEditMode;
    const editingRegion = regionMode != null;
    const playableCells = editingRegion
      ? regionMode === "playable"
        ? overlayState.regionDraftCells ?? loadRegionDraftCells(doc, "playable")
        : resolvePlayableCells(doc)
      : level.boardShape === "custom"
        ? level.playableCells
        : undefined;
    const blackHoleCells = editingRegion
      ? regionMode === "blackHole"
        ? overlayState.regionDraftCells ?? loadRegionDraftCells(doc, "blackHole")
        : resolveBlackHoleCells(doc)
      : level.blackHoleCells;
    const invalidCells =
      editingRegion && regionMode === "playable"
        ? (() => {
            const draft =
              overlayState.regionDraftCells ?? loadRegionDraftCells(doc, "playable");
            const invalid = new Set<string>();
            for (let y = 0; y < level.height; y++) {
              for (let x = 0; x < level.width; x++) {
                const key = vecKey([x, y]);
                if (!draft.has(key)) invalid.add(key);
              }
            }
            return invalid;
          })()
        : computeInvalidCells(level);
    const invalidCellColors =
      overlayState.regionEditMode === "invalidColor" && overlayState.regionColorDraft
        ? overlayState.regionColorDraft
        : level.invalidCellColors;
    const bgImage = this.resolveBackgroundImage(doc);

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
      {
        style: "editor",
        movingWalls: mechanics.movingWalls,
        frozenOverlays: mechanics.frozenOverlays,
        bombStates: mechanics.bombStates,
        shrinkPipes: mechanics.shrinkPipes,
        toggles: mechanics.toggles,
        controllers: mechanics.controllers,
        buffs: mechanics.buffs,
        playableCells,
        blackHoleCells,
        invalidCells,
        invalidCellColors,
        editorBackgroundImage: bgImage,
      },
    );

    this.syncOverlay(level.width, level.height);
    this.drawOverlay(
      doc,
      level,
      hoverCell,
      selectedIds,
      draftCells,
      layers,
      marquee,
      cornerHover,
      overlayState,
    );
  }

  private resolveBackgroundImage(doc: EditorDocument): HTMLImageElement | null {
    const bg = doc.editorOnly?.backgroundImage;
    if (!bg?.dataUrl) {
      this.backgroundImage = null;
      this.backgroundImageUrl = null;
      return null;
    }
    if (this.backgroundImageUrl === bg.dataUrl && this.backgroundImage) {
      return this.backgroundImage.complete ? this.backgroundImage : null;
    }
    const img = new Image();
    img.src = bg.dataUrl;
    this.backgroundImage = img;
    this.backgroundImageUrl = bg.dataUrl;
    return img.complete ? img : null;
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
    doc: EditorDocument,
    level: GameLevel,
    hoverCell: Vec2 | null,
    selectedIds: Set<number>,
    draftCells: Vec2[],
    layers: ReturnType<typeof editorVisibleLayers>,
    marquee: { x0: number; y0: number; x1: number; y1: number } | null,
    cornerHover: CornerPreview | null,
    overlayState: EditorBoardOverlayState,
  ): void {
    const ctx = this.overlayCtx;
    const width = level.width;
    const height = level.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(1 / dpr, 1 / dpr);
    ctx.scale(dpr, dpr);

    // Rulers
    const boldRulers = overlayState.boldRulers ?? false;
    ctx.fillStyle = boldRulers ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)";
    ctx.font = boldRulers ? "bold 11px sans-serif" : "10px sans-serif";
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

    if (overlayState.regionEditMode && overlayState.regionDraftCells) {
      if (overlayState.regionEditMode === "blackHole") {
        for (const region of splitBlackHoleComponents(overlayState.regionDraftCells)) {
          fillRoundedRegionCells(
            ctx,
            region,
            EDITOR_BLACK_HOLE_FILL,
            CELL,
            STEP,
            REGION_OUTER_CORNER_RADIUS,
          );
          strokeRoundedRegionOutline(
            ctx,
            region,
            EDITOR_BLACK_HOLE_STROKE,
            2,
            CELL,
            STEP,
            REGION_OUTER_CORNER_RADIUS,
          );
        }
      } else {
        const fill =
          overlayState.regionEditMode === "playable"
            ? "rgba(72, 187, 120, 0.45)"
            : "rgba(255, 255, 255, 0.75)";
        const stroke =
          overlayState.regionEditMode === "playable" ? "#40c057" : "#dee2e6";
        for (const key of overlayState.regionDraftCells) {
          const [xs, ys] = key.split(",");
          const x = Number(xs);
          const y = Number(ys);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          ctx.fillStyle = fill;
          ctx.fillRect(x * STEP, y * STEP, CELL, CELL);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;
          ctx.strokeRect(x * STEP + 1, y * STEP + 1, CELL - 2, CELL - 2);
        }
      }
    }

    if (overlayState.regionColorSelection && overlayState.regionColorSelection.size > 0) {
      for (const key of overlayState.regionColorSelection) {
        const [xs, ys] = key.split(",");
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.fillStyle = "rgba(252, 196, 25, 0.35)";
        ctx.fillRect(x * STEP, y * STEP, CELL, CELL);
        ctx.strokeStyle = "#fcc419";
        ctx.lineWidth = 2;
        ctx.strokeRect(x * STEP + 1, y * STEP + 1, CELL - 2, CELL - 2);
      }
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

    const allArrows = [...layers.zoneArrows, ...layers.topArrows];
    for (const arrow of allArrows) {
      if (arrow.kind === 2) drawFlipArrowPreview(ctx, arrow);
    }

    if (overlayState.flipPolyline && overlayState.flipPolyline.length >= 2) {
      drawFlipPolylinePreview(
        ctx,
        overlayState.flipPolyline,
        overlayState.flipDirection1 ?? 3,
        overlayState.flipDirection2 ?? 3,
      );
    }

    for (const wall of level.movingWalls) {
      if (!selectedIds.has(wall.instanceId) && overlayState.wallPathEditId !== wall.instanceId) {
        continue;
      }
      if (wall.movingPath.length >= 2) {
        drawWallPathPreview(ctx, wall.movingPath, wall.movingType);
      }
    }

    if (overlayState.wallPathDraft && overlayState.wallPathDraft.length >= 1) {
      const editItem =
        overlayState.wallPathEditId != null
          ? findRawItem(doc, overlayState.wallPathEditId)
          : null;
      const movingType = (editItem?.movingType as 1 | 2 | undefined) ?? 1;
      drawWallPathPreview(ctx, overlayState.wallPathDraft, movingType);
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

export { zoneMechanicsVisible, collectMechanicsDrawOptions };
