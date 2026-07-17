import { colorForId } from "../render/colors.ts";
import type { GoalProgress } from "../core/game/goal-tracker.ts";

function createRushGoalChip(goal: GoalProgress): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "rush-goal" + (goal.done ? " done" : "");

  if (goal.colorId != null) {
    chip.classList.add("rush-goal-color");
    const swatch = document.createElement("span");
    swatch.className = "rush-goal-swatch";
    swatch.style.background = colorForId(goal.colorId);
    swatch.setAttribute("aria-hidden", "true");
    chip.appendChild(swatch);
  } else {
    chip.classList.add("rush-goal-count");
    const label = document.createElement("span");
    label.className = "rush-goal-label";
    label.textContent = goal.label;
    chip.appendChild(label);
  }

  const progress = document.createElement("span");
  progress.className = "rush-goal-progress";
  progress.textContent = `${goal.current}/${goal.target}`;
  chip.appendChild(progress);
  return chip;
}

export function renderRushGoalsHost(
  host: HTMLElement,
  rushGoals: GoalProgress[] | undefined,
  fallbackArrowCount: number,
): void {
  host.replaceChildren();
  if (!rushGoals?.length) {
    host.className = "arrow-count";
    host.textContent = `🎯 剩余 ${fallbackArrowCount} 条箭`;
    return;
  }

  host.className = "arrow-count rush-goals";
  for (let i = 0; i < rushGoals.length; i++) {
    if (i > 0) host.appendChild(document.createTextNode(" · "));
    host.appendChild(createRushGoalChip(rushGoals[i]!));
  }
}

export function rushGoalsSummaryHtml(goals: GoalProgress[]): string {
  return goals
    .map((g) => {
      if (g.colorId != null) {
        const hex = colorForId(g.colorId);
        const done = g.done ? " done" : "";
        return `<span class="rush-goal rush-goal-color${done}"><span class="rush-goal-swatch" style="background:${hex}" aria-hidden="true"></span><span class="rush-goal-progress">${g.current}/${g.target}</span></span>`;
      }
      const done = g.done ? " done" : "";
      return `<span class="rush-goal rush-goal-count${done}"><span class="rush-goal-label">${g.label}</span><span class="rush-goal-progress">${g.current}/${g.target}</span></span>`;
    })
    .join(" · ");
}
