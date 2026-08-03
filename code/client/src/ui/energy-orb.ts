import type { EnergyOrbHudState } from "../core/mechanics/win-celebration.ts";
import { gameBoardContentOffsetPx } from "../render/board-renderer.ts";
import { pointerToBoardPx, type ViewportState } from "../render/viewport.ts";

const ORB_SIZE = 64;
/** 与棋盘框外缘的间距（不重叠） */
const ORB_GAP_PX = 10;

export function ensureEnergyOrb(boardWrap: HTMLElement): HTMLElement {
  let host = boardWrap.parentElement?.querySelector(
    ".energy-orb-host",
  ) as HTMLElement | null;
  if (host) return host;

  const stage = boardWrap.parentElement;
  if (stage && !stage.classList.contains("board-stage")) {
    stage.classList.add("board-stage");
  }

  host = document.createElement("div");
  host.className = "energy-orb-host hidden";
  host.innerHTML = `
    <div class="energy-orb">
      <div class="energy-orb-glass">
        <div class="energy-orb-liquid">
          <div class="energy-orb-wave"></div>
          <div class="energy-orb-wave energy-orb-wave-2"></div>
        </div>
      </div>
    </div>
  `;
  boardWrap.insertAdjacentElement("afterend", host);
  return host;
}

/** 紧贴棋盘 canvas 右侧中部放置能量球 */
export function layoutEnergyOrb(boardWrap: HTMLElement): void {
  const host = ensureEnergyOrb(boardWrap);
  if (host.classList.contains("hidden")) return;
  const stage = boardWrap.parentElement;
  const canvas = boardWrap.querySelector("canvas");
  if (!stage || !canvas) return;

  const stageRect = stage.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  // 整颗球在棋盘框外侧，紧贴右缘
  host.style.left = `${canvasRect.right - stageRect.left + ORB_GAP_PX}px`;
  host.style.top = `${
    canvasRect.top - stageRect.top + canvasRect.height / 2 - ORB_SIZE / 2
  }px`;
}

export function getEnergyOrbClientCenter(
  boardWrap: HTMLElement,
): { x: number; y: number } | null {
  const orb = boardWrap.parentElement?.querySelector(
    ".energy-orb",
  ) as HTMLElement | null;
  if (!orb || orb.closest(".energy-orb-host")?.classList.contains("hidden")) {
    const canvas = boardWrap.querySelector("canvas");
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return {
      x: r.right + ORB_GAP_PX + ORB_SIZE / 2,
      y: r.top + r.height / 2,
    };
  }
  const r = orb.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 能量球中心 → 棋盘内容像素坐标（与 buff 飞入绘制空间一致） */
export function getEnergyOrbBoardOrigin(
  boardWrap: HTMLElement,
  canvas: HTMLCanvasElement,
  vp: ViewportState,
): { x: number; y: number } | null {
  const center = getEnergyOrbClientCenter(boardWrap);
  if (!center) return null;
  const [x, y] = pointerToBoardPx(
    center.x,
    center.y,
    canvas,
    vp,
    gameBoardContentOffsetPx(),
  );
  return { x, y };
}

export function updateEnergyOrb(
  boardWrap: HTMLElement,
  hud: EnergyOrbHudState | null,
): void {
  const host = ensureEnergyOrb(boardWrap);
  const stage = boardWrap.parentElement;
  if (!hud || !hud.visible) {
    host.classList.add("hidden");
    stage?.classList.remove("has-energy-orb");
    return;
  }
  host.classList.remove("hidden");
  stage?.classList.add("has-energy-orb");
  layoutEnergyOrb(boardWrap);

  const liquid = host.querySelector(".energy-orb-liquid") as HTMLElement;
  const fill = Math.max(0, Math.min(1, hud.fill));
  liquid.style.setProperty("--energy-fill", String(fill));

  const token = String(hud.rippleToken);
  if (host.dataset.rippleToken !== token) {
    host.dataset.rippleToken = token;
    if (hud.rippleToken > 0) {
      host.classList.remove("energy-ripple");
      void host.offsetWidth;
      host.classList.add("energy-ripple");
    }
  }
}

export function clearEnergyOrb(boardWrap: HTMLElement): void {
  const stage = boardWrap.parentElement;
  stage?.classList.remove("has-energy-orb");
  const host = stage?.querySelector(".energy-orb-host");
  host?.remove();
}
