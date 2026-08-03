import type { GameState } from "./core/game/game-state.ts";
import type { BoardRenderer } from "./render/board-renderer.ts";
import { attachBoardViewport, type BoardViewportHandle } from "./render/board-viewport.ts";
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
import { tickGameAnimation } from "./core/game/anim-timing.ts";
import type { SpawnEmergence } from "./core/mechanics/spawn.ts";
import { updateComboOverlay } from "./ui/combo-overlay.ts";
import { clearBingoOverlay, updateBingoOverlay } from "./ui/bingo-overlay.ts";
import {
  clearEnergyOrb,
  getEnergyOrbBoardOrigin,
  updateEnergyOrb,
} from "./ui/energy-orb.ts";
import {
  clearBoardStatusBar,
  updateBoardStatusBar,
} from "./ui/rush-goals-display.ts";

export class App {
  private root: HTMLElement;
  private state: GameState | null = null;
  private renderer: BoardRenderer | null = null;
  private input: InputHandler | null = null;
  private hudEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private levels: LevelManifestEntry[] = [];
  private devTests: LevelManifestEntry[] = [];
  private rushTests: LevelManifestEntry[] = [];
  private rafId = 0;
  private lastTime = 0;
  private modalShown = false;
  private targetVanishMode = false;
  private targetVanishHoverInvalid = false;
  private boardWrapEl: HTMLElement | null = null;
  private boardViewport: BoardViewportHandle | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(): Promise<void> {
    showLoading(this.root);
    const manifest = await loadManifest();
    this.levels = manifest.levels;
    this.devTests = manifest.devTests ?? [];
    this.rushTests = manifest.rushTests ?? [];
    this.showLevelSelect();
  }

  private showLevelSelect(): void {
    this.stopLoop();
    this.disposeGame();
    if (this.boardWrapEl) {
      updateComboOverlay(this.boardWrapEl, null);
      clearBingoOverlay(this.boardWrapEl);
      clearEnergyOrb(this.boardWrapEl);
      clearBoardStatusBar(this.boardWrapEl);
    }
    renderLevelSelect(
      this.root,
      { levels: this.levels, devTests: this.devTests, rushTests: this.rushTests },
      (id) => void this.startLevel(id),
    );
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
      this.boardWrapEl = shell.boardWrap;
      this.targetVanishMode = false;
      this.boardViewport?.dispose();
      this.boardViewport = attachBoardViewport(shell.boardWrap, this.canvas);
      requestAnimationFrame(() => {
        this.boardViewport?.reset(level);
      });
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

      shell.hud.querySelector(".btn-random-vanish")!.addEventListener("click", () => {
        this.tryRandomVanish();
      });

      shell.hud.querySelector(".btn-target-vanish")!.addEventListener("click", () => {
        this.toggleTargetVanishMode();
      });

      const rush = level.gameMode === "rush";
      shell.hud.querySelector(".btn-auto-clear")!.classList.toggle("hidden", rush);
      shell.hud.querySelector(".btn-random-vanish")!.classList.toggle("hidden", rush);
      shell.hud.querySelector(".btn-target-vanish")!.classList.toggle("hidden", rush);

      this.input = new InputHandler(
        this.canvas,
        () => this.state,
        () => this.boardViewport!.getState(),
        () => this.boardViewport!.consumePanClick(),
        () => this.targetVanishMode,
        (invalid) => {
          this.targetVanishHoverInvalid = invalid;
        },
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

        if (this.state.phase === "animating" || this.state.phase === "celebrating") {
          tickGameAnimation(this.state, dt * 1000);
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
  }

  private renderFrame(): void {
    if (!this.state || !this.renderer || !this.hudEl) return;

    if (this.state.phase !== "playing") {
      this.targetVanishMode = false;
      this.targetVanishHoverInvalid = false;
    }

    updateHud(this.hudEl, {
      name: this.state.level.name,
      remainingSeconds: this.state.remainingSeconds,
      arrowCount: this.state.arrows.length,
      difficulty: this.state.level.difficulty,
      bombRemaining: this.state.getUrgentBombRemaining(),
      rushGoals: this.state.isRushLevel()
        ? this.state.getGoalProgress()
        : undefined,
      spawnCountdownSec: this.state.isRushLevel()
        ? this.state.getSpawnCountdownSec()
        : null,
    });
    if (this.boardWrapEl) {
      const rush = this.state.isRushLevel();
      updateBoardStatusBar(this.boardWrapEl, {
        remainingSeconds: this.state.remainingSeconds,
        spawnCountdownSec: rush ? this.state.getSpawnCountdownSec() : null,
        rushGoals: rush ? this.state.getGoalProgress() : undefined,
        bombRemaining: this.state.getUrgentBombRemaining(),
        arrowCount: this.state.arrows.length,
        isRush: rush,
      });
    }
    updateComboOverlay(
      this.boardWrapEl,
      this.state.isRushLevel() ? this.state.getComboHudState() : null,
    );
    if (this.boardWrapEl) {
      updateEnergyOrb(this.boardWrapEl, this.state.getEnergyOrbHud());
      updateBingoOverlay(this.boardWrapEl, this.state.getBingoHudState());
      if (this.canvas && this.boardViewport) {
        const origin = getEnergyOrbBoardOrigin(
          this.boardWrapEl,
          this.canvas,
          this.boardViewport.getState(),
        );
        if (origin) this.state.setCelebrationOrbOrigin(origin.x, origin.y);
      }
    }

    const autoBtn = this.hudEl.querySelector(".btn-auto-clear") as HTMLButtonElement | null;
    if (autoBtn) {
      const canAuto =
        this.state.phase === "playing" && this.state.getLaunchableIds().size > 0;
      autoBtn.disabled = !canAuto;
    }

    const vanishBtn = this.hudEl.querySelector(".btn-random-vanish") as HTMLButtonElement | null;
    if (vanishBtn) {
      const canVanish =
        this.state.phase === "playing" &&
        this.state.getRandomVanishCandidates().length > 0;
      vanishBtn.disabled = !canVanish;
    }

    const targetBtn = this.hudEl.querySelector(".btn-target-vanish") as HTMLButtonElement | null;
    if (targetBtn) {
      const canTarget =
        this.state.phase === "playing" &&
        this.state.getTargetVanishCandidates().length > 0;
      targetBtn.disabled = !canTarget && !this.targetVanishMode;
      targetBtn.classList.toggle("active", this.targetVanishMode);
    }

    this.boardWrapEl?.classList.toggle("target-vanish-mode", this.targetVanishMode);
    this.boardWrapEl?.classList.toggle(
      "target-vanish-invalid",
      this.targetVanishMode && this.targetVanishHoverInvalid,
    );

    const launchable = this.state.getLaunchableIds();

    const vanishProgressById = new Map<number, number>();
    for (const anim of this.state.animations) {
      if (anim.mode !== "vanish") continue;
      const progress = this.state.getVanishAnimProgress(anim);
      for (const id of anim.memberIds) {
        vanishProgressById.set(id, progress);
      }
    }
    for (const [id, progress] of this.state.getBlackHoleRegionSwallowProgressForRender()) {
      vanishProgressById.set(id, Math.max(vanishProgressById.get(id) ?? 0, progress));
    }

    const spawnEmergenceById = new Map<number, SpawnEmergence>();
    if (this.state.isSpawnPhase()) {
      for (const a of this.state.arrows) {
        const fx = this.state.getSpawnEmergence(a.instanceId);
        if (fx) spawnEmergenceById.set(a.instanceId, fx);
      }
      for (const c of this.state.corners) {
        const fx = this.state.getSpawnEmergence(c.instanceId);
        if (fx) spawnEmergenceById.set(c.instanceId, fx);
      }
      for (const b of this.state.getDrawableBuffs()) {
        const fx = this.state.getSpawnEmergence(b.instanceId);
        if (fx) spawnEmergenceById.set(b.instanceId, fx);
      }
    }

    this.renderer.drawBoard(
      this.state.level,
      launchable,
      this.state.zoneManager.getZones(),
      this.state.getDrawableRevealedZoneArrows(),
      this.state.getRevealedZoneCorners(),
      this.state.getDrawableRevealedZoneBundles(),
      this.state.getRevealedZonePipes(),
      this.state.getDrawableTopLevelArrows(),
      this.state.getTopLevelCorners(),
      this.state.getDrawableTopLevelBundles(),
      this.state.getTopLevelPipes(),
      this.state.getVisibleKeys(),
      this.state.getActiveCurtainsForRender(),
      {
        style: "game",
        occupiedCells: this.state.getBoardOccupiedCellKeys(),
        vanishProgressById,
        movingWalls: this.state.getMovingWalls(),
        frozenOverlays: this.state.getFrozenOverlays(),
        shrinkPipes: this.state.getDrawableShrinkPipes(),
        toggles: this.state.getDrawableToggles(),
        controllers: this.state.getDrawableControllers(),
        toggleFlashGroupIds: this.state.getToggleFlashGroupIds(),
        bombStates: this.state.getBombDrawStates(),
        bombExplosion: this.state.getBombExplosion(),
        urgentBombRemaining: this.state.getUrgentBombRemaining(),
        buffs: this.state.getDrawableBuffs(),
        spawnEmergenceById,
        areaBombEffects: this.state.getAreaBombEffectsForRender(),
        crossBombEffects: this.state.getCrossBombEffectsForRender(),
        fireBombEffects: this.state.getFireBombEffectsForRender(),
        waitingBalloonEffects: this.state.getWaitingBalloonsForRender(),
        pendingBalloonBuffIds: this.state.getPendingBalloonBuffIds(),
        balloonEffects: this.state.getBalloonEffectsForRender(),
        candyMachineEffects: this.state.getCandyMachineEffectsForRender(),
        autoRefreshEffect: this.state.getAutoRefreshEffectForRender(),
        comboRewardFlights: this.state.getComboRewardFlightsForRender(),
        confetti: this.state.getConfettiStateForRender(),
        balloonArrowFxById: this.state.getBalloonArrowFxForRender(),
        blackHoleFxById: this.state.getBlackHoleFxForRender(),
        launchClickEffects: this.state.getLaunchClickEffectsForRender(),
        dotPulseEffects: this.state.getDotPulseEffectsForRender(),
        playableCells: this.state.level.playableCells,
        blackHoleCells: this.state.level.blackHoleCells,
        invalidCellColors: this.state.level.invalidCellColors,
        blackHoleRegionPhase: performance.now() * 0.001,
      },
    );
  }

  private tryAutoClear(): void {
    if (!this.state) return;
    this.state.tryAutoLaunch();
  }

  private tryRandomVanish(): void {
    if (!this.state) return;
    this.targetVanishMode = false;
    this.state.tryRandomVanish();
  }

  private toggleTargetVanishMode(): void {
    if (!this.state || this.state.phase !== "playing") return;
    if (
      !this.targetVanishMode &&
      this.state.getTargetVanishCandidates().length === 0
    ) {
      return;
    }
    this.targetVanishMode = !this.targetVanishMode;
    if (!this.targetVanishMode) {
      this.targetVanishHoverInvalid = false;
    }
  }

  private findNextLevelId(currentId: number): number | null {
    const rushIdx = this.rushTests.findIndex((l) => l.id === currentId);
    if (rushIdx >= 0) {
      return this.rushTests[rushIdx + 1]?.id ?? null;
    }
    const devIdx = this.devTests.findIndex((l) => l.id === currentId);
    if (devIdx >= 0) {
      return this.devTests[devIdx + 1]?.id ?? null;
    }
    const mainIdx = this.levels.findIndex((l) => l.id === currentId);
    if (mainIdx >= 0) {
      return this.levels[mainIdx + 1]?.id ?? null;
    }
    return null;
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
              const nextId = this.findNextLevelId(this.state!.level.id);
              if (nextId != null) void this.startLevel(nextId);
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
      const reason = this.state.getLostReason();
      const title = reason === "bomb" ? "炸弹爆炸！" : "时间到";
      const body =
        reason === "bomb"
          ? `定时炸弹引爆 · 还有 ${this.state.arrows.length} 条箭未清除`
          : `还有 ${this.state.arrows.length} 条箭未清除`;
      showModal(
        this.overlayEl,
        title,
        body,
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
    this.boardWrapEl = null;
    this.boardViewport?.dispose();
    this.boardViewport = null;
    this.targetVanishMode = false;
    this.targetVanishHoverInvalid = false;
    this.modalShown = false;
  }
}
