import { loadLevel } from "../core/level/loader.ts";
import type { GameLevel, LevelManifestEntry } from "../core/types.ts";
import { drawLevelThumbnail } from "../render/level-thumbnail.ts";

const levelCache = new Map<number, GameLevel>();
const inflight = new Map<number, Promise<GameLevel>>();

async function getLevelData(levelId: number): Promise<GameLevel> {
  const cached = levelCache.get(levelId);
  if (cached) return cached;

  const pending = inflight.get(levelId);
  if (pending) return pending;

  const task = loadLevel(levelId)
    .then((level) => {
      levelCache.set(levelId, level);
      return level;
    })
    .finally(() => {
      inflight.delete(levelId);
    });

  inflight.set(levelId, task);
  return task;
}

async function paintThumbnail(levelId: number, canvas: HTMLCanvasElement): Promise<void> {
  if (canvas.classList.contains("ready")) return;

  const level = await getLevelData(levelId);
  drawLevelThumbnail(canvas, level);
  canvas.classList.add("ready");
}

/** 为选关列表中的 canvas 懒加载缩略图，返回清理函数 */
export function attachLevelThumbnails(container: HTMLElement): () => void {
  const canvases = container.querySelectorAll<HTMLCanvasElement>(
    "canvas.level-thumb[data-level-id]",
  );
  if (canvases.length === 0) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const canvas = entry.target as HTMLCanvasElement;
        const id = Number(canvas.dataset.levelId);
        if (!Number.isFinite(id)) continue;
        observer.unobserve(canvas);
        void paintThumbnail(id, canvas).catch(() => {
          canvas.classList.add("failed");
        });
      }
    },
    { rootMargin: "120px" },
  );

  for (const canvas of canvases) {
    observer.observe(canvas);
  }

  return () => observer.disconnect();
}

export function prefetchLevelThumbnails(levels: LevelManifestEntry[], limit = 6): void {
  const wrap = document.querySelector(".level-grid");
  if (!wrap) return;
  for (const lv of levels.slice(0, limit)) {
    const canvas = wrap.querySelector<HTMLCanvasElement>(
      `canvas.level-thumb[data-level-id="${lv.id}"]`,
    );
    if (canvas) {
      void paintThumbnail(lv.id, canvas).catch(() => {
        canvas.classList.add("failed");
      });
    }
  }
}
