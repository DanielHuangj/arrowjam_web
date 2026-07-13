import type { EditorDocument, RawItem, SpawnPoolEntry, SpawnPoolKind, SpawnWeightAdjustTier, ValidationIssue } from "@arrowjaw/shared";
import { colorForId } from "@arrowjaw/client/render/colors.ts";
import { BOARD_MAX_SIZE, BOARD_MIN_SIZE } from "../board-limits.ts";
import {
  defaultRushGoals,
  defaultRushSpawnPool,
  defaultSpawnPoolEntry,
  defaultSpawnWeightAdjustTiers,
  spawnPoolEntryKey,
  spawnPoolWeightSum,
  spawnWeightSumPercent,
  isSpawnWeightTotalValid,
} from "../document/rush-meta.ts";

const KIND_LABELS: Record<number, string> = {
  1: "折线箭",
  2: "翻转箭",
  3: "管道",
  4: "反射角块",
  5: "定时炸弹",
  6: "幕布",
  7: "移动墙",
  8: "捆绑箭",
  11: "钥匙箭",
  12: "子区域",
  13: "冻结箭",
  14: "收缩障碍",
  15: "拨动杆",
  16: "控制器",
  17: "区域炸弹",
  18: "十字炸弹",
  19: "燃烧弹",
  20: "定向气球",
  21: "黑洞",
  22: "翻转按钮",
  23: "糖果机",
};

const EDITOR_ARROW_COLOR_IDS = [1, 2, 3, 4, 6, 7, 8] as const;

function colorSwatchesPickerHtml(
  selectedId: number,
  extraClass = "",
  dataAttrs: Record<string, string> = {},
  includeGeneric = false,
): string {
  let html = `<div class="color-swatch-picker ${extraClass}"`;
  for (const [key, value] of Object.entries(dataAttrs)) {
    html += ` data-${key}="${escapeAttr(value)}"`;
  }
  html += ">";
  if (includeGeneric) {
    html += `<span class="color-swatch generic${selectedId === 0 ? " selected" : ""}" data-color="0" title="通用色"></span>`;
  }
  for (const id of EDITOR_ARROW_COLOR_IDS) {
    const hex = colorForId(id);
    html += `<span class="color-swatch${selectedId === id ? " selected" : ""}" data-color="${id}" style="background:${hex}" title=""></span>`;
  }
  html += "</div>";
  return html;
}

function appendColorSwatches(
  container: HTMLElement,
  selectedId: number,
  onPick: (colorId: number) => void,
  options?: { includeGeneric?: boolean },
): void {
  container.innerHTML = "";
  if (options?.includeGeneric) {
    const g = document.createElement("span");
    g.className = `color-swatch generic${selectedId === 0 ? " selected" : ""}`;
    g.title = "通用色";
    g.addEventListener("click", () => onPick(0));
    container.appendChild(g);
  }
  for (const id of EDITOR_ARROW_COLOR_IDS) {
    const d = document.createElement("span");
    d.className = `color-swatch${selectedId === id ? " selected" : ""}`;
    d.style.background = colorForId(id);
    d.addEventListener("click", () => onPick(id));
    container.appendChild(d);
  }
}

function bindColorSwatchPicker(
  root: HTMLElement,
  selector: string,
  onPick: (el: HTMLElement, colorId: number) => void,
): void {
  root.querySelectorAll(`${selector} .color-swatch`).forEach((node) => {
    node.addEventListener("click", () => {
      const swatch = node as HTMLElement;
      const colorId = parseInt(swatch.dataset.color ?? "0", 10);
      const picker = swatch.closest(selector);
      if (picker) {
        picker.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
        swatch.classList.add("selected");
      }
      onPick(swatch, colorId);
    });
  });
}

export type PropsChangeHandler = (patch: Record<string, unknown>) => void;
export type MetaChangeHandler = (patch: Partial<EditorDocument["meta"]>) => void;
export type WallPathEditHandler = (instanceId: number) => void;
export type WallPathEditState = {
  instanceId: number;
  draftLength: number;
};

export type ToolOptionState = {
  tool: string;
  bombRadius: 1 | 2;
  crossArm: 2 | 5;
  colorId?: number;
};

export type ToolOptionHandler = (patch: {
  bombRadius?: 1 | 2;
  crossArm?: 2 | 5;
  colorId?: number;
}) => void;

export function renderPropsPanel(
  el: HTMLElement,
  doc: EditorDocument,
  issues: ValidationIssue[],
  onMeta: MetaChangeHandler,
  onItem: PropsChangeHandler,
  onEnterZone: (zoneId: number) => void,
  onStartWallPath?: WallPathEditHandler,
  wallPathEdit?: WallPathEditState | null,
  onFinishWallPath?: () => void,
  onCancelWallPath?: () => void,
  toolOptions?: ToolOptionState | null,
  onToolOption?: ToolOptionHandler,
): void {
  el.innerHTML = "";

  if (doc.selectedInstanceIds.length === 0) {
    renderLevelMeta(el, doc, onMeta, toolOptions, onToolOption);
  } else if (doc.selectedInstanceIds.length === 1) {
    const id = doc.selectedInstanceIds[0]!;
    const item = findInDoc(doc, id);
    if (item) {
      renderItemProps(
        el,
        item,
        onItem,
        onEnterZone,
        onStartWallPath,
        wallPathEdit,
        onFinishWallPath,
        onCancelWallPath,
      );
    }
  } else {
    el.innerHTML = `<h3>已选 ${doc.selectedInstanceIds.length} 个物件</h3>`;
  }

  renderValidationList(el, issues);
}

function renderLevelMeta(
  el: HTMLElement,
  doc: EditorDocument,
  onMeta: MetaChangeHandler,
  toolOptions?: ToolOptionState | null,
  onToolOption?: ToolOptionHandler,
): void {
  const m = doc.meta;
  const isRush = m.gameMode === "rush";
  el.innerHTML = `
    <h3>关卡信息</h3>
    <label><span>宽度</span><input type="number" id="meta-width" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" value="${m.width}" /></label>
    <label><span>高度</span><input type="number" id="meta-height" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" value="${m.height}" /></label>
    <label><span>名称</span><input type="text" id="meta-name" value="${escapeAttr(m.name)}" /></label>
    <label><span>时限（秒）</span><input type="number" id="meta-duration" min="1" value="${m.durationInSec}" /></label>
    <label><span>难度</span>
      <select id="meta-difficulty">
        <option value="1" ${m.difficulty === 1 ? "selected" : ""}>Normal</option>
        <option value="2" ${m.difficulty === 2 ? "selected" : ""}>Hard</option>
        <option value="3" ${m.difficulty === 3 ? "selected" : ""}>Superhuman</option>
      </select>
    </label>
    <label><span>游戏模式</span>
      <select id="meta-gameMode">
        <option value="classic" ${m.gameMode !== "rush" ? "selected" : ""}>经典（清盘）</option>
        <option value="rush" ${m.gameMode === "rush" ? "selected" : ""}>爽快版（目标驱动）</option>
      </select>
    </label>
    <label><span>关卡类型</span>
      <select id="meta-levelKind">
        <option value="" ${m.levelKind == null ? "selected" : ""}>未设置</option>
        <option value="1" ${m.levelKind === 1 ? "selected" : ""}>主线</option>
        <option value="2" ${m.levelKind === 2 ? "selected" : ""}>普通</option>
      </select>
    </label>
    <div class="board-meta-summary">
      <h4>棋盘区域</h4>
      <p>形状：${m.boardShape === "custom" ? "异形" : "矩形全格"}</p>
      <p>有效格：${m.boardShape === "custom" && m.playableMask?.rows?.length ? "已定义" : "全板"}</p>
      <p>黑洞区域：${m.blackHoleRegions?.length ? `${m.blackHoleRegions.length} 块` : "无"}</p>
      ${doc.editContext.regionEditMode ? `<p class="warn-text">正在编辑：${doc.editContext.regionEditMode === "playable" ? "异形棋盘" : doc.editContext.regionEditMode === "blackHole" ? "黑洞区域" : "无效格颜色"}</p>` : ""}
      ${doc.editorOnly?.backgroundImage ? `<p>背景图：${escapeAttr(doc.editorOnly.backgroundImage.name)}（仅编辑器）</p>` : ""}
    </div>
    <div id="rush-meta-section" class="${isRush ? "" : "hidden"}"></div>
    <div id="tool-options-section"></div>
  `;

  if (isRush) {
    renderRushMetaSection(
      el.querySelector("#rush-meta-section")! as HTMLElement,
      m,
      onMeta,
    );
  }

  if (toolOptions && (toolOptions.tool === "areaBomb" || toolOptions.tool === "crossBomb")) {
    const sec = el.querySelector("#tool-options-section")! as HTMLElement;
    sec.innerHTML = `<h3>当前工具</h3>`;
    if (toolOptions.tool === "areaBomb") {
      sec.innerHTML += `
        <label><span>区域大小</span>
          <select id="tool-bomb-radius">
            <option value="1" ${toolOptions.bombRadius === 1 ? "selected" : ""}>3×3</option>
            <option value="2" ${toolOptions.bombRadius === 2 ? "selected" : ""}>5×5</option>
          </select>
        </label>`;
      sec.querySelector("#tool-bomb-radius")?.addEventListener("change", (e) => {
        onToolOption?.({
          bombRadius: parseInt((e.target as HTMLSelectElement).value, 10) as 1 | 2,
        });
      });
    } else {
      sec.innerHTML += `
        <label><span>十字臂长</span>
          <select id="tool-cross-arm">
            <option value="2" ${toolOptions.crossArm === 2 ? "selected" : ""}>5×5 十字</option>
            <option value="5" ${toolOptions.crossArm === 5 ? "selected" : ""}>10×10 十字</option>
          </select>
        </label>`;
      sec.querySelector("#tool-cross-arm")?.addEventListener("change", (e) => {
        onToolOption?.({
          crossArm: parseInt((e.target as HTMLSelectElement).value, 10) as 2 | 5,
        });
      });
    }
  } else if (
    toolOptions &&
    (toolOptions.tool === "arrow" || toolOptions.tool === "flipArrow") &&
    toolOptions.colorId != null
  ) {
    const sec = el.querySelector("#tool-options-section")! as HTMLElement;
    sec.innerHTML = `<h3>当前工具</h3><label><span>箭颜色</span><div id="tool-color-swatches"></div></label>`;
    appendColorSwatches(sec.querySelector("#tool-color-swatches")! as HTMLElement, toolOptions.colorId, (colorId) => {
      onToolOption?.({ colorId });
    });
  }

  const confirmResize = (field: "width" | "height", val: number) => {
    if (doc.itemModels.length > 0) {
      const ok = confirm("调整棋盘尺寸可能裁切/留白现有物件，是否继续？");
      if (!ok) return;
    }
    onMeta({ [field]: val });
  };

  el.querySelector("#meta-width")?.addEventListener("change", (e) => {
    confirmResize("width", parseInt((e.target as HTMLInputElement).value, 10));
  });
  el.querySelector("#meta-height")?.addEventListener("change", (e) => {
    confirmResize("height", parseInt((e.target as HTMLInputElement).value, 10));
  });
  el.querySelector("#meta-name")?.addEventListener("change", (e) => {
    onMeta({ name: (e.target as HTMLInputElement).value });
  });
  el.querySelector("#meta-duration")?.addEventListener("change", (e) => {
    onMeta({ durationInSec: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#meta-difficulty")?.addEventListener("change", (e) => {
    onMeta({ difficulty: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#meta-levelKind")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    onMeta({ levelKind: v ? parseInt(v, 10) : undefined });
  });
  el.querySelector("#meta-gameMode")?.addEventListener("change", (e) => {
    const mode = (e.target as HTMLSelectElement).value as "classic" | "rush";
    if (mode === "rush") {
      onMeta({
        gameMode: "rush",
        spawnIntervalSec: m.spawnIntervalSec ?? 25,
        spawnPool: m.spawnPool ?? defaultRushSpawnPool(),
        spawnWeightAdjust: m.spawnWeightAdjust ?? defaultSpawnWeightAdjustTiers(),
        levelGoals: m.levelGoals ?? defaultRushGoals(),
      });
    } else {
      onMeta({ gameMode: "classic" });
    }
  });
}

function renderRushMetaSection(
  el: HTMLElement,
  meta: EditorDocument["meta"],
  onMeta: MetaChangeHandler,
): void {
  const pool = meta.spawnPool ?? [];
  const goals = meta.levelGoals ?? [];
  const adjustTiers = meta.spawnWeightAdjust ?? defaultSpawnWeightAdjustTiers();
  const weightSum = spawnPoolWeightSum(pool);
  const weightClass = isSpawnWeightTotalValid(weightSum) ? "weight-ok" : "weight-bad";

  let adjustRows = "";
  for (let i = 0; i < adjustTiers.length; i++) {
    const tier = adjustTiers[i]!;
    adjustRows += `<tr data-adjust-idx="${i}">
      <td><input type="number" class="adjust-min" min="0" step="1" value="${tier.minElimCells}" /></td>
      <td><input type="number" class="adjust-buff" step="1" value="${tier.buffDelta}" /></td>
      <td><input type="number" class="adjust-arrow" min="0" step="1" value="${tier.arrowDelta}" /></td>
      <td><input type="number" class="adjust-mech" min="0" step="1" value="${tier.mechDelta}" /></td>
      <td><button type="button" class="adjust-del" data-idx="${i}">删</button></td>
    </tr>`;
  }

  let poolRows = "";
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i]!;
    poolRows += `<tr data-pool-idx="${i}">
      <td>${spawnPoolKindLabel(entry)}</td>
      <td><input type="number" class="pool-weight" min="0" step="1" value="${entry.weight}" /></td>
      <td>${spawnPoolVariantCell(entry, i)}</td>
      <td><button type="button" class="pool-del" data-idx="${i}">删</button></td>
    </tr>`;
  }

  let goalHtml = "";
  for (let gi = 0; gi < goals.length; gi++) {
    const g = goals[gi]!;
    if (g.type === "clearArrowCount") {
      goalHtml += `<div class="goal-row" data-goal-idx="${gi}">
        <span>消除箭数</span>
        <input type="number" class="goal-count" min="1" value="${g.count}" />
        <button type="button" class="goal-del" data-idx="${gi}">删</button>
      </div>`;
    } else {
      goalHtml += `<div class="goal-row" data-goal-idx="${gi}">
        <span>多色目标</span>
        <button type="button" class="goal-del" data-idx="${gi}">删</button>
        <div class="color-targets">`;
      for (let ti = 0; ti < g.targets.length; ti++) {
        const t = g.targets[ti]!;
        goalHtml += `<div class="color-target-row" data-goal-idx="${gi}" data-target-idx="${ti}">
        ${colorSwatchesPickerHtml(t.colorId, "goal-color-picker", { gi: String(gi), ti: String(ti) })}
        <input type="number" class="color-target-count" data-gi="${gi}" data-ti="${ti}" min="1" value="${t.count}" />
        <button type="button" class="goal-target-del" data-gi="${gi}" data-ti="${ti}">删</button>
      </div>`;
      }
      goalHtml += `<button type="button" class="add-color-target" data-gi="${gi}">+色</button></div></div>`;
    }
  }

  el.innerHTML = `
    <h3>爽快版配置</h3>
    <label><span>生成周期（秒）</span>
      <input type="number" id="meta-spawn-interval" min="1" value="${meta.spawnIntervalSec ?? 25}" />
    </label>
    <h4>生成池 <span class="${weightClass}">合计 ${spawnWeightSumPercent(weightSum).toFixed(1)}%（${weightSum.toFixed(0)}/1000）</span></h4>
    <table class="spawn-pool-table">
      <thead><tr><th>物件</th><th>权重</th><th>参数</th><th></th></tr></thead>
      <tbody>${poolRows}</tbody>
    </table>
    <div class="spawn-pool-actions">
      <select id="spawn-pool-add-kind">
        <option value="1">折线箭</option>
        <option value="2">翻转箭</option>
        <option value="4">反射角</option>
        <option value="17">区域炸弹 3×3</option>
        <option value="17b">区域炸弹 5×5</option>
        <option value="18">十字炸弹 5×5</option>
        <option value="18b">十字炸弹 10×10</option>
        <option value="19">燃烧弹</option>
        <option value="20">定向气球</option>
        <option value="21">黑洞</option>
        <option value="22">翻转按钮</option>
        <option value="23">糖果机</option>
      </select>
      <button type="button" id="spawn-pool-add">添加</button>
    </div>
    <h4>动态权重调整 <span style="color:var(--muted);font-size:11px;font-weight:normal">1000 分制，增量/减量均分给同类条目</span></h4>
    <table class="spawn-pool-table spawn-adjust-table">
      <thead><tr><th>≥消除格</th><th>增益+</th><th>箭头−</th><th>机制−</th><th></th></tr></thead>
      <tbody>${adjustRows}</tbody>
    </table>
    <div class="spawn-pool-actions">
      <button type="button" id="spawn-adjust-add">添加段</button>
      <button type="button" id="spawn-adjust-reset">恢复默认</button>
    </div>
    <h4>关卡目标</h4>
    <div id="goals-list">${goalHtml}</div>
    <div class="goal-actions">
      <button type="button" id="goal-add-count">+消除箭数</button>
      <button type="button" id="goal-add-color">+多色目标</button>
    </div>
  `;

  el.querySelector("#meta-spawn-interval")?.addEventListener("change", (e) => {
    onMeta({ spawnIntervalSec: parseInt((e.target as HTMLInputElement).value, 10) });
  });

  const updatePool = (next: SpawnPoolEntry[]) => {
    onMeta({ spawnPool: next });
  };

  const updateAdjustTiers = (next: SpawnWeightAdjustTier[]) => {
    onMeta({ spawnWeightAdjust: next });
  };

  const readAdjustTiersFromDom = (): SpawnWeightAdjustTier[] => {
    const rows = el.querySelectorAll<HTMLTableRowElement>("tr[data-adjust-idx]");
    return [...rows].map((row) => ({
      minElimCells: parseInt(
        row.querySelector<HTMLInputElement>(".adjust-min")?.value ?? "0",
        10,
      ),
      buffDelta: parseFloat(row.querySelector<HTMLInputElement>(".adjust-buff")?.value ?? "0") || 0,
      arrowDelta:
        parseFloat(row.querySelector<HTMLInputElement>(".adjust-arrow")?.value ?? "0") || 0,
      mechDelta:
        parseFloat(row.querySelector<HTMLInputElement>(".adjust-mech")?.value ?? "0") || 0,
    }));
  };

  el.querySelectorAll(".adjust-min, .adjust-buff, .adjust-arrow, .adjust-mech").forEach(
    (input) => {
      input.addEventListener("change", () => {
        updateAdjustTiers(readAdjustTiersFromDom());
      });
    },
  );

  el.querySelectorAll(".adjust-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx ?? "0", 10);
      if (adjustTiers.length <= 1) return;
      updateAdjustTiers(adjustTiers.filter((_, i) => i !== idx));
    });
  });

  el.querySelector("#spawn-adjust-add")?.addEventListener("click", () => {
    const last = adjustTiers[adjustTiers.length - 1];
    const nextMin = (last?.minElimCells ?? 0) + 30;
    updateAdjustTiers([
      ...adjustTiers,
      { minElimCells: nextMin, buffDelta: 0, arrowDelta: 0, mechDelta: 0 },
    ]);
  });

  el.querySelector("#spawn-adjust-reset")?.addEventListener("click", () => {
    updateAdjustTiers(defaultSpawnWeightAdjustTiers());
  });

  el.querySelectorAll(".pool-weight").forEach((input, idx) => {
    input.addEventListener("change", () => {
      const next = [...pool];
      const entry = { ...next[idx]! };
      entry.weight = parseFloat((input as HTMLInputElement).value) || 0;
      next[idx] = entry;
      updatePool(next);
    });
  });

  bindColorSwatchPicker(el, ".pool-color-picker", (_swatch, colorId) => {
    const picker = _swatch.closest(".pool-color-picker") as HTMLElement;
    const idx = parseInt(picker.dataset.idx ?? "0", 10);
    const next = [...pool];
    const entry = { ...next[idx]! };
    if (entry.kind === 1 || entry.kind === 2) {
      entry.colorId = colorId;
    }
    next[idx] = entry;
    updatePool(next);
  });

  el.querySelectorAll(".pool-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx ?? "0", 10);
      updatePool(pool.filter((_, i) => i !== idx));
    });
  });

  el.querySelector("#spawn-pool-add")?.addEventListener("click", () => {
    const v = (el.querySelector("#spawn-pool-add-kind") as HTMLSelectElement).value;
    const entry = parseSpawnPoolAddValue(v);
    const key = spawnPoolEntryKey(entry);
    if (pool.some((e) => spawnPoolEntryKey(e) === key)) {
      alert("生成池已有相同条目");
      return;
    }
    updatePool([...pool, entry]);
  });

  el.querySelector("#goal-add-count")?.addEventListener("click", () => {
    onMeta({
      levelGoals: [...goals, { type: "clearArrowCount", count: 10 }],
    });
  });

  el.querySelector("#goal-add-color")?.addEventListener("click", () => {
    onMeta({
      levelGoals: [
        ...goals,
        { type: "clearColorArrows", targets: [{ colorId: 7, count: 5 }] },
      ],
    });
  });

  el.querySelectorAll(".goal-count").forEach((input) => {
    input.addEventListener("change", () => {
      const row = (input as HTMLElement).closest(".goal-row");
      const idx = parseInt(row?.getAttribute("data-goal-idx") ?? "0", 10);
      const next = goals.map((g, i) =>
        i === idx && g.type === "clearArrowCount"
          ? { ...g, count: parseInt((input as HTMLInputElement).value, 10) }
          : g,
      );
      onMeta({ levelGoals: next });
    });
  });

  el.querySelectorAll(".goal-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx ?? "0", 10);
      onMeta({ levelGoals: goals.filter((_, i) => i !== idx) });
    });
  });

  el.querySelectorAll(".color-target-count").forEach((input) => {
    input.addEventListener("change", () => {
      const gi = parseInt((input as HTMLElement).dataset.gi ?? "0", 10);
      const ti = parseInt((input as HTMLElement).dataset.ti ?? "0", 10);
      const next = goals.map((g, i) => {
        if (i !== gi || g.type !== "clearColorArrows") return g;
        const targets = g.targets.map((t, j) =>
          j === ti ? { ...t, count: parseInt((input as HTMLInputElement).value, 10) } : t,
        );
        return { ...g, targets };
      });
      onMeta({ levelGoals: next });
    });
  });

  bindColorSwatchPicker(el, ".goal-color-picker", (_swatch, colorId) => {
    const picker = _swatch.closest(".goal-color-picker") as HTMLElement;
    const gi = parseInt(picker.dataset.gi ?? "0", 10);
    const ti = parseInt(picker.dataset.ti ?? "0", 10);
    const next = goals.map((g, i) => {
      if (i !== gi || g.type !== "clearColorArrows") return g;
      const targets = g.targets.map((t, j) => (j === ti ? { ...t, colorId } : t));
      return { ...g, targets };
    });
    onMeta({ levelGoals: next });
  });

  el.querySelectorAll(".goal-target-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gi = parseInt((btn as HTMLElement).dataset.gi ?? "0", 10);
      const ti = parseInt((btn as HTMLElement).dataset.ti ?? "0", 10);
      const next = goals.map((g, i) => {
        if (i !== gi || g.type !== "clearColorArrows") return g;
        return { ...g, targets: g.targets.filter((_, j) => j !== ti) };
      });
      onMeta({ levelGoals: next });
    });
  });

  el.querySelectorAll(".add-color-target").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gi = parseInt((btn as HTMLElement).dataset.gi ?? "0", 10);
      const next = goals.map((g, i) => {
        if (i !== gi || g.type !== "clearColorArrows") return g;
        return { ...g, targets: [...g.targets, { colorId: 3, count: 3 }] };
      });
      onMeta({ levelGoals: next });
    });
  });
}

function spawnPoolKindLabel(entry: SpawnPoolEntry): string {
  if (entry.kind === 1) return "折线箭";
  if (entry.kind === 2) return "翻转箭";
  if (entry.kind === 4) return "反射角";
  if (entry.kind === 17) return `区域炸弹 ${entry.bombRadius === 2 ? "5×5" : "3×3"}`;
  if (entry.kind === 18) return `十字炸弹 ${entry.crossArm === 5 ? "10×10" : "5×5"}`;
  if (entry.kind === 19) return "燃烧弹";
  if (entry.kind === 21) return "黑洞";
  if (entry.kind === 22) return "翻转按钮";
  if (entry.kind === 23) return "糖果机";
  return "定向气球";
}

function spawnPoolVariantCell(entry: SpawnPoolEntry, idx: number): string {
  if (entry.kind === 1 || entry.kind === 2) {
    return colorSwatchesPickerHtml(entry.colorId ?? 7, "pool-color-picker", { idx: String(idx) }, true);
  }
  return "—";
}

function parseSpawnPoolAddValue(v: string): SpawnPoolEntry {
  if (v === "17b") return { kind: 17, weight: 100, bombRadius: 2 };
  if (v === "18b") return { kind: 18, weight: 100, crossArm: 5 };
  const kind = parseInt(v, 10) as SpawnPoolKind;
  return defaultSpawnPoolEntry(kind);
}

function renderItemProps(
  el: HTMLElement,
  item: RawItem,
  onItem: PropsChangeHandler,
  onEnterZone: (zoneId: number) => void,
  onStartWallPath?: WallPathEditHandler,
  wallPathEdit?: WallPathEditState | null,
  onFinishWallPath?: () => void,
  onCancelWallPath?: () => void,
): void {
  const title = `Kind ${item.kind} — ${KIND_LABELS[item.kind] ?? "物件"} #${item.instanceId}`;
  let html = `<h3>${title}</h3>`;
  html += `<p style="color:var(--muted);font-size:11px">instanceId: ${item.instanceId} · layer: ${item.layer}</p>`;

  if (item.kind === 1) {
    html += `
      <label><span>方向</span>
        <select id="prop-direction">
          <option value="1" ${item.direction === 1 ? "selected" : ""}>下</option>
          <option value="2" ${item.direction === 2 ? "selected" : ""}>上</option>
          <option value="3" ${item.direction === 3 ? "selected" : ""}>右</option>
          <option value="4" ${item.direction === 4 ? "selected" : ""}>左</option>
        </select>
      </label>
      <label><span>颜色</span><div id="color-swatches"></div></label>
    `;
  } else if (item.kind === 2) {
    html += `
      <label><span>direction1（默认头）</span>
        <select id="prop-direction1">
          ${dirOptions(item.direction1 as number | undefined)}
        </select>
      </label>
      <label><span>direction2（翻转头）</span>
        <select id="prop-direction2">
          ${dirOptions(item.direction2 as number | undefined)}
        </select>
      </label>
      <label><span>颜色</span><div id="color-swatches"></div></label>
    `;
  } else if (item.kind === 4) {
    html += `<label><span>direction1</span><div class="dir-btn-group" id="d1-btns"></div></label>`;
    html += `<label><span>direction2</span><div class="dir-btn-group" id="d2-btns"></div></label>`;
    html += `
      <label><span>spin（°）</span>
        <select id="prop-spin">
          <option value="" ${item.spin == null ? "selected" : ""}>0（默认）</option>
          <option value="90" ${item.spin === 90 ? "selected" : ""}>90</option>
          <option value="180" ${item.spin === 180 ? "selected" : ""}>180</option>
          <option value="270" ${item.spin === 270 ? "selected" : ""}>270</option>
        </select>
      </label>
      <label><span>spinDirection</span>
        <select id="prop-spin-dir">
          <option value="0" ${(item.spinDirection ?? 0) === 0 ? "selected" : ""}>顺时针</option>
          <option value="1" ${item.spinDirection === 1 ? "selected" : ""}>逆时针</option>
        </select>
      </label>
    `;
  } else if (item.kind === 3) {
    html += `
      <label><span>血量</span><input type="number" id="prop-health" min="1" value="${item.health ?? 1}" /></label>
      <label><span>血量锚点索引</span><input type="number" id="prop-hvpi" min="0" value="${item.healthViewPathIndex ?? 0}" /></label>
    `;
  } else if (item.kind === 6) {
    html += `
      <label><span>血量</span><input type="number" id="prop-health" min="1" value="${item.health ?? 1}" /></label>
      <label><span>消除顺序 order</span><input type="number" id="prop-order" min="0" value="${item.order ?? 0}" /></label>
    `;
  } else if (item.kind === 5) {
    html += `
      <label><span>倒计时（秒）</span><input type="number" id="prop-time" min="1" value="${item.time ?? 10}" /></label>
      <p>绑定格: ${formatPositions(item.occupiedPositions)}</p>
    `;
  } else if (item.kind === 7) {
    const path = (item.movingPath as Vec2[] | undefined) ?? [];
    const isEditing = wallPathEdit?.instanceId === item.instanceId;
    html += `
      <label><span>每次移动格数</span><input type="number" id="prop-move-dist" min="1" value="${item.movingDistance ?? 1}" /></label>
      <label><span>移动方式</span>
        <select id="prop-move-type">
          <option value="1" ${item.movingType === 1 ? "selected" : ""}>往复循环</option>
          <option value="2" ${item.movingType === 2 ? "selected" : ""}>环绕循环</option>
        </select>
      </label>
      <p>路径 (${path.length} 点): ${formatPositions(path)}</p>
    `;
    if (isEditing) {
      html += `
        <p class="wall-path-hint">路径编辑中：在画布拖拽绘制，Enter 完成，Esc 取消</p>
        <p>草稿 (${wallPathEdit.draftLength} 点)</p>
        <div class="wall-path-actions">
          <button type="button" id="finish-wall-path" class="active">完成路径</button>
          <button type="button" id="cancel-wall-path">取消</button>
        </div>
      `;
    } else {
      html += `<button type="button" id="edit-wall-path">编辑路径</button>`;
    }
  } else if (item.kind === 13) {
    html += `
      <label><span>health</span><input type="number" id="prop-health" min="1" value="${item.health ?? 1}" /></label>
      <p>冻结区域: ${formatPositions(item.occupiedPositions)}</p>
    `;
  } else if (item.kind === 14) {
    const bind = item.bindCoordinate as Vec2 | undefined;
    html += `
      <label><span>shorten</span><input type="number" id="prop-shorten" min="1" value="${item.shorten ?? 1}" /></label>
      <p>bindCoordinate: [${bind?.[0] ?? "?"}, ${bind?.[1] ?? "?"}]</p>
      <p>路径: ${formatPositions(item.occupiedPositions)}</p>
    `;
  } else if (item.kind === 15) {
    html += `
      <label><span>groupID</span><input type="number" id="prop-group-id" min="1" value="${item.groupID ?? 1}" /></label>
      <label><span>direction</span>
        <select id="prop-direction">
          <option value="1" ${item.direction === 1 ? "selected" : ""}>1</option>
          <option value="2" ${item.direction === 2 ? "selected" : ""}>2</option>
        </select>
      </label>
    `;
  } else if (item.kind === 16) {
    html += `
      <label><span>groupID</span><input type="number" id="prop-group-id" min="1" value="${item.groupID ?? 1}" /></label>
      <p>bindInstanceId: ${item.bindInstanceId ?? "?"}</p>
    `;
  } else if (item.kind === 11) {
    const pos = item.occupiedPositions[0];
    html += `<p>绑定格: [${pos?.[0] ?? "?"}, ${pos?.[1] ?? "?"}]</p>`;
  } else if (item.kind === 12) {
    html += `<p>子项数量: ${item.items?.length ?? 0}</p>`;
    html += `<button type="button" id="enter-zone">进入子区域编辑</button>`;
  } else if (item.kind === 17) {
    html += `
      <label><span>区域大小</span>
        <select id="prop-bomb-radius">
          <option value="1" ${item.bombRadius === 1 ? "selected" : ""}>3×3</option>
          <option value="2" ${item.bombRadius === 2 ? "selected" : ""}>5×5</option>
        </select>
      </label>`;
  } else if (item.kind === 18) {
    html += `
      <label><span>十字臂长</span>
        <select id="prop-cross-arm">
          <option value="2" ${item.crossArm === 2 ? "selected" : ""}>5×5 十字</option>
          <option value="5" ${item.crossArm === 5 ? "selected" : ""}>10×10 十字</option>
        </select>
      </label>`;
  } else if (item.kind === 19 || item.kind === 20 || item.kind === 21 || item.kind === 22 || item.kind === 23) {
    const pos = item.occupiedPositions[0];
    html += `<p>位置: [${pos?.[0] ?? "?"}, ${pos?.[1] ?? "?"}]</p>`;
  }

  el.innerHTML = html;

  el.querySelector("#prop-direction")?.addEventListener("change", (e) => {
    onItem({ direction: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#prop-direction1")?.addEventListener("change", (e) => {
    onItem({ direction1: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#prop-direction2")?.addEventListener("change", (e) => {
    onItem({ direction2: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#prop-time")?.addEventListener("change", (e) => {
    onItem({ time: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-move-dist")?.addEventListener("change", (e) => {
    onItem({ movingDistance: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-move-type")?.addEventListener("change", (e) => {
    onItem({ movingType: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#edit-wall-path")?.addEventListener("click", () => {
    onStartWallPath?.(item.instanceId);
  });
  el.querySelector("#finish-wall-path")?.addEventListener("click", () => {
    onFinishWallPath?.();
  });
  el.querySelector("#cancel-wall-path")?.addEventListener("click", () => {
    onCancelWallPath?.();
  });
  el.querySelector("#prop-health")?.addEventListener("change", (e) => {
    onItem({ health: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-order")?.addEventListener("change", (e) => {
    onItem({ order: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-hvpi")?.addEventListener("change", (e) => {
    onItem({ healthViewPathIndex: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-shorten")?.addEventListener("change", (e) => {
    onItem({ shorten: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-group-id")?.addEventListener("change", (e) => {
    onItem({ groupID: parseInt((e.target as HTMLInputElement).value, 10) });
  });
  el.querySelector("#prop-spin")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    onItem({ spin: v ? parseInt(v, 10) : undefined });
  });
  el.querySelector("#prop-spin-dir")?.addEventListener("change", (e) => {
    onItem({ spinDirection: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#prop-bomb-radius")?.addEventListener("change", (e) => {
    onItem({ bombRadius: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#prop-cross-arm")?.addEventListener("change", (e) => {
    onItem({ crossArm: parseInt((e.target as HTMLSelectElement).value, 10) });
  });
  el.querySelector("#enter-zone")?.addEventListener("click", () => onEnterZone(item.instanceId));

  const sw = el.querySelector("#color-swatches");
  if (sw) {
    appendColorSwatches(sw as HTMLElement, item.colorId ?? 6, (colorId) => onItem({ colorId }));
  }

  bindDirBtns(el.querySelector("#d1-btns"), item.direction1 as [number, number] | undefined, (v) =>
    onItem({ direction1: v }),
  );
  bindDirBtns(el.querySelector("#d2-btns"), item.direction2 as [number, number] | undefined, (v) =>
    onItem({ direction2: v }),
  );
}

function bindDirBtns(
  container: Element | null,
  current: [number, number] | undefined,
  onPick: (v: [number, number]) => void,
): void {
  if (!container) return;
  const dirs: [string, [number, number]][] = [
    ["右", [1, 0]],
    ["左", [-1, 0]],
    ["上", [0, -1]],
    ["下", [0, 1]],
  ];
  for (const [label, vec] of dirs) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (current && current[0] === vec[0] && current[1] === vec[1]) b.classList.add("active");
    b.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
      b.classList.add("active");
      onPick(vec);
    });
    container.appendChild(b);
  }
}

function renderValidationList(el: HTMLElement, issues: ValidationIssue[]): void {
  if (issues.length === 0) return;
  const ul = document.createElement("ul");
  ul.className = "validation-list";
  for (const issue of issues.slice(0, 20)) {
    const li = document.createElement("li");
    li.className = issue.severity;
    li.textContent = issue.message;
    if (issue.instanceId != null) {
      li.dataset.instanceId = String(issue.instanceId);
    }
    ul.appendChild(li);
  }
  const h = document.createElement("h3");
  h.textContent = `校验 (${issues.length})`;
  el.appendChild(h);
  el.appendChild(ul);
}

function findInDoc(doc: EditorDocument, id: number): RawItem | null {
  function walk(items: RawItem[]): RawItem | null {
    for (const item of items) {
      if (item.instanceId === id) return item;
      if (item.items) {
        const f = walk(item.items);
        if (f) return f;
      }
    }
    return null;
  }
  return walk(doc.itemModels);
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function dirOptions(selected: number | undefined): string {
  const opts = [
    [1, "下"],
    [2, "上"],
    [3, "右"],
    [4, "左"],
  ] as const;
  return opts
    .map(
      ([v, label]) =>
        `<option value="${v}" ${selected === v ? "selected" : ""}>${label}</option>`,
    )
    .join("");
}

function formatPositions(positions: { 0: number; 1: number }[]): string {
  if (positions.length === 0) return "—";
  return positions.map((p) => `[${p[0]},${p[1]}]`).join(" ");
}
