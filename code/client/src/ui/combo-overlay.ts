import type { ComboHudState } from "../core/mechanics/combo.ts";

export function ensureComboOverlay(boardWrap: HTMLElement): HTMLElement {
  let el = boardWrap.querySelector(".combo-overlay") as HTMLElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.className = "combo-overlay hidden";
  el.innerHTML = `
    <div class="combo-badge">
      <div class="combo-text">COMBO <span class="combo-x">x</span><span class="combo-n">0</span></div>
      <div class="combo-bar"><div class="combo-bar-fill"></div></div>
    </div>
  `;
  boardWrap.appendChild(el);
  return el;
}

export function updateComboOverlay(
  boardWrap: HTMLElement | null,
  hud: ComboHudState | null,
): void {
  if (!boardWrap) return;
  const el = ensureComboOverlay(boardWrap);
  if (!hud || hud.count <= 0) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const n = el.querySelector(".combo-n")!;
  n.textContent = String(hud.count);
  const fill = el.querySelector(".combo-bar-fill") as HTMLElement;
  fill.style.transform = `scaleX(${Math.max(0, Math.min(1, hud.progress))})`;

  const badge = el.querySelector(".combo-badge") as HTMLElement;
  const token = String(hud.pulseToken);
  if (badge.dataset.pulseToken !== token) {
    badge.dataset.pulseToken = token;
    badge.style.setProperty("--combo-pulse-ms", `${Math.round(hud.pulseDurationSec * 1000)}ms`);
    badge.classList.remove("combo-pulse");
    // 强制重启动画
    void badge.offsetWidth;
    badge.classList.add("combo-pulse");
  }
}
