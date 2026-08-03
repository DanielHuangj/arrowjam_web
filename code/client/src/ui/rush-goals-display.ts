import { colorForId } from "../render/colors.ts";
import type { GoalProgress } from "../core/game/goal-tracker.ts";

function createGoalIconChip(goal: GoalProgress): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "rush-goal rush-goal-icon" + (goal.done ? " done" : "");

  const swatch = document.createElement("span");
  swatch.className = "rush-goal-swatch";
  swatch.setAttribute("aria-hidden", "true");
  // colorId 0 / 缺省 → 通用色 icon；其余用箭色色块
  if (goal.colorId == null || goal.colorId === 0) {
    swatch.classList.add("generic");
    swatch.title = "通用色";
  } else {
    swatch.style.background = colorForId(goal.colorId);
  }
  chip.appendChild(swatch);

  const progress = document.createElement("span");
  progress.className = "rush-goal-progress";
  progress.textContent = `${goal.current}/${goal.target}`;
  chip.appendChild(progress);
  return chip;
}

/** 关卡目标：全部 icon + 数量 */
export function renderRushGoalsHost(
  host: HTMLElement,
  rushGoals: GoalProgress[] | undefined,
  fallbackArrowCount: number,
): void {
  host.replaceChildren();
  if (!rushGoals?.length) {
    host.className = "board-status-goals-host";
    host.textContent = `剩余 ${fallbackArrowCount}`;
    return;
  }

  host.className = "board-status-goals-host rush-goals";
  for (let i = 0; i < rushGoals.length; i++) {
    if (i > 0) host.appendChild(document.createTextNode(" "));
    host.appendChild(createGoalIconChip(rushGoals[i]!));
  }
}

export function rushGoalsSummaryHtml(goals: GoalProgress[]): string {
  return goals
    .map((g) => {
      const done = g.done ? " done" : "";
      if (g.colorId == null || g.colorId === 0) {
        return `<span class="rush-goal rush-goal-icon${done}"><span class="rush-goal-swatch generic" aria-hidden="true"></span><span class="rush-goal-progress">${g.current}/${g.target}</span></span>`;
      }
      const hex = colorForId(g.colorId);
      return `<span class="rush-goal rush-goal-icon${done}"><span class="rush-goal-swatch" style="background:${hex}" aria-hidden="true"></span><span class="rush-goal-progress">${g.current}/${g.target}</span></span>`;
    })
    .join(" ");
}

export interface BoardStatusData {
  remainingSeconds: number;
  spawnCountdownSec?: number | null;
  rushGoals?: GoalProgress[];
  bombRemaining?: number | null;
  /** 非 rush 时目标区显示剩余箭数 */
  arrowCount?: number;
  isRush: boolean;
}

const STATUS_GAP_PX = 8;

function statusBarStage(boardWrap: HTMLElement): HTMLElement | null {
  return boardWrap.parentElement;
}

export function ensureBoardStatusBar(boardWrap: HTMLElement): HTMLElement {
  const stage = statusBarStage(boardWrap);
  if (!stage) throw new Error("board-wrap 缺少父级");

  let bar = stage.querySelector(
    ":scope > .board-status-bar",
  ) as HTMLElement | null;
  if (bar) return bar;

  bar = document.createElement("div");
  bar.className = "board-status-bar";
  bar.innerHTML = `
    <span class="board-status-item board-status-time">关卡时间：<span class="board-status-val">—</span></span>
    <span class="board-status-item board-status-spawn hidden">刷新时间：<span class="board-status-val">—</span></span>
    <span class="board-status-item board-status-goals">关卡目标：<span class="board-status-goals-host"></span></span>
  `;
  // 与能量球相同：挂在 stage 上，相对 canvas 绝对定位
  boardWrap.insertAdjacentElement("afterend", bar);
  return bar;
}

/** 紧贴棋盘 canvas 上沿外侧（与能量球贴右缘同理） */
export function layoutBoardStatusBar(boardWrap: HTMLElement): void {
  const bar = ensureBoardStatusBar(boardWrap);
  const stage = statusBarStage(boardWrap);
  const canvas = boardWrap.querySelector("canvas");
  if (!stage || !canvas) return;

  const stageRect = stage.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const h = Math.max(bar.offsetHeight, 28);
  bar.style.left = `${canvasRect.left - stageRect.left}px`;
  bar.style.top = `${canvasRect.top - stageRect.top - h - STATUS_GAP_PX}px`;
  bar.style.width = `${Math.max(0, canvasRect.width)}px`;
}

export function updateBoardStatusBar(
  boardWrap: HTMLElement,
  data: BoardStatusData,
): void {
  const bar = ensureBoardStatusBar(boardWrap);
  const timeVal = bar.querySelector(
    ".board-status-time .board-status-val",
  ) as HTMLElement | null;
  const spawnItem = bar.querySelector(".board-status-spawn") as HTMLElement | null;
  const spawnVal = bar.querySelector(
    ".board-status-spawn .board-status-val",
  ) as HTMLElement | null;
  const goalsHost = bar.querySelector(
    ".board-status-goals-host",
  ) as HTMLElement | null;
  if (!timeVal || !spawnItem || !spawnVal || !goalsHost) {
    bar.remove();
    updateBoardStatusBar(boardWrap, data);
    return;
  }

  const sec = Math.ceil(data.remainingSeconds);
  let timeText = String(Math.max(0, sec));
  if (data.bombRemaining != null) {
    timeText += `（💣${Math.ceil(data.bombRemaining)}）`;
  }
  timeVal.textContent = timeText;
  timeVal.classList.toggle(
    "urgent",
    sec <= 10 || (data.bombRemaining ?? 99) <= 5,
  );

  if (data.isRush && data.spawnCountdownSec != null) {
    spawnItem.classList.remove("hidden");
    spawnVal.textContent = String(Math.max(0, Math.ceil(data.spawnCountdownSec)));
  } else {
    spawnItem.classList.add("hidden");
  }

  if (data.isRush) {
    renderRushGoalsHost(goalsHost, data.rushGoals, data.arrowCount ?? 0);
  } else {
    goalsHost.className = "board-status-goals-host";
    goalsHost.textContent = `剩余 ${data.arrowCount ?? 0}`;
  }

  layoutBoardStatusBar(boardWrap);
}

export function clearBoardStatusBar(boardWrap: HTMLElement): void {
  statusBarStage(boardWrap)
    ?.querySelector(":scope > .board-status-bar")
    ?.remove();
}
