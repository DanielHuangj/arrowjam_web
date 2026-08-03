import type { ArrowItem, LevelGoal } from "../types.ts";

export interface GoalProgress {
  label: string;
  /** 多色目标：用色块展示，不用 label 中的颜色编号 */
  colorId?: number;
  current: number;
  target: number;
  done: boolean;
}

export class GoalTracker {
  private readonly goals: LevelGoal[];
  private readonly enabled: boolean;
  private clearArrowCount = 0;
  private readonly colorCounts = new Map<number, number>();

  constructor(goals: LevelGoal[] | undefined, enabled: boolean) {
    this.goals = goals ?? [];
    this.enabled = enabled;
    for (const goal of this.goals) {
      if (goal.type === "clearColorArrows") {
        for (const t of goal.targets) {
          if (!this.colorCounts.has(t.colorId)) {
            this.colorCounts.set(t.colorId, 0);
          }
        }
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.goals.length > 0;
  }

  onEliminationCredit(colorId: number, count = 1): void {
    if (!this.enabled) return;
    this.clearArrowCount += count;
    const prev = this.colorCounts.get(colorId) ?? 0;
    this.colorCounts.set(colorId, prev + count);
  }

  onEliminationBatch(removed: ArrowItem[]): void {
    for (const arrow of removed) {
      this.onEliminationCredit(arrow.colorId, 1);
    }
  }

  isMet(): boolean {
    if (!this.enabled) return false;
    for (const goal of this.goals) {
      if (goal.type === "clearArrowCount") {
        if (this.clearArrowCount < goal.count) return false;
      } else if (goal.type === "clearColorArrows") {
        for (const t of goal.targets) {
          if ((this.colorCounts.get(t.colorId) ?? 0) < t.count) return false;
        }
      }
    }
    return true;
  }

  getProgress(): GoalProgress[] {
    const out: GoalProgress[] = [];
    for (const goal of this.goals) {
      if (goal.type === "clearArrowCount") {
        out.push({
          label: "",
          /** 0 = 通用色 icon */
          colorId: 0,
          current: this.clearArrowCount,
          target: goal.count,
          done: this.clearArrowCount >= goal.count,
        });
      } else if (goal.type === "clearColorArrows") {
        for (const t of goal.targets) {
          const current = this.colorCounts.get(t.colorId) ?? 0;
          out.push({
            label: "",
            colorId: t.colorId,
            current,
            target: t.count,
            done: current >= t.count,
          });
        }
      }
    }
    return out;
  }

  /** 首个「消除箭数」目标；无则 null（能量球不显示） */
  getClearArrowCountGoal(): { current: number; target: number } | null {
    if (!this.enabled) return null;
    for (const goal of this.goals) {
      if (goal.type === "clearArrowCount") {
        return { current: this.clearArrowCount, target: goal.count };
      }
    }
    return null;
  }
}
