# arrowjam_web

Arrow Jam 类益智游戏的网页可玩 Demo。

## 快速开始

```bash
cd code/client
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173/（局域网访问可加 `--host 0.0.0.0`）。

详细说明见 [code/client/README.md](code/client/README.md)。

## 目录

- `code/client/` — Vite + TypeScript 游戏客户端
- `code/editor/` — 关卡可视化编辑器
- `code/shared/` — client 与 editor 共享的类型/解析/校验/序列化
- `docs/` — 玩法说明与开发文档（`docs/crackdata/` 为本地提取数据，未纳入 Git）

## 关卡编辑器

```bash
cd code/editor
npm install
npm run dev          # 仅本机 http://127.0.0.1:5174/
npm run dev:lan      # 局域网 http://<你的IP>:5174/
```

浏览器打开 http://127.0.0.1:5174/。推荐使用 Chrome/Edge 以获得完整本地文件保存（File System Access API）支持。

**局域网访问**：用 `npm run dev:lan`（不要用 `npm run dev -- --host`，配置已去掉 127.0.0.1 绑定）。启动后终端会显示 `Network: http://192.168.x.x:5174/`。若他人仍无法访问，在 Windows「防火墙」中允许 Node.js 或入站端口 **5174**。他人电脑须用 **Network 那行 IP**，不要用 `127.0.0.1`。

> 通过局域网打开时，「覆盖保存原文件」等 FSA 能力不可用（浏览器安全限制），仍可用「打开 / 导出下载」编辑 JSON。

功能概览：打开/新建/保存关卡 JSON、7 种 kind 可视化编辑、校验、内置试玩预览。

开发文档：[docs/arrow_jaw_关卡编辑器开发需求文档.md](docs/arrow_jaw_关卡编辑器开发需求文档.md) · [docs/arrow_jaw_关卡编辑器开发步骤拆解.md](docs/arrow_jaw_关卡编辑器开发步骤拆解.md)

## 游戏部署

生产环境为纯静态站点，见 [docs/游戏部署说明.md](docs/游戏部署说明.md)（本地 build → 上传 `dist/` → 配置 Nginx）。
