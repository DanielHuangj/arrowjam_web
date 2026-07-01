import type { EditorDocument, RawItem, ValidationIssue } from "@arrowjaw/shared";
import { BOARD_MAX_SIZE, BOARD_MIN_SIZE } from "../board-limits.ts";

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
};

const COLORS = [
  { id: 3, hex: "#ff6b6b" },
  { id: 4, hex: "#e599f7" },
  { id: 6, hex: "#51cf66" },
  { id: 7, hex: "#4dabf7" },
];

export type PropsChangeHandler = (patch: Record<string, unknown>) => void;
export type MetaChangeHandler = (patch: Partial<EditorDocument["meta"]>) => void;
export type WallPathEditHandler = (instanceId: number) => void;
export type WallPathEditState = {
  instanceId: number;
  draftLength: number;
};

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
): void {
  el.innerHTML = "";

  if (doc.selectedInstanceIds.length === 0) {
    renderLevelMeta(el, doc, onMeta);
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
): void {
  const m = doc.meta;
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
    <label><span>关卡类型</span>
      <select id="meta-levelKind">
        <option value="" ${m.levelKind == null ? "selected" : ""}>未设置</option>
        <option value="1" ${m.levelKind === 1 ? "selected" : ""}>主线</option>
        <option value="2" ${m.levelKind === 2 ? "selected" : ""}>普通</option>
      </select>
    </label>
  `;

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
  el.querySelector("#enter-zone")?.addEventListener("click", () => onEnterZone(item.instanceId));

  const sw = el.querySelector("#color-swatches");
  if (sw) {
    for (const c of COLORS) {
      const d = document.createElement("span");
      d.className = `color-swatch${item.colorId === c.id ? " selected" : ""}`;
      d.style.background = c.hex;
      d.title = `colorId ${c.id}`;
      d.addEventListener("click", () => onItem({ colorId: c.id }));
      sw.appendChild(d);
    }
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
