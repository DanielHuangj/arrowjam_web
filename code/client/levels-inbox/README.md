# 新关卡待导入目录

将编辑器导出或 AI 生成的关卡 JSON 放入对应子目录后，运行导入脚本即可加入游戏。

| 子目录 | 用途 | 游戏内 id 规则 |
|--------|------|----------------|
| `levels/` | 主线关卡 | 在现有主线最大 id 基础上 +1、+2…（当前约从 65 起） |
| `devTests/` | 机制测试关 | 在现有测试最大 id 基础上 +1、+2…（9000 段，约从 9006 起） |

源文件可任意命名（须为 `.json`）。按**文件名排序**依次分配 id。

## 导入

```bash
cd code/client
npm run import-levels
```

脚本会：

1. 读取两个子目录中的 JSON
2. 拷贝到 `public/levels/level-{id}.json`
3. 追加 `public/levels/manifest.json` 条目
4. **删除** inbox 中已成功导入的源文件

`npm run dev` / `npm run build` / `npm test` 前也会自动执行（inbox 为空时仅刷新 manifest 的 kinds 字段）。

## 关卡 JSON 要求

- 必填：`width`、`height`、`itemModels`
- 建议：`name`、`durationInSec`、`difficulty`
