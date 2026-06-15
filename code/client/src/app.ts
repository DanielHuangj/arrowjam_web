import type { GameState } from "./core/game/game-state.ts";
import type { BoardRenderer } from "./render/board-renderer.ts";
import { InputHandler } from "./render/input-handler.ts";
import {
  hideModal,
  renderGameShell,
  renderLevelSelect,
  showLoading,
  showModal,
  updateHud,
} from "./ui/screens.ts";
import { loadLevel, loadManifest } from "./core/level/loader.ts";
import type { LevelManifestEntry } from "./core/types.ts";

const ANIM_INTERVAL_MS = 40;

export class App {
  private root: HTMLElement;
  private state: GameState | null = null;
  private renderer: BoardRenderer | null = null;
  private input: InputHandler | null = null;
  private hudEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private levels: LevelManifestEntry[] = [];
  private rafId = 0;
  private lastTime = 0;
  private animAccum = 0;
  private modalShown = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(): Promise<void> {
    showLoading(this.root);
    const manifest = await loadManifest();
    this.levels = manifest.levels;
    this.showLevelSelect();
  }

  private showLevelSelect(): void {
    this.stopLoop();
    this.disposeGame();
    renderLevelSelect(this.root, this.levels, (id) => void this.startLevel(id));
  }

  private async startLevel(id: number): Promise<void> {
    this.stopLoop();
    this.input?.dispose();
    this.input = null;
    showLoading(this.root);
    try {
      const level = await loadLevel(id);
      const { GameState } = await import("./core/game/game-state.ts");
      this.state = new GameState(level);

      const shell = renderGameShell(this.root);
      this.hudEl = shell.hud;
      this.overlayEl = shell.overlay;
      this.canvas = shell.canvas;
      this.renderer = new (
        await import("./render/board-renderer.ts")
      ).BoardRenderer(this.canvas, "game");

      shell.hud.querySelector(".btn-back")!.addEventListener("click", () => {
        this.showLevelSelect();
      });

      shell.hud.querySelector(".btn-add-time")!.addEventListener("click", () => {
        this.state?.addTime(100);
      });

      shell.hud.querySelector(".btn-auto-clear")!.addEventListener("click", () => {
        this.tryAutoClear();
      });

      this.input = new InputHandler(
        this.canvas,
        () => this.state,
        this.renderer,
      );

      // 调试：卡死时在控制台执行 __arrowJawDebug()
      (window as unknown as { __arrowJawDebug?: () => unknown }).__arrowJawDebug =
        () => {
          const s = this.state;
          if (!s) return "no state — 请先进入一关";
          return {
            phase: s.phase,
            animation: s.animation,
            arrowCount: s.arrows.length,
            mistakeCount: s.mistakeCount,
            remainingSeconds: s.remainingSeconds,
          };
        };

      this.modalShown = false;
      this.lastTime = performance.now();
      this.animAccum = 0;
      this.startLoop();
    } catch (err) {
      this.root.innerHTML = `<div class="screen error"><p>加载失败: ${String(err)}</p><button id="retry">返回选关</button></div>`;
      this.root.querySelector("#retry")!.addEventListener("click", () => this.showLevelSelect());
    }
  }

  private startLoop(): void {
    this.stopLoop();
    const tick = (now: number) => {
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;

      if (this.state) {
        this.state.tick(dt);

        if (this.state.phase === "animating") {
          this.animAccum += dt * 1000;
          let advanced = false;
          while (this.animAccum >= ANIM_INTERVAL_MS) {
            this.state.advanceAnimation();
            this.animAccum -= ANIM_INTERVAL_MS;
            advanced = true;
            if (this.state.phase !== "animating") {
              this.animAccum = 0;
              break;
            }
          }
          // 保证每帧至少推进一步，避免 animAccum 阈值导致动画卡死
          if (this.state.phase === "animating" && !advanced) {
            this.state.advanceAnimation();
          }
          this.state.recoverAnimationState();
        }

        this.renderFrame();
        this.checkEndState();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.animAccum = 0;
  }

  private renderFrame(): void {
    if (!this.state || !this.renderer || !this.hudEl) return;

    updateHud(this.hudEl, {
      name: this.state.level.name,
      remainingSeconds: this.state.remainingSeconds,
      arrowCount: this.state.arrows.length,
      difficulty: this.state.level.difficulty,
    });

    const autoBtn = this.hudEl.querySelector(".btn-auto-clear") as HTMLButtonElement | null;
    if (autoBtn) {
      const canAuto =
        this.state.phase === "playing" && this.state.getLaunchableIds().size > 0;
      autoBtn.disabled = !canAuto;
    }

    const launchable = this.state.getLaunchableIds();
    const hidden = this.state.getPipeHiddenArrowIds();
    const visible = (arrows: typeof this.state.arrows) =>
      arrows.filter((a) => !hidden.has(a.instanceId));

    this.renderer.drawBoard(
      this.state.level,
      launchable,
      this.state.zoneManager.getZones(),
      visible(this.state.getDrawableRevealedZoneArrows()),
      this.state.getRevealedZoneCorners(),
      this.state.getDrawableRevealedZoneBundles(),
      this.state.getRevealedZonePipes(),
      visible(this.state.getDrawableTopLevelArrows()),
      this.state.getTopLevelCorners(),
      this.state.getDrawableTopLevelBundles(),
      this.state.getTopLevelPipes(),
      this.state.getVisibleKeys(),
      this.state.getActiveCurtainsForRender(),
      {
        style: "game",
        clearedTraces: this.state.getClearedTraceCells(),
        occupiedCells: this.state.getOccupiedArrowCellKeys(),
      },
    );
  }

  private tryAutoClear(): void {
    if (!this.state) return;
    this.state.tryAutoLaunch();
  }

  private checkEndState(): void {
    if (!this.state || !this.overlayEl || this.modalShown) return;
    if (this.state.phase === "won") {
      this.modalShown = true;
      const sec = Math.ceil(this.state.remainingSeconds);
      showModal(
        this.overlayEl,
        "胜利！",
        `剩余时间 ${sec}s · 误操作 ${this.state.mistakeCount} 次`,
        [
          {
            label: "重玩",
            onClick: () => {
              hideModal(this.overlayEl!);
              void this.startLevel(this.state!.level.id);
            },
          },
          {
            label: "下一关",
            primary: true,
            onClick: () => {
              hideModal(this.overlayEl!);
              const next = this.levels.find((l) => l.id === this.state!.level.id + 1);
              if (next) void this.startLevel(next.id);
              else this.showLevelSelect();
            },
          },
          {
            label: "选关",
            onClick: () => {
              hideModal(this.overlayEl!);
              this.showLevelSelect();
            },
          },
        ],
      );
    } else if (this.state.phase === "lost") {
      this.modalShown = true;
      showModal(
        this.overlayEl,
        "时间到",
        `还有 ${this.state.arrows.length} 条箭未清除`,
        [
          {
            label: "重玩",
            primary: true,
            onClick: () => {
              hideModal(this.overlayEl!);
              void this.startLevel(this.state!.level.id);
            },
          },
          {
            label: "选关",
            onClick: () => {
              hideModal(this.overlayEl!);
              this.showLevelSelect();
            },
          },
        ],
      );
    }
  }

  private disposeGame(): void {
    this.stopLoop();
    this.input?.dispose();
    this.input = null;
    this.renderer = null;
    this.state = null;
    this.hudEl = null;
    this.overlayEl = null;
    this.canvas = null;
    this.modalShown = false;
  }
}
