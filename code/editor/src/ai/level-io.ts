export function formatSeq(index: number): string {
  return String(index).padStart(3, "0");
}

export function uncheckFilename(prefix: string, seq: string): string {
  return `${prefix}-${seq}.uncheck.json`;
}

export function checkedFilename(prefix: string, seq: string): string {
  return `${prefix}-${seq}.json`;
}

async function fileExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** 从 startIndex 起找第一个未被占用的三位序号 */
export async function allocateSeq(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  startIndex: number,
): Promise<string> {
  let i = startIndex;
  for (let attempts = 0; attempts < 1000; attempts++, i++) {
    const seq = formatSeq(i);
    const checked = checkedFilename(prefix, seq);
    const uncheck = uncheckFilename(prefix, seq);
    if (!(await fileExists(dir, checked)) && !(await fileExists(dir, uncheck))) {
      return seq;
    }
  }
  throw new Error("无法分配文件序号（目录已满或冲突过多）");
}

export async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function readTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return file.text();
}

export async function removeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  await dir.removeEntry(name, { recursive: false });
}

export async function promoteUncheckToChecked(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  seq: string,
): Promise<void> {
  const uncheck = uncheckFilename(prefix, seq);
  const checked = checkedFilename(prefix, seq);
  const content = await readTextFile(dir, uncheck);
  await writeTextFile(dir, checked, content);
  await removeFile(dir, uncheck);
}

export async function writeGenerationLog(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  lines: string[],
): Promise<void> {
  if (lines.length === 0) return;
  const name = `${prefix}-generation.log`;
  const body = lines.join("\n") + "\n";
  await writeTextFile(dir, name, body);
}

const IDB_NAME = "arrowjaw-editor";
const IDB_STORE = "fs-handles";
const OUTPUT_DIR_IDB_KEY = "ai-output-dir";

async function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveOutputDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(IDB_STORE).put(handle, OUTPUT_DIR_IDB_KEY);
  });
}

export async function loadOutputDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(OUTPUT_DIR_IDB_KEY);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function clearOutputDirectoryHandle(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
      tx.objectStore(IDB_STORE).delete(OUTPUT_DIR_IDB_KEY);
    });
  } catch {
    // ignore
  }
}

/** 读取默认输出路径；local 配置缺失或 path 为空时返回空字符串 */
export async function loadDefaultOutputDirPath(): Promise<string> {
  try {
    const res = await fetch("/ai-output-dir.local.json", { cache: "no-store" });
    if (!res.ok) return "";
    const data = (await res.json()) as { path?: unknown };
    if (typeof data.path !== "string") return "";
    const trimmed = data.path.trim();
    return trimmed;
  } catch {
    return "";
  }
}

export async function tryRestoreOutputDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadOutputDirectoryHandle();
  if (!handle) return null;

  try {
    let perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      perm = await handle.requestPermission({ mode: "readwrite" });
    }
    if (perm !== "granted") return null;
    return handle;
  } catch {
    await clearOutputDirectoryHandle();
    return null;
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function pickOutputDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持目录选择，请使用 Chrome 或 Edge");
  }
  return window.showDirectoryPicker({
    mode: "readwrite",
    id: "arrowjaw-ai-output",
  });
}
