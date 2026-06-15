export interface OpenedFile {
  name: string;
  content: string;
  handle?: FileSystemFileHandle;
}

export function supportsFSA(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

export async function openFileWithFSA(): Promise<OpenedFile | null> {
  if (!supportsFSA()) return null;
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: "Arrow Jam Level JSON",
        accept: { "application/json": [".json"] },
      },
    ],
    multiple: false,
  });
  const file = await handle.getFile();
  return {
    name: file.name,
    content: await file.text(),
    handle,
  };
}

export async function openFilesWithFSA(): Promise<OpenedFile[]> {
  if (!supportsFSA()) return [];
  const handles = await window.showOpenFilePicker({
    types: [
      {
        description: "Arrow Jam Level JSON",
        accept: { "application/json": [".json"] },
      },
    ],
    multiple: true,
  });
  const out: OpenedFile[] = [];
  for (const handle of handles) {
    const file = await handle.getFile();
    out.push({ name: file.name, content: await file.text(), handle });
  }
  return out;
}

export function openFilesFromInput(files: FileList): Promise<OpenedFile[]> {
  return Promise.all(
    Array.from(files).map(async (file) => ({
      name: file.name,
      content: await file.text(),
    })),
  );
}

export async function saveToHandle(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function saveAsWithFSA(
  content: string,
  suggestedName: string,
): Promise<{ handle?: FileSystemFileHandle; name: string } | null> {
  if (!supportsFSA()) return null;
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: "Arrow Jam Level JSON",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  await saveToHandle(handle, content);
  const file = await handle.getFile();
  return { handle, name: file.name };
}

export function exportDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function suggestExportName(docName: string, levelNum?: number): string {
  if (/arrowJam-main-level-\d+\.json/i.test(docName)) return docName;
  if (levelNum && levelNum > 0) return `arrowJam-main-level-${levelNum}.json`;
  return docName.endsWith(".json") ? docName : `${docName}.json`;
}

export function validateSaveAsName(name: string): boolean {
  return /^arrowJam-main-level-\d+\.json$/i.test(name);
}
