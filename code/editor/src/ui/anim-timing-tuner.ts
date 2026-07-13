import {
  configFromSpeeds,
  initialSpeedCellsPerSec,
  maxSpeedCellsPerSec,
  type AnimTimingConfig,
} from "@arrowjaw/client/core/game/anim-timing-config.ts";
import {
  applySavedAnimTimingConfig,
  beginAnimTimingPlayPreview,
  getAnimTimingConfig,
  getSavedAnimTimingConfig,
  setAnimTimingPlayPreview,
} from "@arrowjaw/client/core/game/anim-timing.ts";

export interface AnimTimingTunerHandle {
  dispose(): void;
}

interface SpeedFields {
  initial: number;
  max: number;
  accelSteps: number;
}

function readSpeedFields(config: AnimTimingConfig): SpeedFields {
  return {
    initial: Math.round(initialSpeedCellsPerSec(config) * 10) / 10,
    max: Math.round(maxSpeedCellsPerSec(config) * 10) / 10,
    accelSteps: config.accelSteps,
  };
}

function applySpeedFields(fields: SpeedFields): AnimTimingConfig {
  const config = configFromSpeeds(fields.initial, fields.max, fields.accelSteps);
  setAnimTimingPlayPreview(config);
  return getAnimTimingConfig();
}

function syncInputs(
  root: HTMLElement,
  fields: SpeedFields,
): void {
  const initialInput = root.querySelector<HTMLInputElement>("#timing-initial")!;
  const maxInput = root.querySelector<HTMLInputElement>("#timing-max")!;
  const accelInput = root.querySelector<HTMLInputElement>("#timing-accel")!;
  const initialVal = root.querySelector<HTMLSpanElement>("#timing-initial-val")!;
  const maxVal = root.querySelector<HTMLSpanElement>("#timing-max-val")!;
  const accelVal = root.querySelector<HTMLSpanElement>("#timing-accel-val")!;

  initialInput.value = String(fields.initial);
  maxInput.value = String(fields.max);
  accelInput.value = String(fields.accelSteps);
  initialVal.textContent = `${fields.initial} 格/秒`;
  maxVal.textContent = `${fields.max} 格/秒`;
  accelVal.textContent = `${fields.accelSteps} 格`;
}

function setStatus(root: HTMLElement, text: string, kind: "info" | "ok" | "err"): void {
  const el = root.querySelector<HTMLSpanElement>("#timing-save-status")!;
  el.textContent = text;
  el.dataset.kind = kind;
}

async function persistAnimTimingConfig(config: AnimTimingConfig): Promise<void> {
  const res = await fetch("/api/dev/save-anim-timing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as { config: AnimTimingConfig };
  applySavedAnimTimingConfig(body.config);
}

export function mountAnimTimingTuner(root: HTMLElement): AnimTimingTunerHandle {
  root.innerHTML = `
    <div class="anim-timing-tuner">
      <div class="anim-timing-title">箭头飞行参数</div>
      <div class="anim-timing-fields">
        <label class="anim-timing-field">
          <span class="anim-timing-label">初始速度</span>
          <strong id="timing-initial-val" class="anim-timing-value"></strong>
          <input id="timing-initial" type="range" min="5" max="80" step="0.5" />
        </label>
        <label class="anim-timing-field">
          <span class="anim-timing-label">最高速度</span>
          <strong id="timing-max-val" class="anim-timing-value"></strong>
          <input id="timing-max" type="range" min="10" max="200" step="0.5" />
        </label>
        <label class="anim-timing-field">
          <span class="anim-timing-label">加速度</span>
          <strong id="timing-accel-val" class="anim-timing-value"></strong>
          <input id="timing-accel" type="range" min="1" max="40" step="1" />
        </label>
      </div>
      <p class="anim-timing-hint">加速度 = 达到最高速度所需飞行格数，越小加速越快</p>
      <div class="anim-timing-actions">
        <button type="button" id="timing-save" class="primary">保存为默认参数</button>
        <span id="timing-save-status" class="anim-timing-status" data-kind="info"></span>
      </div>
    </div>
  `;

  let fields = readSpeedFields(getSavedAnimTimingConfig());
  syncInputs(root, fields);
  setStatus(root, "已恢复正式游戏参数，拖动滑块仅本次试玩有效", "info");

  const onInput = (): void => {
    const initial = Number(root.querySelector<HTMLInputElement>("#timing-initial")!.value);
    const max = Number(root.querySelector<HTMLInputElement>("#timing-max")!.value);
    const accelSteps = Number(root.querySelector<HTMLInputElement>("#timing-accel")!.value);
    fields = readSpeedFields(
      applySpeedFields({ initial, max, accelSteps }),
    );
    syncInputs(root, fields);
    setStatus(root, "已应用（未保存）", "info");
  };

  const onSave = async (): Promise<void> => {
    const btn = root.querySelector<HTMLButtonElement>("#timing-save")!;
    btn.disabled = true;
    setStatus(root, "保存中…", "info");
    try {
      const config = getAnimTimingConfig();
      await persistAnimTimingConfig(config);
      fields = readSpeedFields(getSavedAnimTimingConfig());
      syncInputs(root, fields);
      setStatus(root, "已写入配置文件，正式游戏将使用此参数", "ok");
    } catch (err) {
      setStatus(
        root,
        `保存失败：${err instanceof Error ? err.message : String(err)}`,
        "err",
      );
    } finally {
      btn.disabled = false;
    }
  };

  const initialInput = root.querySelector<HTMLInputElement>("#timing-initial")!;
  const maxInput = root.querySelector<HTMLInputElement>("#timing-max")!;
  const accelInput = root.querySelector<HTMLInputElement>("#timing-accel")!;
  const saveBtn = root.querySelector<HTMLButtonElement>("#timing-save")!;

  initialInput.addEventListener("input", onInput);
  maxInput.addEventListener("input", onInput);
  accelInput.addEventListener("input", onInput);
  saveBtn.addEventListener("click", () => {
    void onSave();
  });

  const stopEscBubble = (e: KeyboardEvent): void => {
    if (e.key === "Escape") e.stopPropagation();
  };
  root.addEventListener("keydown", stopEscBubble);

  return {
    dispose() {
      initialInput.removeEventListener("input", onInput);
      maxInput.removeEventListener("input", onInput);
      accelInput.removeEventListener("input", onInput);
      root.removeEventListener("keydown", stopEscBubble);
      root.innerHTML = "";
    },
  };
}
