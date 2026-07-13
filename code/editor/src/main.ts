import { EditorApp } from "./app.ts";

declare global {
  interface Window {
    __arrowJawEditorApp?: EditorApp;
  }
}

function bootEditorApp(): EditorApp {
  if (window.__arrowJawEditorApp) return window.__arrowJawEditorApp;
  const app = new EditorApp();
  window.__arrowJawEditorApp = app;
  return app;
}

const app = bootEditorApp();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.stopPlayLoop?.();
  });
  import.meta.hot.accept(() => {
    // 保留已打开的关卡与试玩状态，避免热更新后整页重置
  });
}
