import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
import { BOARD_MAX_SIZE, BOARD_MIN_SIZE, boardSizeRangeLabel, isBoardSizeValid } from "./board-limits.ts";
import {
  createDocumentFromJson,
  createEmptyDocument,
  findItemById,
  hasBlockingErrors,
  levelDataFromDocument,
  parseLevelIdFromFilename,
  rectPositions,
  serializeLevelData,
  validateLevelData,
} from "@arrowjaw/shared";
import { GameState } from "@arrowjaw/client/core/game/game-state.ts";
import { BoardRenderer } from "@arrowjaw/client/render/board-renderer.ts";
import { InputHandler } from "@arrowjaw/client/render/input-handler.ts";
import { EditorBoardView, documentToGameLevel } from "./canvas/editor-board.ts";
import {
  applyViewportToCanvas,
  createViewport,
  pointerToCell,
  resetViewport,
  zoomAt,
  shouldStartViewportPan,
  type ViewportState,
} from "./canvas/viewport.ts";
import {
  addItem,
  copyItems,
  enterZone,
  exitZone,
  findItemAtCell,
  pasteItems,
  removeItems,
  selectItem,
  selectItemsInRect,
  updateItem,
  updateMeta,
} from "./document/editor-ops.ts";
import { canPlaceInEditContext } from "./document/zone-bounds.ts";
import { createHistory, pushHistory, redo, undo } from "./document/history.ts";
import {
  exportDownload,
  openFileWithFSA,
  openFilesFromInput,
  openFilesWithFSA,
  saveAsWithFSA,
  saveToHandle,
  suggestExportName,
  supportsFSA,
} from "./io/file-service.ts";
import { renderPropsPanel } from "./ui/props-panel.ts";
import { showAiGenerateDialog } from "./ui/ai-generate-dialog.ts";
import {
  extendPolylineToCell,
  buildArrowItem,
  buildBombItem,
  buildBundleItem,
  buildCornerItem,
  buildCurtainItem,
  buildFlipArrowItem,
  buildFrozenItem,
  buildKeyItem,
  buildMovingWallItem,
  buildPipeItem,
  buildZoneItem,
  createDrawState,
  directionFromFirstSegment,
  directionFromLastSegment,
  headMatchesDirection,
  isValidPolyline,
  type DrawState,
  type EditorTool,
} from "./tools/draw-state.ts";
import { extendWallPathToCell } from "./canvas/wall-path-preview.ts";

const ZONE_EDIT_TOOLS = new Set<EditorTool>([
  "select",
  "arrow",
  "flipArrow",
  "corner",
  "bundle",
  "bomb",
  "frozen",
]);

interface TabState {
  id: string;
  doc: EditorDocument;
  history: ReturnType<typeof createHistory>;
  draw: DrawState;
  viewport: ViewportState;
}

let tabCounter = 0;

export class EditorApp {
  private tabs: TabState[] = [];
  private activeTabId: string | null = null;
  private clipboard: RawItem[] = [];
  private playMode = false;
  private autoPlayActive = false;
  private gameState: GameState | null = null;
  private playRenderer: BoardRenderer | null = null;
  private playInput: InputHandler | null = null;
  private hoverCell: Vec2 | null = null;
  private panStart: { x: number; y: number; ox: number; oy: number } | null = null;
  private dragId?: number;
  private dragOrigin?: Vec2;
  private dragPositions?: Vec2[];
  private marqueeStart: Vec2 | null = null;
  private marqueeEnd: Vec2 | null = null;
  private marqueeActive = false;
  private selectionAddMode = false;
  private polylineDragging = false;
  private wallPathDragging = false;
  private boardView: EditorBoardView;
  private rafId = 0;
  private statusHint: string | null = null;
  private statusHintTimer = 0;

  private els = {
    menu: document.getElementById("menu-bar")!,
    tools: document.getElementById("tool-sidebar")!,
    tabs: document.getElementById("tab-bar")!,
    breadcrumb: document.getElementById("breadcrumb")!,
    wrap: document.getElementById("canvas-wrap")!,
    canvas: document.getElementById("board-canvas") as HTMLCanvasElement,
    overlay: document.getElementById("overlay-canvas") as HTMLCanvasElement,
    tooltip: document.getElementById("hover-tooltip")!,
    props: document.getElementById("props-panel")!,
    status: document.getElementById("status-bar")!,
    fileInput: document.getElementById("file-input") as HTMLInputElement,
    playControls: document.getElementById("play-controls")!,
    modal: document.getElementById("modal-root")!,
  };

  constructor() {
    this.boardView = new EditorBoardView(this.els.canvas, this.els.overlay);
    this.buildMenu();
    this.buildTools();
    this.bindEvents();
    this.newTab(createEmptyDocument());
    if (!supportsFSA()) {
      this.toast("当前浏览器不支持 File System Access API，保存将使用下载方式");
    }
  }

  private activeTab(): TabState {
    return this.tabs.find((t) => t.id === this.activeTabId)!;
  }

  private newTab(doc: EditorDocument): void {
    const id = `tab-${++tabCounter}`;
    const tab: TabState = {
      id,
      doc,
      history: createHistory(),
      draw: createDrawState(),
      viewport: createViewport(),
    };
    this.tabs.push(tab);
    this.activeTabId = id;
    tab.viewport = resetViewport(this.els.wrap, doc.meta);
    this.refresh();
  }

  private commit(doc: EditorDocument): void {
    const tab = this.activeTab();
    tab.history = pushHistory(tab.history, tab.doc);
    tab.doc = doc;
    this.refresh();
  }

  private refresh(): void {
    this.ensureZoneEditTool(this.activeTab());
    this.renderTabs();
    this.renderBreadcrumb();
    this.renderCanvas();
    this.renderProps();
    this.renderStatus();
    this.updateToolButtons();
  }

  private buildMenu(): void {
    const items = [
      { label: "新建", action: () => this.showNewDialog() },
      { label: "打开", action: () => this.openFiles() },
      { label: "保存", action: () => this.save() },
      { label: "另存为", action: () => this.saveAs() },
      { label: "导出", action: () => this.exportFile() },
      { label: "AI 辅助生成", action: () => this.showAiGenerateDialog() },
      { label: "试玩", action: () => this.togglePlayMode() },
      { label: "撤销", action: () => this.doUndo() },
      { label: "重做", action: () => this.doRedo() },
    ];
    this.els.menu.innerHTML = "";
    for (const item of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.addEventListener("click", item.action);
      this.els.menu.appendChild(b);
    }
  }

  private buildTools(): void {
    const tools: { tool: EditorTool; label: string; title: string }[] = [
      { tool: "select", label: "选择", title: "选择/移动物件" },
      { tool: "arrow", label: "K1 折线箭", title: "折线箭 kind1" },
      { tool: "flipArrow", label: "K2 翻转箭", title: "翻转箭：消除 kind1/kind2 时切换方向" },
      { tool: "pipe", label: "K3 管道", title: "管道 kind3" },
      { tool: "corner", label: "K4 反射角", title: "反射角块 kind4" },
      { tool: "curtain", label: "K6 幕布", title: "幕布 kind6" },
      { tool: "key", label: "K11 钥匙箭", title: "钥匙箭 kind11" },
      { tool: "bomb", label: "K5 定时炸弹", title: "定时炸弹：先选中 kind1/2 箭再添加" },
      { tool: "frozen", label: "K13 冻结箭", title: "冻结箭：先选中 kind1/2 箭再添加" },
      { tool: "movingWall", label: "K7 移动墙", title: "移动墙：框选墙身后编辑路径" },
      { tool: "zone", label: "K12 子区域", title: "子区域 kind12" },
    ];
    this.els.tools.innerHTML = `<div class="tool-label">物件工具</div>`;
    for (const t of tools) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.tool = t.tool;
      b.textContent = t.label;
      b.title = t.title;
      b.addEventListener("click", () => this.setTool(t.tool));
      this.els.tools.appendChild(b);
    }
    const bundleBtn = document.createElement("button");
    bundleBtn.type = "button";
    bundleBtn.dataset.tool = "bundle";
    bundleBtn.textContent = "K8 捆绑箭";
    bundleBtn.title = "捆绑箭：先选中 kind1/2 箭再框选条带";
    bundleBtn.addEventListener("click", () => this.startBundle());
    this.els.tools.appendChild(bundleBtn);
  }

  private setTool(tool: EditorTool): void {
    if (this.playMode || !this.isToolAllowed(tool)) return;
    if (tool === "bomb") {
      this.startBomb();
      return;
    }
    if (tool === "frozen") {
      this.startFrozen();
      return;
    }
    const tab = this.activeTab();
    tab.draw = { ...createDrawState(), tool };
    if (tool === "select") {
      tab.doc = selectItem(tab.doc, null);
    }
    this.refresh();
  }

  private isInZoneEdit(): boolean {
    return this.activeTab().doc.editContext.zoneInstanceId != null;
  }

  private isToolAllowed(tool: EditorTool): boolean {
    if (!this.isInZoneEdit()) return true;
    return ZONE_EDIT_TOOLS.has(tool);
  }

  private ensureZoneEditTool(tab: TabState): void {
    if (tab.doc.editContext.zoneInstanceId == null) return;
    if (!ZONE_EDIT_TOOLS.has(tab.draw.tool)) {
      tab.draw = { ...createDrawState(), tool: "select" };
    }
  }

  private enterZoneEdit(zoneId: number): void {
    this.commit(enterZone(this.activeTab().doc, zoneId));
  }

  private placeBlocked(): void {
    this.statusHint = "物件超出子区域范围";
    window.clearTimeout(this.statusHintTimer);
    this.statusHintTimer = window.setTimeout(() => {
      this.statusHint = null;
      this.renderStatus();
    }, 2500);
    this.renderStatus();
  }

  private tryCommitItem(item: Omit<RawItem, "instanceId">): boolean {
    const tab = this.activeTab();
    if (!canPlaceInEditContext(tab.doc, item.occupiedPositions)) {
      this.placeBlocked();
      return false;
    }
    this.commit(addItem(tab.doc, item));
    return true;
  }

  private findSelectedHostArrow(): RawItem | null {
    const tab = this.activeTab();
    for (const id of tab.doc.selectedInstanceIds) {
      const item = findItemById(tab.doc.itemModels, id);
      if (item && (item.kind === 1 || item.kind === 2)) return item;
    }
    return null;
  }

  private hostHasAttachmentConflict(host: RawItem, excludeKind?: number): boolean {
    const all = this.collectAllRawItems();
    const cells = new Set(host.occupiedPositions.map(([x, y]) => `${x},${y}`));
    let count = 0;
    for (const item of all) {
      if (item.kind === 13 && excludeKind !== 13) {
        if (
          item.occupiedPositions.length === host.occupiedPositions.length &&
          item.occupiedPositions.every(
            (p, i) =>
              p[0] === host.occupiedPositions[i]![0] &&
              p[1] === host.occupiedPositions[i]![1],
          )
        ) {
          count += 1;
        }
      } else if (item.kind === 5 && excludeKind !== 5) {
        const c = item.occupiedPositions[0];
        if (c && cells.has(`${c[0]},${c[1]}`)) count += 1;
      } else if (item.kind === 11 && excludeKind !== 11) {
        const c = item.occupiedPositions[0];
        if (c && cells.has(`${c[0]},${c[1]}`)) count += 1;
      }
    }
    return count > 0;
  }

  private collectAllRawItems(): RawItem[] {
    const out: RawItem[] = [];
    function walk(items: RawItem[]): void {
      for (const item of items) {
        out.push(item);
        if (item.items) walk(item.items);
      }
    }
    walk(this.activeTab().doc.itemModels);
    return out;
  }

  private startBomb(): void {
    if (!this.isToolAllowed("bomb")) return;
    const host = this.findSelectedHostArrow();
    if (!host) {
      alert("请先选中一条 kind 1 或 kind 2 箭");
      return;
    }
    if (this.hostHasAttachmentConflict(host, 5)) {
      alert("该箭已绑定钥匙、炸弹或冻结，不可重复绑定");
      return;
    }
    this.tryCommitItem(buildBombItem(host.occupiedPositions));
  }

  private startFrozen(): void {
    if (!this.isToolAllowed("frozen")) return;
    const host = this.findSelectedHostArrow();
    if (!host) {
      alert("请先选中一条 kind 1 或 kind 2 箭");
      return;
    }
    if (this.hostHasAttachmentConflict(host, 13)) {
      alert("该箭已绑定钥匙、炸弹或冻结，不可重复绑定");
      return;
    }
    this.tryCommitItem(buildFrozenItem(host.occupiedPositions));
  }

  private startWallPathEdit(instanceId: number): void {
    const item = findItemById(this.activeTab().doc.itemModels, instanceId);
    if (!item || item.kind !== 7) return;
    const tab = this.activeTab();
    tab.draw = {
      ...createDrawState(),
      tool: "wallPath",
      wallPathEditId: instanceId,
      wallPathDraft: [...((item.movingPath as Vec2[] | undefined) ?? [])],
    };
    this.refresh();
  }

  private finishWallPathEdit(): void {
    const tab = this.activeTab();
    const id = tab.draw.wallPathEditId;
    if (id == null) return;
    const path = tab.draw.wallPathDraft;
    if (path.length < 2) {
      alert("移动路径至少 2 格");
      return;
    }
    this.commit(updateItem(tab.doc, id, { movingPath: path.map(([x, y]) => [x, y]) }));
    tab.draw = { ...createDrawState(), tool: "select" };
    this.wallPathDragging = false;
    this.refresh();
  }

  private cancelWallPathEdit(): void {
    const tab = this.activeTab();
    if (tab.draw.tool !== "wallPath") return;
    tab.draw = { ...createDrawState(), tool: "select" };
    this.wallPathDragging = false;
    this.refresh();
  }

  private applyWallPathAtCell(tab: TabState, cell: Vec2): void {
    const path = tab.draw.wallPathDraft;
    const last = path.at(-1);
    const same = last != null && last[0] === cell[0] && last[1] === cell[1];
    const adjacent =
      last != null &&
      Math.abs(cell[0] - last[0]) + Math.abs(cell[1] - last[1]) === 1;

    if (path.length === 0 || (!same && !adjacent)) {
      tab.draw.wallPathDraft = extendWallPathToCell([cell], cell);
    } else if (!same) {
      tab.draw.wallPathDraft = extendWallPathToCell(path, cell);
    }
  }

  private startBundle(): void {
    if (!this.isToolAllowed("bundle")) return;
    const tab = this.activeTab();
    const arrowId = tab.doc.selectedInstanceIds.find((id: number) => {
      function has(items: RawItem[]): boolean {
        for (const i of items) {
          if (i.instanceId === id && (i.kind === 1 || i.kind === 2)) return true;
          if (i.items && has(i.items)) return true;
        }
        return false;
      }
      return has(tab.doc.itemModels);
    });
    if (!arrowId) {
      alert("请先选中一条 kind 1 或 kind 2 折线箭");
      return;
    }
    tab.draw = { ...createDrawState(), tool: "bundle", bundleSourceArrowId: arrowId };
    this.refresh();
  }

  private updateToolButtons(): void {
    const tab = this.activeTab();
    const tool = tab.draw.tool;
    const inZone = this.isInZoneEdit();
    this.els.tools.querySelectorAll("button[data-tool]").forEach((b) => {
      const el = b as HTMLButtonElement;
      const t = el.dataset.tool as EditorTool;
      const allowed = !inZone || ZONE_EDIT_TOOLS.has(t);
      el.disabled = !allowed;
      el.classList.toggle("tool-disabled", !allowed);
      el.classList.toggle("active", allowed && t === tool);
    });
  }

  private bindEvents(): void {
    this.els.wrap.addEventListener("wheel", (e) => {
      if (this.playMode) return;
      e.preventDefault();
      const tab = this.activeTab();
      tab.viewport = zoomAt(tab.viewport, e.deltaY, e.clientX, e.clientY, this.els.wrap);
      applyViewportToCanvas(this.els.canvas, tab.viewport);
      applyViewportToCanvas(this.els.overlay, tab.viewport);
    });

    this.els.wrap.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));

    this.els.canvas.addEventListener("dblclick", (e) => this.onDblClick(e));

    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        const tab = this.activeTab();
        tab.viewport = { ...tab.viewport, spaceHeld: false };
        this.els.wrap.classList.remove("viewport-pan-ready", "viewport-panning");
      }
      if (e.key === "Control") {
        this.els.wrap.classList.remove("viewport-pan-ready", "viewport-panning");
      }
    });

    this.els.fileInput.addEventListener("change", async () => {
      const files = this.els.fileInput.files;
      if (!files?.length) return;
      for (const f of await openFilesFromInput(files)) await this.loadOpenedFile(f);
      this.els.fileInput.value = "";
    });

    this.els.wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    this.els.wrap.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (!e.dataTransfer?.files.length) return;
      for (const f of await openFilesFromInput(e.dataTransfer.files)) {
        await this.loadOpenedFile(f);
      }
    });
  }

  private cellFromEvent(e: MouseEvent): Vec2 | null {
    const tab = this.activeTab();
    return pointerToCell(
      e.clientX,
      e.clientY,
      this.els.canvas,
      tab.doc.meta,
      tab.viewport,
    );
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.playMode) return;
    const tab = this.activeTab();
    if (shouldStartViewportPan(e, tab.viewport)) {
      e.preventDefault();
      this.panStart = { x: e.clientX, y: e.clientY, ox: tab.viewport.offsetX, oy: tab.viewport.offsetY };
      this.els.wrap.classList.add("viewport-panning");
      this.els.wrap.classList.remove("viewport-pan-ready");
      return;
    }
    const cell = this.cellFromEvent(e);
    if (!cell) return;

    const tool = tab.draw.tool;
    if (tool === "select") {
      const hit = findItemAtCell(tab.doc, cell);
      if (hit) {
        this.marqueeActive = false;
        this.marqueeStart = null;
        this.marqueeEnd = null;
        tab.doc = selectItem(tab.doc, hit.instanceId, e.ctrlKey);
        this.dragId = hit.instanceId;
        this.dragOrigin = cell;
        this.dragPositions = [...hit.occupiedPositions];
        this.refresh();
        return;
      }
      this.marqueeStart = cell;
      this.marqueeEnd = cell;
      this.marqueeActive = true;
      this.selectionAddMode = e.ctrlKey;
      return;
    }

    if (tool === "arrow" || tool === "pipe" || tool === "flipArrow") {
      const next = extendPolylineToCell(tab.draw.polyline, cell);
      if (!canPlaceInEditContext(tab.doc, next)) {
        this.placeBlocked();
        return;
      }
      this.polylineDragging = true;
      tab.draw.polyline = next;
      this.refresh();
      return;
    }

    if (tool === "wallPath" && cell) {
      this.applyWallPathAtCell(tab, cell);
      this.wallPathDragging = true;
      this.renderCanvas();
      return;
    }

    if (tool === "corner") {
      if (!canPlaceInEditContext(tab.doc, [cell])) {
        this.placeBlocked();
        return;
      }
      this.tryCommitItem(buildCornerItem(cell, tab.draw.cornerD1, tab.draw.cornerD2));
      return;
    }

    if (tool === "key") {
      this.commit(addItem(tab.doc, buildKeyItem(cell)));
      return;
    }

    if (tool === "curtain" || tool === "zone" || tool === "bundle" || tool === "movingWall") {
      tab.draw.rectStart = cell;
      this.refresh();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.playMode) return;
    const tab = this.activeTab();
    if (this.panStart) {
      tab.viewport = {
        ...tab.viewport,
        offsetX: this.panStart.ox + (e.clientX - this.panStart.x),
        offsetY: this.panStart.oy + (e.clientY - this.panStart.y),
      };
      applyViewportToCanvas(this.els.canvas, tab.viewport);
      applyViewportToCanvas(this.els.overlay, tab.viewport);
      return;
    }

    const cell = this.cellFromEvent(e);
    this.hoverCell = cell;
    if (cell) {
      this.els.tooltip.classList.remove("hidden");
      this.els.tooltip.textContent = `[${cell[0]}, ${cell[1]}]`;
      const rect = this.els.wrap.getBoundingClientRect();
      this.els.tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      this.els.tooltip.style.top = `${e.clientY - rect.top + 12}px`;
    } else {
      this.els.tooltip.classList.add("hidden");
    }

    if (this.dragId != null && this.dragOrigin && cell) {
      const dx = cell[0] - this.dragOrigin[0];
      const dy = cell[1] - this.dragOrigin[1];
      if (dx !== 0 || dy !== 0) {
        if (this.dragPositions) {
          const positions = this.dragPositions.map(
            ([x, y]) => [x + dx, y + dy] as Vec2,
          );
          if (!canPlaceInEditContext(tab.doc, positions)) return;
          tab.doc = updateItem(tab.doc, this.dragId, { occupiedPositions: positions });
          this.refresh();
        }
      }
    }

    if (this.marqueeActive && cell) {
      this.marqueeEnd = cell;
      this.renderCanvas();
      return;
    }

    if (
      this.polylineDragging &&
      (e.buttons & 1) &&
      cell &&
      (tab.draw.tool === "arrow" || tab.draw.tool === "pipe" || tab.draw.tool === "flipArrow")
    ) {
      const next = extendPolylineToCell(tab.draw.polyline, cell);
      if (next.length !== tab.draw.polyline.length) {
        if (!canPlaceInEditContext(tab.doc, next)) return;
        tab.draw.polyline = next;
        this.renderCanvas();
      }
      return;
    }

    if (this.wallPathDragging && (e.buttons & 1) && cell && tab.draw.tool === "wallPath") {
      const path = tab.draw.wallPathDraft;
      const next = extendWallPathToCell(path, cell);
      if (next.length !== path.length) {
        tab.draw.wallPathDraft = next;
        this.renderCanvas();
      }
      return;
    }

    if (tab.draw.rectStart && cell && !this.playMode) {
      const cells = rectPositions(
        tab.draw.rectStart[0],
        tab.draw.rectStart[1],
        cell[0],
        cell[1],
      );
      (tab as unknown as { draftRect: Vec2[] }).draftRect = cells;
      this.renderCanvas();
    }
  }

  private onMouseUp(e: MouseEvent): void {
    const tab = this.activeTab();
    if (this.panStart) {
      this.panStart = null;
      this.els.wrap.classList.remove("viewport-panning");
      if (tab.viewport.spaceHeld || e.ctrlKey) {
        this.els.wrap.classList.add("viewport-pan-ready");
      }
      return;
    }

    if (this.polylineDragging) {
      this.polylineDragging = false;
    }
    if (this.wallPathDragging) {
      this.wallPathDragging = false;
      this.renderProps();
    }

    if (this.dragId != null) {
      if (this.dragPositions) {
        const item = findItemById(tab.doc.itemModels, this.dragId);
        if (
          item &&
          !canPlaceInEditContext(tab.doc, item.occupiedPositions)
        ) {
          tab.doc = updateItem(tab.doc, this.dragId, {
            occupiedPositions: this.dragPositions,
          });
        }
      }
      this.commit(tab.doc);
      this.dragId = undefined;
      this.dragOrigin = undefined;
      this.dragPositions = undefined;
      return;
    }

    if (this.marqueeActive && this.marqueeStart && this.marqueeEnd) {
      const s = this.marqueeStart;
      const t = this.marqueeEnd;
      if (s[0] === t[0] && s[1] === t[1]) {
        if (!e.ctrlKey) tab.doc = selectItem(tab.doc, null);
      } else {
        tab.doc = selectItemsInRect(
          tab.doc,
          s[0],
          s[1],
          t[0],
          t[1],
          this.selectionAddMode || e.ctrlKey,
        );
      }
      this.marqueeActive = false;
      this.marqueeStart = null;
      this.marqueeEnd = null;
      this.refresh();
      return;
    }

    const tool = tab.draw.tool;
    if ((tool === "arrow" || tool === "pipe" || tool === "flipArrow") && tab.draw.polyline.length >= 2) {
      // wait for dblclick or enter to finish - on mouse up for polyline we keep building
      return;
    }

    const draft = (tab as unknown as { draftRect?: Vec2[] }).draftRect;
    if (draft?.length && tab.draw.rectStart) {
      if (!canPlaceInEditContext(tab.doc, draft)) {
        this.placeBlocked();
      } else if (tool === "curtain") {
        this.tryCommitItem(buildCurtainItem(draft));
      } else if (tool === "zone") {
        this.tryCommitItem(buildZoneItem(draft));
      } else if (tool === "bundle") {
        if (draft.length >= 2 && draft.length <= 4) {
          this.tryCommitItem(buildBundleItem(draft));
        }
      } else if (tool === "movingWall") {
        if (this.isInZoneEdit()) {
          alert("移动墙不可放在子区域内");
        } else {
          const nextDoc = addItem(tab.doc, buildMovingWallItem(draft, [], 1, 1));
          this.commit(nextDoc);
          const newId = nextDoc.selectedInstanceIds[0]!;
          this.startWallPathEdit(newId);
        }
      }
      tab.draw.rectStart = null;
      (tab as unknown as { draftRect?: Vec2[] }).draftRect = undefined;
      this.refresh();
    }
  }

  private onDblClick(e: MouseEvent): void {
    const tab = this.activeTab();
    if (this.playMode) return;

    const cell = this.cellFromEvent(e);
    if (!cell) return;

    const hit = findItemAtCell(tab.doc, cell);
    if (hit?.kind === 12 && tab.draw.tool === "select") {
      this.enterZoneEdit(hit.instanceId);
      return;
    }

    if (tab.draw.tool === "arrow" && tab.draw.polyline.length >= 2) {
      this.finishPolyline("arrow");
    } else if (tab.draw.tool === "flipArrow" && tab.draw.polyline.length >= 2) {
      this.finishPolyline("flipArrow");
    } else if (tab.draw.tool === "pipe" && tab.draw.polyline.length >= 2) {
      this.finishPolyline("pipe");
    }
  }

  private finishPolyline(kind: "arrow" | "pipe" | "flipArrow"): void {
    const tab = this.activeTab();
    const pl = tab.draw.polyline;

    if (kind === "flipArrow") {
      if (pl.length < 2) return;
      if (!canPlaceInEditContext(tab.doc, pl)) {
        this.placeBlocked();
        return;
      }
      const d1 = directionFromLastSegment(pl);
      const d2 = directionFromFirstSegment(pl);
      this.tryCommitItem(
        buildFlipArrowItem(
          pl.map(([x, y]) => [x, y] as Vec2),
          d1,
          d2,
          tab.draw.colorId,
        ),
      );
      tab.draw.polyline = [];
      this.polylineDragging = false;
      this.refresh();
      return;
    }

    if (!isValidPolyline(pl)) {
      alert("折线无效：须至少 2 格、连续、不自交");
      tab.draw.polyline = [];
      this.refresh();
      return;
    }
    if (kind === "arrow") {
      const dir = directionFromLastSegment(pl);
      if (!headMatchesDirection(pl, dir)) {
        alert("头部方向与末段不一致");
        return;
      }
      if (!canPlaceInEditContext(tab.doc, pl)) {
        this.placeBlocked();
        return;
      }
      this.tryCommitItem(buildArrowItem(pl, tab.draw.colorId, dir));
    } else {
      if (!canPlaceInEditContext(tab.doc, pl)) {
        this.placeBlocked();
        return;
      }
      this.tryCommitItem(buildPipeItem(pl));
    }
    tab.draw.polyline = [];
    this.polylineDragging = false;
    this.refresh();
  }

  private onKeyDown(e: KeyboardEvent): void {
    const tab = this.activeTab();
    if (e.code === "Space") {
      tab.viewport = { ...tab.viewport, spaceHeld: true };
      this.els.wrap.classList.add("viewport-pan-ready");
      e.preventDefault();
    }
    if (e.key === "Control") {
      this.els.wrap.classList.add("viewport-pan-ready");
    }
    if (e.key === "Escape") {
      if (this.playMode) this.togglePlayMode();
      else if (tab.draw.tool === "wallPath") this.cancelWallPathEdit();
      else if (tab.doc.editContext.zoneInstanceId != null) this.commit(exitZone(tab.doc));
      else {
        tab.draw = createDrawState();
        this.polylineDragging = false;
        this.wallPathDragging = false;
        this.refresh();
      }
    }
    if (e.key === "Delete" && !this.playMode) {
      if (tab.doc.selectedInstanceIds.length) {
        this.commit(removeItems(tab.doc, tab.doc.selectedInstanceIds));
      }
    }
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      this.doUndo();
    }
    if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      this.doRedo();
    }
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      if (e.shiftKey) this.saveAs();
      else this.save();
    }
    if (e.ctrlKey && e.key === "o") {
      e.preventDefault();
      this.openFiles();
    }
    if (e.ctrlKey && e.key === "n") {
      e.preventDefault();
      this.showNewDialog();
    }
    if (e.ctrlKey && e.key === "c") {
      this.clipboard = copyItems(tab.doc);
    }
    if (e.ctrlKey && e.key === "v" && this.clipboard.length) {
      const offset: Vec2 = [1, 1];
      const blocked = this.clipboard.some((src) => {
        const positions = src.occupiedPositions.map(
          ([x, y]) => [x + offset[0], y + offset[1]] as Vec2,
        );
        return !canPlaceInEditContext(tab.doc, positions);
      });
      if (blocked) this.placeBlocked();
      else this.commit(pasteItems(tab.doc, this.clipboard));
    }
    if (e.key === "Enter") {
      if (e.repeat) return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (tab.draw.tool === "wallPath") {
        this.finishWallPathEdit();
      } else if (
        tab.draw.tool === "arrow" ||
        tab.draw.tool === "pipe" ||
        tab.draw.tool === "flipArrow"
      ) {
        this.finishPolyline(tab.draw.tool);
      }
    }
  }

  private async openFiles(): Promise<void> {
    const fsa = await openFilesWithFSA();
    if (fsa.length) {
      for (const f of fsa) await this.loadOpenedFile(f);
      return;
    }
    const single = await openFileWithFSA();
    if (single) {
      await this.loadOpenedFile(single);
      return;
    }
    this.els.fileInput.click();
  }

  private async loadOpenedFile(file: {
    name: string;
    content: string;
    handle?: FileSystemFileHandle;
  }): Promise<void> {
    try {
      const data = JSON.parse(file.content);
      const { doc, warnings } = createDocumentFromJson(file.name, data, file.handle);
      if (warnings.length) this.toast(warnings.join("\n"));
      this.newTab(doc);
    } catch (err) {
      alert(`无法加载：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async save(): Promise<void> {
    const tab = this.activeTab();
    const issues = validateLevelData(levelDataFromDocument(tab.doc));
    if (hasBlockingErrors(issues)) {
      alert("存在阻塞级校验错误，无法保存");
      return;
    }
    const content = serializeLevelData(tab.doc);
    const handle = tab.doc.source.handle;
    if (handle) {
      await saveToHandle(handle, content);
      tab.doc = { ...tab.doc, dirty: false };
      this.refresh();
      this.toast("已保存");
    } else {
      await this.saveAs();
    }
  }

  private async saveAs(): Promise<void> {
    const tab = this.activeTab();
    const issues = validateLevelData(levelDataFromDocument(tab.doc));
    if (hasBlockingErrors(issues)) {
      alert("存在阻塞级校验错误，无法保存");
      return;
    }
    const content = serializeLevelData(tab.doc);
    const id = parseLevelIdFromFilename(tab.doc.source.name);
    const suggested = suggestExportName(tab.doc.source.name, id || undefined);
    const result = await saveAsWithFSA(content, suggested);
    if (result) {
      tab.doc = {
        ...tab.doc,
        dirty: false,
        source: { name: result.name, handle: result.handle },
      };
      this.refresh();
      this.toast("已另存为");
    } else {
      exportDownload(content, suggested);
      tab.doc = { ...tab.doc, dirty: false, source: { name: suggested } };
      this.refresh();
    }
  }

  private exportFile(): void {
    const tab = this.activeTab();
    const content = serializeLevelData(tab.doc);
    exportDownload(content, tab.doc.source.name);
  }

  private showAiGenerateDialog(): void {
    showAiGenerateDialog(this.els.modal);
  }

  private showNewDialog(): void {
    this.els.modal.classList.remove("hidden");
    this.els.modal.innerHTML = `
      <div class="modal">
        <h2>新建关卡</h2>
        <label><span>宽度</span><input id="nw" type="number" value="20" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" /></label>
        <label><span>高度</span><input id="nh" type="number" value="32" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" /></label>
        <label><span>名称</span><input id="nn" type="text" value="" /></label>
        <label><span>时限</span><input id="nd" type="number" value="150" min="1" /></label>
        <div class="actions modal-actions">
          <button type="button" id="modal-cancel">取消</button>
          <button type="button" class="primary" id="modal-ok">创建</button>
        </div>
      </div>
    `;
    this.els.modal.querySelector("#modal-cancel")?.addEventListener("click", () => {
      this.els.modal.classList.add("hidden");
    });
    this.els.modal.querySelector("#modal-ok")?.addEventListener("click", () => {
      const w = parseInt((this.els.modal.querySelector("#nw") as HTMLInputElement).value, 10);
      const h = parseInt((this.els.modal.querySelector("#nh") as HTMLInputElement).value, 10);
      if (!isBoardSizeValid(w, h)) {
        alert(`宽度与高度须在 ${boardSizeRangeLabel()} 之间`);
        return;
      }
      const name = (this.els.modal.querySelector("#nn") as HTMLInputElement).value;
      const d = parseInt((this.els.modal.querySelector("#nd") as HTMLInputElement).value, 10);
      this.newTab(
        createEmptyDocument({
          width: w,
          height: h,
          name,
          durationInSec: d,
        }),
      );
      this.els.modal.classList.add("hidden");
    });
  }

  private doUndo(): void {
    const tab = this.activeTab();
    const r = undo(tab.history, tab.doc);
    if (r.doc) {
      tab.history = r.history;
      tab.doc = r.doc;
      this.refresh();
    }
  }

  private doRedo(): void {
    const tab = this.activeTab();
    const r = redo(tab.history, tab.doc);
    if (r.doc) {
      tab.history = r.history;
      tab.doc = r.doc;
      this.refresh();
    }
  }

  private togglePlayMode(): void {
    const tab = this.activeTab();
    const issues = validateLevelData(levelDataFromDocument(tab.doc));
    if (!this.playMode && hasBlockingErrors(issues)) {
      alert("请先修复阻塞级校验错误再试玩");
      return;
    }
    this.playMode = !this.playMode;
    this.els.playControls.classList.toggle("hidden", !this.playMode);
    if (this.playMode) {
      const tab = this.activeTab();
      tab.viewport = resetViewport(this.els.wrap, tab.doc.meta);
      applyViewportToCanvas(this.els.canvas, tab.viewport);
      applyViewportToCanvas(this.els.overlay, tab.viewport);
      this.els.overlay.style.visibility = "hidden";

      const level = documentToGameLevel(tab.doc);
      this.gameState = new GameState(level);
      this.playRenderer = new BoardRenderer(this.els.canvas);
      this.playInput?.dispose();
      this.playInput = new InputHandler(this.els.canvas, () => this.gameState, this.playRenderer);
      this.els.playControls.innerHTML = `
        <button type="button" id="play-auto" class="play-auto-btn" title="自动依次点击当前无阻挡、可立即出界的箭">一键试玩</button>
        <button type="button" id="play-reset">重置</button>
        <button type="button" id="play-exit">退出 (Esc)</button>
      `;
      this.els.playControls.querySelector("#play-auto")?.addEventListener("click", () => {
        this.autoPlayActive = !this.autoPlayActive;
        if (this.autoPlayActive && this.gameState?.phase === "playing") {
          this.gameState.tryAutoLaunch();
        }
        this.syncAutoPlayButton();
      });
      this.els.playControls.querySelector("#play-reset")?.addEventListener("click", () => {
        this.autoPlayActive = false;
        this.gameState = new GameState(documentToGameLevel(tab.doc));
        this.syncAutoPlayButton();
      });
      this.els.playControls.querySelector("#play-exit")?.addEventListener("click", () =>
        this.togglePlayMode(),
      );
      this.startPlayLoop();
    } else {
      cancelAnimationFrame(this.rafId);
      this.autoPlayActive = false;
      this.playInput?.dispose();
      this.playInput = null;
      this.gameState = null;
      this.playRenderer = null;
      this.els.overlay.style.visibility = "";
      this.refresh();
    }
  }

  private syncAutoPlayButton(): void {
    const btn = this.els.playControls.querySelector("#play-auto") as HTMLButtonElement | null;
    const gs = this.gameState;
    if (!btn || !gs) return;

    const canLaunch = gs.phase === "playing" && gs.getLaunchableIds().size > 0;
    if (this.autoPlayActive) {
      btn.textContent = "停止试玩";
      btn.classList.add("active");
      btn.disabled = false;
    } else {
      btn.textContent = "一键试玩";
      btn.classList.remove("active");
      btn.disabled = !canLaunch;
    }
  }

  private startPlayLoop(): void {
    const ANIM_INTERVAL_MS = 40;
    let lastTime = performance.now();
    let animAccum = 0;

    const renderPlayFrame = (): void => {
      const gs = this.gameState;
      const renderer = this.playRenderer;
      if (!gs || !renderer) return;

      const launchable = gs.getLaunchableIds();
      const hidden = gs.getPipeHiddenArrowIds();
      const visible = (arrows: typeof gs.arrows) =>
        arrows.filter((a) => !hidden.has(a.instanceId));

      const vanishProgressById = new Map<number, number>();
      if (gs.animation?.mode === "vanish") {
        const progress = gs.getVanishAnimProgress();
        for (const id of gs.animation.memberIds) {
          vanishProgressById.set(id, progress);
        }
      }

      renderer.drawBoard(
        gs.level,
        launchable,
        gs.zoneManager.getZones(),
        visible(gs.getDrawableRevealedZoneArrows()),
        gs.getRevealedZoneCorners(),
        gs.getDrawableRevealedZoneBundles(),
        gs.getRevealedZonePipes(),
        visible(gs.getDrawableTopLevelArrows()),
        gs.getTopLevelCorners(),
        gs.getDrawableTopLevelBundles(),
        gs.getTopLevelPipes(),
        gs.getVisibleKeys(),
        gs.getActiveCurtainsForRender(),
        {
          style: "game",
          vanishProgressById,
          movingWalls: gs.getMovingWalls(),
          frozenOverlays: gs.getFrozenOverlays(),
          bombStates: gs.getBombDrawStates(),
          bombExplosion: gs.getBombExplosion(),
          urgentBombRemaining: gs.getUrgentBombRemaining(),
        },
      );
    };

    const tick = (now: number) => {
      if (!this.playMode || !this.gameState || !this.playRenderer) return;
      const gs = this.gameState;

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      gs.tick(dt);

      if (gs.phase === "animating") {
        animAccum += dt * 1000;
        let advanced = false;
        while (animAccum >= ANIM_INTERVAL_MS) {
          gs.advanceAnimation();
          animAccum -= ANIM_INTERVAL_MS;
          advanced = true;
          if (gs.phase !== "animating") {
            animAccum = 0;
            break;
          }
        }
        if (gs.phase === "animating" && !advanced) {
          gs.advanceAnimation();
        }
        gs.recoverAnimationState();
      }

      if (this.autoPlayActive) {
        if (gs.phase === "won" || gs.phase === "lost") {
          this.autoPlayActive = false;
        } else if (gs.phase === "playing") {
          const launched = gs.tryAutoLaunch();
          if (!launched) this.autoPlayActive = false;
        }
      }

      renderPlayFrame();
      this.syncAutoPlayButton();
      this.rafId = requestAnimationFrame(tick);
    };

    lastTime = performance.now();
    this.rafId = requestAnimationFrame(tick);
  }

  private renderTabs(): void {
    this.els.tabs.innerHTML = "";
    for (const tab of this.tabs) {
      const el = document.createElement("div");
      el.className = `tab${tab.id === this.activeTabId ? " active" : ""}`;
      el.innerHTML = `<span>${tab.doc.source.name}${tab.doc.dirty ? " *" : ""}</span><span class="close">×</span>`;
      el.querySelector("span")?.addEventListener("click", () => {
        this.activeTabId = tab.id;
        this.refresh();
      });
      el.querySelector(".close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
      this.els.tabs.appendChild(el);
    }
  }

  private closeTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.doc.dirty) {
      if (!confirm("关卡未保存，确定关闭？")) return;
    }
    this.tabs = this.tabs.filter((t) => t.id !== id);
    if (this.tabs.length === 0) this.newTab(createEmptyDocument());
    else if (this.activeTabId === id) this.activeTabId = this.tabs[0]!.id;
    this.refresh();
  }

  private renderBreadcrumb(): void {
    const tab = this.activeTab();
    const zid = tab.doc.editContext.zoneInstanceId;
    if (zid == null) {
      this.els.breadcrumb.classList.add("hidden");
      return;
    }
    this.els.breadcrumb.classList.remove("hidden");
    this.els.breadcrumb.innerHTML = `顶层 &gt; 子区域 #${zid} <button type="button" id="exit-zone">返回顶层</button>`;
    this.els.breadcrumb.querySelector("#exit-zone")?.addEventListener("click", () => {
      this.commit(exitZone(tab.doc));
    });
  }

  private renderCanvas(): void {
    if (this.playMode) return;
    const tab = this.activeTab();
    applyViewportToCanvas(this.els.canvas, tab.viewport);
    applyViewportToCanvas(this.els.overlay, tab.viewport);

    const draft = [
      ...tab.draw.polyline,
      ...((tab as unknown as { draftRect?: Vec2[] }).draftRect ?? []),
    ];

    const marquee =
      this.marqueeActive && this.marqueeStart && this.marqueeEnd
        ? {
            x0: this.marqueeStart[0],
            y0: this.marqueeStart[1],
            x1: this.marqueeEnd[0],
            y1: this.marqueeEnd[1],
          }
        : null;

    const cornerHover =
      tab.draw.tool === "corner" && this.hoverCell
        ? { cell: this.hoverCell, d1: tab.draw.cornerD1, d2: tab.draw.cornerD2 }
        : null;

    this.boardView.draw(
      tab.doc,
      this.hoverCell,
      new Set(tab.doc.selectedInstanceIds),
      draft,
      marquee,
      cornerHover,
      {
        wallPathDraft: tab.draw.wallPathDraft,
        wallPathEditId: tab.draw.wallPathEditId,
        flipPolyline: tab.draw.tool === "flipArrow" ? tab.draw.polyline : undefined,
        flipDirection1:
          tab.draw.tool === "flipArrow"
            ? directionFromLastSegment(tab.draw.polyline)
            : undefined,
        flipDirection2:
          tab.draw.tool === "flipArrow"
            ? directionFromFirstSegment(tab.draw.polyline)
            : undefined,
      },
    );
  }

  private renderProps(): void {
    const tab = this.activeTab();
    const issues = validateLevelData(levelDataFromDocument(tab.doc));
    const wallPathEdit =
      tab.draw.tool === "wallPath" && tab.draw.wallPathEditId != null
        ? {
            instanceId: tab.draw.wallPathEditId,
            draftLength: tab.draw.wallPathDraft.length,
          }
        : null;
    renderPropsPanel(
      this.els.props,
      tab.doc,
      issues,
      (patch) => this.commit(updateMeta(tab.doc, patch)),
      (patch) => {
        const id = tab.doc.selectedInstanceIds[0];
        if (id) this.commit(updateItem(tab.doc, id, patch));
      },
      (zoneId) => this.enterZoneEdit(zoneId),
      (id) => this.startWallPathEdit(id),
      wallPathEdit,
      () => this.finishWallPathEdit(),
      () => this.cancelWallPathEdit(),
    );
  }

  private renderStatus(): void {
    const tab = this.activeTab();
    const issues = validateLevelData(levelDataFromDocument(tab.doc));
    const blocking = hasBlockingErrors(issues);
    const scale = Math.round(tab.viewport.scale * 100);
    const sel = tab.doc.selectedInstanceIds[0];
    const mid = sel ? `选中 #${sel}` : "未选中";
    const save = tab.doc.dirty ? '<span class="dirty">未保存</span>' : "已保存";
    const valid = blocking ? '<span class="invalid">校验未通过</span>' : "校验通过";
    const hint = this.statusHint
      ? `<span class="invalid">${this.statusHint}</span>`
      : tab.draw.tool === "wallPath"
        ? '<span class="wall-path-hint">路径编辑中 · Enter 完成 · Esc 取消</span>'
        : `${save} · ${valid}`;
    this.els.status.innerHTML = `
      <span>${this.hoverCell ? `[${this.hoverCell[0]}, ${this.hoverCell[1]}]` : "—"}</span>
      <span>${scale}% · ${mid}</span>
      <span>滚轮缩放 · Ctrl/Space+拖拽平移</span>
      <span>${hint}</span>
    `;
  }

  private toast(msg: string): void {
    console.info(msg);
  }
}
