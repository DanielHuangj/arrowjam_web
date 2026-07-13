import type { GameState } from "@arrowjaw/client/core/game/game-state.ts";
import { updateHud } from "@arrowjaw/client/ui/screens.ts";

export function mountPlayHud(root: HTMLElement): void {
  root.innerHTML = `
    <div class="play-hud-inner">
      <div class="play-hud-info">
        <span class="level-name"></span>
        <span class="timer"></span>
        <span class="arrow-count"></span>
      </div>
    </div>
  `;
}

export function updatePlayHud(root: HTMLElement, gs: GameState): void {
  updateHud(root, {
    name: gs.level.name,
    remainingSeconds: gs.remainingSeconds,
    arrowCount: gs.arrows.length,
    difficulty: gs.level.difficulty,
    bombRemaining: gs.getUrgentBombRemaining(),
    rushGoals: gs.isRushLevel() ? gs.getGoalProgress() : undefined,
    spawnCountdownSec: gs.isRushLevel() ? gs.getSpawnCountdownSec() : null,
  });
}

export function showPlayResultModal(
  overlay: HTMLElement,
  gs: GameState,
  actions: { label: string; primary?: boolean; onClick: () => void }[],
): void {
  let title: string;
  let body: string;

  if (gs.phase === "won") {
    title = "胜利！";
    const sec = Math.ceil(gs.remainingSeconds);
    if (gs.isRushLevel()) {
      const goals = gs
        .getGoalProgress()
        .map((g) => `${g.label} ${g.current}/${g.target}`)
        .join(" · ");
      body = `目标达成 · 剩余时间 ${sec}s${goals ? ` · ${goals}` : ""}`;
    } else {
      body = `剩余时间 ${sec}s · 误操作 ${gs.mistakeCount} 次`;
    }
  } else {
    const reason = gs.getLostReason();
    title = reason === "bomb" ? "炸弹爆炸！" : "时间到";
    if (gs.isRushLevel() && reason !== "bomb") {
      const pending = gs
        .getGoalProgress()
        .filter((g) => !g.done)
        .map((g) => `${g.label} ${g.current}/${g.target}`)
        .join(" · ");
      body = pending ? `未达成目标：${pending}` : `还有 ${gs.arrows.length} 条箭未清除`;
    } else {
      body =
        reason === "bomb"
          ? `定时炸弹引爆 · 还有 ${gs.arrows.length} 条箭未清除`
          : `还有 ${gs.arrows.length} 条箭未清除`;
    }
  }

  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="play-result-modal">
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="play-result-actions"></div>
    </div>
  `;
  const actionsEl = overlay.querySelector(".play-result-actions")!;
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = action.primary ? "primary" : "";
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    actionsEl.appendChild(btn);
  }
}

export function hidePlayResultModal(overlay: HTMLElement): void {
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}
