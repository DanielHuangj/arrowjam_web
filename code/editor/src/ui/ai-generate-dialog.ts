import { loadAiConfig, getConfigHint } from "../ai/config.ts";
import { BOARD_MAX_SIZE, BOARD_MIN_SIZE, boardSizeRangeLabel, isBoardSizeValid } from "../board-limits.ts";
import { runGenerationPipeline } from "../ai/generation-pipeline.ts";
import {
  loadDefaultOutputDirPath,
  pickOutputDirectory,
  saveOutputDirectoryHandle,
  supportsDirectoryPicker,
  tryRestoreOutputDirectory,
} from "../ai/level-io.ts";
import { LlmError } from "../ai/llm-client.ts";
import {
  AI_GEN_MAX_COUNT,
  AI_KIND_OPTIONS,
  type GenerationForm,
  type GenerationFailure,
  type PipelineProgress,
} from "../ai/types.ts";
import { formatIssuesSummary } from "../ai/validate-level.ts";
import {
  buildBaseLevelContext,
  validateBaseLevelForForm,
} from "../ai/level-base-edit.ts";
import {
  applyAiGenFormPrefs,
  collectAiGenFormPrefs,
  loadAiGenFormPrefs,
  saveAiGenFormPrefs,
} from "./ai-form-prefs.ts";

const PREFIX_RE = /^[a-zA-Z0-9_-]+$/;

export function showAiGenerateDialog(modalRoot: HTMLElement): void {
  if (!supportsDirectoryPicker()) {
    alert("请使用 Chrome 或 Edge，本功能需目录写入权限（File System Access API）");
    return;
  }

  let dirHandle: FileSystemDirectoryHandle | null = null;
  let defaultDirPath = "";
  let baseLevelJson: string | undefined;
  let abortController: AbortController | null = null;
  let configLoaded = false;
  let configOk = false;

  modalRoot.classList.remove("hidden");
  modalRoot.innerHTML = `
    <div class="modal ai-generate">
      <h2>AI 辅助生成</h2>
      <div class="ai-gen-form">
        <label><span>名称前缀</span><input id="ai-prefix" type="text" placeholder="my-level" /></label>
        <div class="ai-row-2">
          <label><span>宽度</span><input id="ai-w" type="number" value="20" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" /></label>
          <label><span>高度</span><input id="ai-h" type="number" value="32" min="${BOARD_MIN_SIZE}" max="${BOARD_MAX_SIZE}" /></label>
        </div>
        <div class="ai-row-2">
          <label><span>时限（秒）</span><input id="ai-dur" type="number" value="150" min="1" /></label>
          <label><span>生成个数</span><input id="ai-count" type="number" value="1" min="1" max="${AI_GEN_MAX_COUNT}" /></label>
        </div>
        <div class="ai-row-2">
          <label><span>难度</span>
            <select id="ai-diff">
              <option value="1" selected>Normal</option>
              <option value="2">Hard</option>
              <option value="3">Superhuman</option>
            </select>
          </label>
          <label><span>关卡类型</span>
            <select id="ai-level-kind">
              <option value="1">主线</option>
              <option value="2" selected>普通</option>
            </select>
          </label>
        </div>
        <div class="kind-checkboxes">
          <div class="kind-label">包含物件</div>
          <div class="kind-grid" id="ai-kinds"></div>
        </div>
        <label class="ai-keywords"><span>生成关键词</span>
          <textarea id="ai-keywords" rows="3" placeholder="例如：教学关，翻转箭机制，中等难度"></textarea>
        </label>
        <div class="dir-row ai-base-file-row">
          <label><span>基础关卡（可选）</span>
            <input id="ai-base-file" type="text" readonly placeholder="未选择，将全新生成" />
          </label>
          <input id="ai-base-file-input" type="file" accept=".json,application/json" hidden />
          <button type="button" id="ai-pick-base">选择文件</button>
          <button type="button" id="ai-clear-base" class="hidden">清除</button>
        </div>
        <p class="ai-base-hint" id="ai-base-hint">选择本地关卡 JSON 时，将保留原有折线箭并在空格中追加新箭。</p>
        <div class="dir-row">
          <label><span>输出目录</span>
            <input id="ai-dir" type="text" readonly placeholder="未选择" />
          </label>
          <button type="button" id="ai-pick-dir">选择目录</button>
        </div>
        <p class="ai-config-hint" id="ai-config-hint">正在加载 AI 配置…</p>
      </div>
      <div class="ai-progress hidden" id="ai-progress">
        <div class="ai-progress-text" id="ai-progress-text">准备中…</div>
      </div>
      <div class="actions modal-actions">
        <button type="button" id="ai-cancel">取消</button>
        <button type="button" class="primary" id="ai-run" disabled>生成</button>
      </div>
    </div>
  `;

  const prefixEl = modalRoot.querySelector("#ai-prefix") as HTMLInputElement;
  const kindsEl = modalRoot.querySelector("#ai-kinds")!;
  const dirEl = modalRoot.querySelector("#ai-dir") as HTMLInputElement;
  const baseFileEl = modalRoot.querySelector("#ai-base-file") as HTMLInputElement;
  const baseFileInputEl = modalRoot.querySelector("#ai-base-file-input") as HTMLInputElement;
  const clearBaseBtn = modalRoot.querySelector("#ai-clear-base") as HTMLButtonElement;
  const baseHintEl = modalRoot.querySelector("#ai-base-hint")!;
  const widthEl = modalRoot.querySelector("#ai-w") as HTMLInputElement;
  const heightEl = modalRoot.querySelector("#ai-h") as HTMLInputElement;
  const durEl = modalRoot.querySelector("#ai-dur") as HTMLInputElement;
  const countEl = modalRoot.querySelector("#ai-count") as HTMLInputElement;
  const diffEl = modalRoot.querySelector("#ai-diff") as HTMLSelectElement;
  const levelKindEl = modalRoot.querySelector("#ai-level-kind") as HTMLSelectElement;
  const keywordsEl = modalRoot.querySelector("#ai-keywords") as HTMLTextAreaElement;
  const hintEl = modalRoot.querySelector("#ai-config-hint")!;
  const runBtn = modalRoot.querySelector("#ai-run") as HTMLButtonElement;
  const cancelBtn = modalRoot.querySelector("#ai-cancel") as HTMLButtonElement;
  const progressEl = modalRoot.querySelector("#ai-progress")!;
  const progressTextEl = modalRoot.querySelector("#ai-progress-text")!;

  for (const opt of AI_KIND_OPTIONS) {
    const label = document.createElement("label");
    label.className = "kind-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(opt.kind);
    cb.checked = opt.kind === 1;
    cb.disabled = !!opt.locked;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    kindsEl.appendChild(label);
  }

  const getFormElements = () => ({
    prefixEl,
    widthEl,
    heightEl,
    durEl,
    countEl,
    diffEl,
    levelKindEl,
    keywordsEl,
    kindsEl,
    baseLevelJson,
    baseFileName: baseFileEl.value || undefined,
  });

  const persistFormPrefs = (): void => {
    saveAiGenFormPrefs(collectAiGenFormPrefs(getFormElements()));
  };

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePersistFormPrefs = (): void => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistFormPrefs, 300);
  };

  const restoreBaseLevelFromPrefs = (json: string, fileName: string): void => {
    try {
      const base = buildBaseLevelContext(json);
      baseLevelJson = json;
      baseFileEl.value = fileName;
      clearBaseBtn.classList.remove("hidden");
      baseHintEl.textContent = `已恢复：${fileName}。${base.data.width}×${base.data.height}，${base.frozenArrowIds.size} 条原箭，约 ${base.emptyCells} 格待填充。`;
    } catch {
      baseLevelJson = undefined;
      baseFileEl.value = "";
      clearBaseBtn.classList.add("hidden");
      baseHintEl.textContent = "选择本地关卡 JSON 时，将保留原有折线箭并在空格中追加新箭。";
    }
  };

  const savedPrefs = loadAiGenFormPrefs();
  applyAiGenFormPrefs(savedPrefs, getFormElements());
  if (savedPrefs.baseLevelJson && savedPrefs.baseFileName) {
    restoreBaseLevelFromPrefs(savedPrefs.baseLevelJson, savedPrefs.baseFileName);
  }

  const formEl = modalRoot.querySelector(".ai-gen-form")!;
  formEl.addEventListener("input", schedulePersistFormPrefs);
  formEl.addEventListener("change", schedulePersistFormPrefs);

  const updateRunState = (): void => {
    if (!configLoaded) {
      runBtn.disabled = true;
      return;
    }
    runBtn.disabled = !configOk || !dirHandle || abortController !== null;
  };

  void loadAiConfig().then(({ config, error }) => {
    configLoaded = true;
    configOk = !!config;
    hintEl.textContent = config
      ? `已加载配置：${config.model} @ ${config.baseUrl}`
      : (error ?? getConfigHint());
    hintEl.classList.toggle("ai-config-error", !config);
    updateRunState();
  });

  void (async () => {
    defaultDirPath = await loadDefaultOutputDirPath();
    if (defaultDirPath) {
      dirEl.placeholder = defaultDirPath;
      const restored = await tryRestoreOutputDirectory();
      if (restored) {
        dirHandle = restored;
        dirEl.value = defaultDirPath;
      } else {
        dirEl.value = "";
      }
    } else {
      dirEl.placeholder = "未选择";
      dirEl.value = "";
    }
    updateRunState();
  })();

  modalRoot.querySelector("#ai-pick-dir")?.addEventListener("click", async () => {
    try {
      dirHandle = await pickOutputDirectory();
      await saveOutputDirectoryHandle(dirHandle);
      dirEl.value = defaultDirPath || dirHandle.name;
      updateRunState();
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        alert(err.message);
      }
    }
  });

  const clearBaseLevel = (): void => {
    baseLevelJson = undefined;
    baseFileEl.value = "";
    baseFileInputEl.value = "";
    clearBaseBtn.classList.add("hidden");
    baseHintEl.textContent = "选择本地关卡 JSON 时，将保留原有折线箭并在空格中追加新箭。";
    persistFormPrefs();
  };

  modalRoot.querySelector("#ai-pick-base")?.addEventListener("click", () => {
    baseFileInputEl.click();
  });

  clearBaseBtn.addEventListener("click", () => clearBaseLevel());

  baseFileInputEl.addEventListener("change", async () => {
    const file = baseFileInputEl.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const base = buildBaseLevelContext(text);
      baseLevelJson = text;
      baseFileEl.value = file.name;

      widthEl.value = String(base.data.width);
      heightEl.value = String(base.data.height);
      durEl.value = String(base.data.durationInSec);
      diffEl.value = String(base.data.difficulty);

      clearBaseBtn.classList.remove("hidden");
      baseHintEl.textContent = `已加载：${file.name}。${base.data.width}×${base.data.height}，${base.frozenArrowIds.size} 条原箭，约 ${base.emptyCells} 格待填充。`;
      persistFormPrefs();
    } catch (err) {
      clearBaseLevel();
      alert(`无法读取关卡文件：${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const closeDialog = (): void => {
    clearTimeout(persistTimer);
    persistFormPrefs();
    if (abortController) {
      abortController.abort();
    }
    modalRoot.classList.add("hidden");
    modalRoot.innerHTML = "";
  };

  cancelBtn.addEventListener("click", () => {
    if (abortController) {
      abortController.abort();
      return;
    }
    closeDialog();
  });

  const readForm = (): GenerationForm | string => {
    const prefix = prefixEl.value.trim();
    if (!prefix) return "请填写名称前缀";
    if (!PREFIX_RE.test(prefix)) return "名称前缀仅允许字母、数字、下划线与连字符";

    const width = parseInt(widthEl.value, 10);
    const height = parseInt(heightEl.value, 10);
    if (!isBoardSizeValid(width, height)) {
      return `宽度与高度须在 ${boardSizeRangeLabel()} 之间`;
    }

    const durationInSec = parseInt(durEl.value, 10);
    if (durationInSec < 1) return "时限须 ≥ 1 秒";

    const count = parseInt(countEl.value, 10);
    if (count < 1 || count > AI_GEN_MAX_COUNT) {
      return `生成个数须在 1–${AI_GEN_MAX_COUNT} 之间`;
    }

    const difficulty = parseInt(diffEl.value, 10) as 1 | 2 | 3;
    const levelKind = parseInt(levelKindEl.value, 10);

    const allowedKinds = AI_KIND_OPTIONS.filter((opt) => {
      const cb = kindsEl.querySelector(`input[value="${opt.kind}"]`) as HTMLInputElement;
      return cb?.checked;
    }).map((o) => o.kind);

    if (!allowedKinds.includes(1)) allowedKinds.unshift(1);

    const keywords = keywordsEl.value.trim();

    if (baseLevelJson) {
      const base = buildBaseLevelContext(baseLevelJson);
      const baseErr = validateBaseLevelForForm(base, {
        prefix,
        width,
        height,
        durationInSec,
        difficulty,
        levelKind,
        count,
        allowedKinds,
        keywords,
      });
      if (baseErr) return baseErr;
    }

    return {
      prefix,
      width,
      height,
      durationInSec,
      difficulty,
      levelKind,
      count,
      allowedKinds,
      keywords,
      baseLevelJson,
    };
  };

  const setGenerating = (generating: boolean): void => {
    progressEl.classList.toggle("hidden", !generating);
    runBtn.disabled = generating || !configOk || !dirHandle;
    prefixEl.disabled = generating;
    cancelBtn.textContent = generating ? "停止" : "取消";
  };

  const showProgress = (p: PipelineProgress): void => {
    progressTextEl.textContent = p.message;
  };

  const showSummary = (
    requested: number,
    passed: number,
    failed: GenerationFailure[],
    cancelled: boolean,
    logLines: string[] = [],
  ): void => {
    const failedHtml =
      failed.length > 0
        ? `<details class="ai-fail-details"><summary>失败详情（${failed.length}）</summary><ul>${failed
            .map(
              (f) =>
                `<li>${f.seq}：${formatIssuesSummary(f.issues) || "校验失败"}</li>`,
            )
            .join("")}</ul></details>`
        : "";

    modalRoot.innerHTML = `
      <div class="modal ai-generate">
        <h2>${cancelled ? "已取消" : "生成完成"}</h2>
        <div class="ai-summary">
          <p>请求生成：${requested} 关</p>
          <p>校验通过：${passed} 关</p>
          <p>失败丢弃：${failed.length} 关</p>
          ${cancelled ? "<p>未完成部分已停止</p>" : ""}
          ${failedHtml}
          ${logLines.length > 0 ? "<p class=\"ai-log-hint\">详细日志已写入输出目录：<code>{前缀}-generation.log</code></p>" : ""}
        </div>
        <div class="actions modal-actions">
          <button type="button" class="primary" id="ai-summary-ok">确认</button>
        </div>
      </div>
    `;
    modalRoot.querySelector("#ai-summary-ok")?.addEventListener("click", () => {
      modalRoot.classList.add("hidden");
      modalRoot.innerHTML = "";
    });
  };

  runBtn.addEventListener("click", async () => {
    if (!dirHandle) {
      alert("请先选择输出目录");
      return;
    }

    const formOrErr = readForm();
    if (typeof formOrErr === "string") {
      alert(formOrErr);
      return;
    }

    const { config } = await loadAiConfig();
    if (!config) {
      alert(getConfigHint());
      return;
    }

    abortController = new AbortController();
    persistFormPrefs();
    setGenerating(true);
    showProgress({ phase: 1, message: "开始生成…" });

    try {
      const result = await runGenerationPipeline(formOrErr, dirHandle, config, {
        onProgress: showProgress,
        signal: abortController.signal,
      });
      abortController = null;
      showSummary(
        result.requested,
        result.passed,
        result.failed,
        result.cancelled,
        result.logLines,
      );
    } catch (err) {
      abortController = null;
      setGenerating(false);
      if (err instanceof LlmError) {
        if (err.status === 401 || err.status === 403) {
          alert("API 密钥无效，请检查 ai-config.local.json");
        } else if (err.status === 429) {
          alert("请求过于频繁，请稍后重试");
        } else if (err.message.includes("超时") || err.message.includes("取消")) {
          alert(err.message);
        } else {
          alert(`生成失败：${err.message}`);
        }
      } else {
        alert(`生成失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  updateRunState();
}
