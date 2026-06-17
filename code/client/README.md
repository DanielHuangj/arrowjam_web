# arrow_jaw

Arrow Jam 类益智游戏的网页可玩 Demo（P0 MVP）。

## 快速开始

```bash
cd code/client
npm install
npm run dev
```

浏览器打开 **http://127.0.0.1:5173/**（Vite 启动后终端会显示地址）。

局域网访问（手机等同网段设备）：

```bash
npm run dev:lan
# 或：npm run dev -- --host 0.0.0.0
```

终端会显示 `Network: http://192.168.x.x:5173/`，用该地址访问。本机也可用 `http://127.0.0.1:5173/` 或 `http://localhost:5173/`。

> **注意**：`npm run dev --host 0.0.0.0` 写法**无效**（`--host` 不会传给 Vite），中间必须有 `--`。

> **不要用 Cursor 内置 Simple Browser 预览**。若 dev 服务未启动时在内置浏览器里打开过 localhost，Chrome 会停在 `chrome-error://chromewebdata/` 错误页，再刷新会出现 `Unsafe attempt to load URL` 跨域报错。请改用 **系统 Chrome / Edge** 直接访问上述地址。

## 常见问题

### `Unsafe attempt to load URL http://localhost:5173/ from frame with URL chrome-error://...`

1. 先在终端确认 dev 服务已启动：`cd code/client && npm run dev`
2. 看到 `Local: http://127.0.0.1:5173/` 后，用 **外部浏览器** 打开该链接（不要在内置预览里刷新错误页）
3. 若提示端口占用，结束旧进程或换端口：`npx vite --port 5174`

### 端口 5173 已被占用

```bash
# Windows 查看占用
netstat -ano | findstr :5173
# 结束对应 PID 后重新 npm run dev
```

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（仅本机 127.0.0.1） |
| `npm run dev:lan` | 开发服务器（0.0.0.0，局域网可访问） |
| `npm run build` | 生产构建 |
| `npm test` | 单元测试 |
| `npm run copy-levels` | 从 `docs/crackdata/关卡提取/` 拷贝关卡到 `public/levels/` |

## 当前功能（P1）

- **kind 1** 折线箭：蛇形发射、路径 jam、bump 弹回
- **kind 4** 反射角块：飞行折射、背面阻挡、发射路径模拟
- **kind 12** 子区域：区域框渲染、内外箭头互阻、重叠区域按 instanceId 解锁
- 倒计时与胜负弹窗
- 关卡选择（P0 = 纯箭头，P1 = 含角块/区域）
- Canvas 棋盘渲染

## 文档

- [开发需求文档](../../docs/arrow_jaw_开发需求文档.md)
- [开发步骤拆解](../../docs/arrow_jaw_开发步骤拆解.md)
