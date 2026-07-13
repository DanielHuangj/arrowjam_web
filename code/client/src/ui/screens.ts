import type { LevelManifestEntry } from "../core/types.ts";
import { attachLevelThumbnails, prefetchLevelThumbnails } from "./level-thumbnails.ts";

export function formatLevelKindLabel(kinds: number[] | undefined): string {
  if (!kinds?.length) return "";
  return `（K${kinds.join("/")}）`;
}

export function renderLevelSelect(
  root: HTMLElement,
  manifest: {
    levels: LevelManifestEntry[];
    devTests?: LevelManifestEntry[];
    rushTests?: LevelManifestEntry[];
  },
  onSelect: (id: number) => void,
): void {
  root.innerHTML = `
    <div class="screen level-select">
      <h1>arrow_jaw</h1>
      <p class="subtitle">Arrow Jam 网页 Demo · 选择关卡</p>
      <div class="level-sections"></div>
    </div>
  `;

  const sections = root.querySelector(".level-sections")! as HTMLElement;

  const addSection = (title: string, levels: LevelManifestEntry[]) => {
    if (levels.length === 0) return;
    const section = document.createElement("section");
    section.className = "level-section";
    section.innerHTML = `<h2 class="level-section-title">${title}</h2><div class="level-grid"></div>`;
    const grid = section.querySelector(".level-grid")! as HTMLElement;
    for (const lv of levels) {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      const kindLabel = formatLevelKindLabel(lv.kinds);
      btn.innerHTML = `
      <div class="level-thumb-wrap">
        <canvas class="level-thumb" data-level-id="${lv.id}" aria-hidden="true"></canvas>
      </div>
      <div class="level-btn-footer">
        <span class="level-id">${lv.id}${kindLabel}</span>
        <span class="level-meta">${lv.width}×${lv.height}</span>
      </div>
    `;
      btn.title = `${lv.name || "Level " + lv.id}${kindLabel} · 难度 ${lv.difficulty}`;
      btn.addEventListener("click", () => onSelect(lv.id));
      grid.appendChild(btn);
    }
    sections.appendChild(section);
    attachLevelThumbnails(grid);
    prefetchLevelThumbnails(levels);
  };

  addSection("爽快版测试", manifest.rushTests ?? []);
  addSection("机制测试", manifest.devTests ?? []);
  addSection("主线关卡", manifest.levels);
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
          <button class="btn-random-vanish" type="button" title="随机消除最多 3 条当前可见、无捆绑/钥匙的箭">随机消除</button>
          <button class="btn-target-vanish" type="button" title="点选消除：点击一条可见、无捆绑/钥匙的箭">指定消除</button>
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
    bombRemaining?: number | null;
    rushGoals?: { label: string; current: number; target: number; done: boolean }[];
    spawnCountdownSec?: number | null;
  },
): void {
  hud.querySelector(".level-name")!.textContent =
    `${data.name} · 难度 ${data.difficulty}`;
  const sec = Math.ceil(data.remainingSeconds);
  const timerEl = hud.querySelector(".timer")!;
  const bombPart =
    data.bombRemaining != null
      ? ` · 💣 ${Math.ceil(data.bombRemaining)}s`
      : "";
  const spawnPart =
    data.spawnCountdownSec != null
      ? ` · 生成 ${Math.max(0, Math.ceil(data.spawnCountdownSec))}s`
      : "";
  timerEl.textContent = `⏱ ${sec}s${bombPart}${spawnPart}`;
  timerEl.classList.toggle("urgent", sec <= 10 || (data.bombRemaining ?? 99) <= 5);
  const goalText =
    data.rushGoals && data.rushGoals.length > 0
      ? data.rushGoals
          .map((g) => `${g.label} ${g.current}/${g.target}`)
          .join(" · ")
      : `🎯 剩余 ${data.arrowCount} 条箭`;
  hud.querySelector(".arrow-count")!.textContent = goalText;
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
