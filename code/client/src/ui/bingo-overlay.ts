import type { BingoHudState } from "../core/mechanics/win-celebration.ts";

export function ensureBingoOverlay(boardWrap: HTMLElement): HTMLElement {
  let el = boardWrap.querySelector(".bingo-overlay") as HTMLElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.className = "bingo-overlay hidden";
  el.innerHTML = `<div class="bingo-text">Bingo</div>`;
  boardWrap.appendChild(el);
  return el;
}

export function updateBingoOverlay(
  boardWrap: HTMLElement,
  hud: BingoHudState | null,
): void {
  const el = ensureBingoOverlay(boardWrap);
  if (!hud?.active) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const token = String(hud.token);
  if (el.dataset.token !== token) {
    el.dataset.token = token;
    const text = el.querySelector(".bingo-text") as HTMLElement;
    text.classList.remove("bingo-breathe");
    void text.offsetWidth;
    text.classList.add("bingo-breathe");
  }
}

export function clearBingoOverlay(boardWrap: HTMLElement): void {
  boardWrap.querySelector(".bingo-overlay")?.remove();
}
