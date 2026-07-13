# 新关卡待导入目录

将编辑器导出或 AI 生成的关卡 JSON 放入对应子目录后，运行导入脚本即可加入游戏。

| 子目录 | 用途 | 游戏内 id 规则 |
|--------|------|----------------|
| `levels/` | 主线关卡 | 在现有主线最大 id 基础上 +1、+2…（当前约从 65 起） |
| `devTests/` | 机制测试关（手动试玩） | 9000 段，与 `rushTests` 共用 id 池（约从 9006 起） |
| `rushTests/` | 爽快版试玩关（手动导入） | 同上，写入选关页「爽快版测试」分组 |

**开发/集成测试专用关卡**（如 9030–9036）应放在 `test-fixtures/levels/`，**不要**写入 `manifest.json` 或 `public/levels/`。这与 9024–9026、9001–9005 的处理方式一致。

源文件可任意命名（须为 `.json`）。按**文件名排序**依次分配 id。`devTests` 与 `rushTests` 的 id 不会重复（共用同一自增池）。

## 导入

```bash
cd code/client
npm run import-levels
```

脚本会：

1. 读取三个子目录中的 JSON
2. 拷贝到 `public/levels/level-{id}.json`
3. 追加 `public/levels/manifest.json` 对应条目（`rushTests/` → `manifest.rushTests`）
4. **删除** inbox 中已成功导入的源文件

`npm run dev` / `npm run build` / `npm test` 前也会自动执行（inbox 为空时仅刷新 manifest 的 kinds 字段）。

## 关卡 JSON 要求

- 必填：`width`、`height`、`itemModels`
- 建议：`name`、`durationInSec`、`difficulty`
- 爽快版：`gameMode: "rush"`、`spawnIntervalSec`、`spawnPool`、`levelGoals`
