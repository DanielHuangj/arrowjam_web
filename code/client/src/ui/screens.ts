import type { LevelManifestEntry } from "../core/types.ts";

export function renderLevelSelect(
  root: HTMLElement,
  levels: LevelManifestEntry[],
  onSelect: (id: number) => void,
): void {
  root.innerHTML = `
    <div class="screen level-select">
      <h1>arrow_jaw</h1>
      <p class="subtitle">Arrow Jam 网页 Demo · 选择关卡</p>
      <div class="level-grid"></div>
    </div>
  `;

  const grid = root.querySelector(".level-grid")!;
  for (const lv of levels) {
    const btn = document.createElement("button");
    const badge = lv.pureKind1
      ? "P0"
      : lv.p4Playable
        ? "P4"
        : lv.p3Playable
          ? "P3"
          : lv.p2Playable
            ? "P2"
            : lv.p1Playable
              ? "P1"
              : "";
    btn.className = "level-btn" + (badge ? " playable" : "");
    btn.innerHTML = `
      <span class="level-id">${lv.id}</span>
      <span class="level-meta">${lv.width}×${lv.height}</span>
      ${badge ? `<span class="badge">${badge}</span>` : ""}
    `;
    btn.title = `${lv.name || "Level " + lv.id} · 难度 ${lv.difficulty}`;
    btn.addEventListener("click", () => onSelect(lv.id));
    grid.appendChild(btn);
  }
}

export function renderGameShell(root: HTMLElement): {
  hud: HTMLElement;
  boardWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
} {
  root.innerHTML = `
    <div class="screen game">
      <header class="hud">
        <button class="btn-back" type="button">← 选关</button>
        <div class="hud-info">
          <span class="level-name"></span>
          <span class="timer"></span>
          <span class="arrow-count"></span>
        </div>
        <div class="hud-actions">
          <button class="btn-auto-clear" type="button" title="自动消除一条当前无阻挡、可立即出界的箭">自动消除</button>
          <button class="btn-add-time" type="button" title="测试用：增加 100 秒">+100s</button>
        </div>
      </header>
      <div class="board-wrap">
        <canvas id="board"></canvas>
      </div>
      <div class="overlay hidden"></div>
    </div>
  `;

  return {
    hud: root.querySelector(".hud")!,
    boardWrap: root.querySelector(".board-wrap")!,
    canvas: root.querySelector("#board") as HTMLCanvasElement,
    overlay: root.querySelector(".overlay")!,
  };
}

export function updateHud(
  hud: HTMLElement,
  data: {
    name: string;
    remainingSeconds: number;
    arrowCount: number;
    difficulty: number;
  },
): void {
  hud.querySelector(".level-name")!.textContent =
    `${data.name} · 难度 ${data.difficulty}`;
  const sec = Math.ceil(data.remainingSeconds);
  const timerEl = hud.querySelector(".timer")!;
  timerEl.textContent = `⏱ ${sec}s`;
  timerEl.classList.toggle("urgent", sec <= 10);
  hud.querySelector(".arrow-count")!.textContent =
    `🎯 剩余 ${data.arrowCount} 条箭`;
}

export function showModal(
  overlay: HTMLElement,
  title: string,
  body: string,
  actions: { label: string; primary?: boolean; onClick: () => void }[],
): void {
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="modal-actions"></div>
    </div>
  `;
  const actionsEl = overlay.querySelector(".modal-actions")!;
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.className = "btn" + (action.primary ? " primary" : "");
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    actionsEl.appendChild(btn);
  }
}

export function hideModal(overlay: HTMLElement): void {
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}

export function showLoading(root: HTMLElement): void {
  root.innerHTML = `<div class="screen loading"><p>加载关卡…</p></div>`;
}
