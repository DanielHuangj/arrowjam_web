# arrow_jaw 异形棋盘与黑洞区域开发需求文档

> **版本**：v0.1  
> **日期**：2026-07-10  
> **状态**：待开发  
> **关联文档**：[Arrow Jam 新版本规则初稿（爽快版）.md](Arrow%20Jam%20新版本规则初稿（爽快版）.md) · [arrow_jaw_异形棋盘与黑洞区域开发步骤拆解.md](arrow_jaw_异形棋盘与黑洞区域开发步骤拆解.md) · [arrow_jaw_爽快版开发需求文档.md](arrow_jaw_爽快版开发需求文档.md) · [arrow_jaw_关卡编辑器开发需求文档.md](arrow_jaw_关卡编辑器开发需求文档.md)

---

## 0. 源文档勘误与已确认决策

### 0.1 源文档引用

| 来源 | 章节 | 内容 |
|------|------|------|
| 规则初稿 | §三.1 | 异形棋盘：仅有效格可放置/生成；无效格与背景同色、无圆点 |
| 规则初稿 | §三.2 | 黑洞区域：连续格组成消除出口；规则同 K21；不可生成 |
| 规则初稿 | §五.3 | 编辑器：异形/黑洞手动选格、背景图导入 |

### 0.2 已确认决策

| 议题 | 决策 |
|------|------|
| 与 kind 21 黑洞道具 | **并存**。K21 为单格 buff、可生成、10s 消失；黑洞区域为**关卡几何**、永久、可多块 |
| 正常棋盘 JSON | 省略 `boardShape` / `playableMask` / `blackHoleRegions`，**零体积增量** |
| 存储格式 | 按行水平 span 压缩 `[y, startX, endX]`（含端点） |
| 多黑洞区域 | `blackHoleRegions[]` 数组；运行时合并为 `Set` |
| 背景图 | **仅 EditorDocument 内存**；不写入关卡 JSON；重开文件需重新导入 |
| 像素自动识别 | **Phase 2**（见 §8） |
| 经典 / Rush | 两种模式均受 playable / 黑洞规则约束 |

### 0.3 推荐默认

| 议题 | 推荐默认 |
|------|----------|
| 有效格连通性 | 四邻连通（上下左右）；保存时 **error** 阻断 |
| 黑洞区域连通性 | 每个 region 四邻连通；**warning** 提示（可选升级为 error） |
| 吞噬规则 | 箭身 **newly-enter** 黑洞格即消除，复用 `onArrowEliminationBatch` |
| 无效格交互 | `pointerToCell` 返回 null；不可发射、不可放置 |
| 编辑器完成编辑 | 若物件落在无效格或黑洞格 → **阻塞**并提示 |

---

## 1. 概述

### 1.1 目标

在 `code/shared`、`code/client`、`code/editor` 中实现：

1. **异形棋盘**：矩形画布内仅部分格子有效
2. **黑洞区域**：永久消除出口，增加玩法出口多样性
3. **编辑器特殊区域编辑**：手动选格 + 背景图辅助
4. **向后兼容**：旧关卡无新字段时行为不变

### 1.2 范围

| 在范围 | 不在范围 |
|--------|----------|
| JSON 契约、解析、校验、压缩存储 | 主线关卡批量改造 |
| 游戏渲染（无效格、星空黑洞） | 背景图像素自动识别（Phase 2） |
| 玩法（生成、吞噬、输入） | 背景图 sidecar 持久化 |
| 编辑器 UI 与 overlay | 音效 |

---

## 2. 异形棋盘

### 2.1 行为

- **full**（默认）：`width × height` 全部有效
- **custom**：仅 `playableMask` 内格有效

有效格可：放置物件、Rush 生成、显示空位圆点（游戏）、显示棋盘格（编辑器）。

无效格：与 `THEME.gamePanel` 同色；**不画**中心圆点；不可点击；不可放置；不可生成。

### 2.2 校验

- 有效格集合非空
- 有效格四邻连通成片
- 所有 `itemModels` 占用格 ∈ 有效格

---

## 3. 黑洞区域

### 3.1 行为

- 由一个或多个**互不相交**的正交连通区域组成
- 每格：箭身 newly-enter → 立即吞噬消除（同 K21 逻辑，无 buff runtime、无到期）
- 不可放置任何物件
- Rush 生成排除
- 不显示中心圆点

### 3.2 表现

| 场景 | 表现 |
|------|------|
| 游戏 | 星空烟尘动画（`black-hole-region-drawer.ts`） |
| 编辑器（编辑态） | 选中格白底 |
| 编辑器（完成态） | 持久白底标识 |

### 3.3 约束

- 黑洞格 ⊆ 有效格
- 物件占用格 ∩ 黑洞格 = ∅

---

## 4. 关卡 JSON 契约

### 4.1 字段

```typescript
type BoardShape = "full" | "custom";

interface MaskRows {
  /** [y, startX, endX] 含端点 */
  rows: [number, number, number][];
}

interface LevelData {
  width: number;
  height: number;
  boardShape?: BoardShape;       // 省略或 "full" = 全格有效
  playableMask?: MaskRows;       // custom 时必填
  blackHoleRegions?: MaskRows[]; // 可选，多块区域
  itemModels: RawItem[];
  // ... 其余字段不变
}
```

### 4.2 示例

```json
{
  "width": 20,
  "height": 32,
  "boardShape": "custom",
  "playableMask": {
    "rows": [[5, 2, 10], [6, 1, 12]]
  },
  "blackHoleRegions": [
    { "rows": [[3, 10, 12], [4, 9, 13]] }
  ],
  "itemModels": []
}
```

### 4.3 解析后 GameLevel

```typescript
interface GameLevel {
  // ...
  boardShape: BoardShape;
  playableCells: Set<string>;  // 运行时展开
  blackHoleCells: Set<string>; // 所有 region 合并
}
```

---

## 5. 编辑器需求

### 5.1 UI 布局

在 `canvas-wrap` 与 `props-panel` 之间新增 **`board-region-tools`** 竖条：

| 按钮 | 行为 |
|------|------|
| 异形棋盘编辑 | 进入 playable 编辑模式 |
| 黑洞区域编辑 | 进入 blackHole 编辑模式 |
| 导入背景图 | 文件选择 jpg/png ≤2MB |
| 删除背景图 | 导入后替换「导入」按钮 |

### 5.2 编辑模式

- 与试玩、子区域编辑（`zoneInstanceId`）**互斥**
- 单格点击 toggle；拖拽矩形批量 toggle
- 异形：选中 **绿色**；完成 → 无效格置灰
- 黑洞：仅可选有效格；选中 **白色**；完成 → 持久白底
- 「编辑完成」写入 meta 并退出模式

### 5.3 背景图

- 绘制在棋盘底层
- 格线、行列编号加粗
- **不出现在**试玩与游戏中
- 不序列化到关卡 JSON

---

## 6. 校验规则

| ID | 级别 | 规则 |
|----|------|------|
| V-BOARD-01 | error | custom 时 playable 非空且四邻连通 |
| V-BOARD-02 | error | 物件坐标必须在 playable 内 |
| V-BOARD-03 | error | 黑洞格 ⊆ playable |
| V-BOARD-04 | warning | 每个 blackHole region 四邻连通 |
| V-BOARD-05 | error | 物件与黑洞格不重叠 |

---

## 7. 共享模块 API（`board-mask.ts`）

| 函数 | 说明 |
|------|------|
| `expandMaskRows(w, h, rows)` | span → `Set<string>` |
| `compressCellsToRows(cells, w, h)` | 格集合 → 行 span |
| `buildBoardMaskFromLevel(data)` | 构建 playable / blackHole |
| `isPlayableCell(key, level)` | 是否有效格 |
| `isBlackHoleCell(key, level)` | 是否黑洞格 |
| `isOrthogonallyConnected(cells)` | 连通性检测 |

---

## 8. Phase 2（不在本期）

- 背景图像素颜色规则自动识别有效格 / 黑洞格
- 背景图 sidecar 或嵌入关卡
- AI 生成异形棋盘 prompt

---

## 9. 测试关

- **level-9036**：异形 playable + 双黑洞 region + Rush 配置
- manifest 注册 `boardTests` 或并入 `rushTests`

---

## 10. 验收标准

1. 旧关卡无新字段 → 行为与现网一致
2. custom 关卡：无效格无圆点、不可交互
3. 箭进入黑洞区域 → 消除并计目标
4. Rush 不在无效格 / 黑洞格生成
5. 编辑器：选格 → 保存 → 重载 → 试玩一致
6. validator V-BOARD-01~05 覆盖
