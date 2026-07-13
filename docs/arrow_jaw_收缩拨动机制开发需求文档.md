# arrow_jaw 收缩拨动机制开发需求文档（P8）

> **版本**：v0.1  
> **日期**：2026-06-16  
> **状态**：待开发  
> **关联文档**：[新增两种机制.md](新增两种机制.md) · [新增两种机制编辑器需求.md](新增两种机制编辑器需求.md) · [arrow_jaw_收缩拨动机制开发步骤拆解.md](arrow_jaw_收缩拨动机制开发步骤拆解.md) · [arrow_jaw_新机制开发需求文档.md](arrow_jaw_新机制开发需求文档.md) · [arrow_jaw_开发需求文档.md](arrow_jaw_开发需求文档.md) · [arrow_jaw_爽快版开发需求文档.md](arrow_jaw_爽快版开发需求文档.md)（V2 与 P8 机制共存）

---

## 0. 源文档勘误

| 位置 | 原文 | 修正 |
|------|------|------|
| [新增两种机制.md](新增两种机制.md) §二 L55 | kind15（收缩障碍） | **kind14** |
| [新增两种机制编辑器需求.md](新增两种机制编辑器需求.md) §三 L91 | 点击 kind15 控制器的物件按钮 | **kind16** 控制器 |
| 源文档 kind16 拼写 | Controler | JSON 字段沿用 `kind: 16`；文档中文称「控制器」 |
| 阶段代号 P8 | 本文档 P8 指**收缩拨动机制**客户端扩展 | [arrow_jaw_关卡编辑器开发需求文档.md](arrow_jaw_关卡编辑器开发需求文档.md) 中「P8」指 **AI 辅助生成**，二者无关 |

本文档在源文档未明确处给出**推荐默认决策**（见 §13），实现以本文档为准。

---

## 1. 概述

### 1.1 目标

在已完成 P5（kind 2/5/7/13）的基础上，为游戏客户端增加 **3 种新物件**，实现两套联动机制：

| kind | 名称 | 核心作用 |
|------|------|----------|
| 14 | 收缩障碍（Shrink pipe） | 绑定管道侧面；箭完整穿越管道后向管道侧缩短 |
| 15 | 拨动杆（Toggle） | 不阻挡箭；箭路径穿过时切换方向，向同组控制器发信号 |
| 16 | 控制器（Controller） | 绑定 kind2/4/7/14；接收同组拨动杆信号，触发宿主物件行为 |

### 1.2 范围

| 在范围 | 不在范围 |
|--------|----------|
| `code/client` 游戏逻辑与渲染 | 正式主线关卡（L25–L64）改造 |
| `code/shared` 类型、解析、校验、序列化 | 音效、复杂粒子 |
| dev 测试关 9024–9026 + manifest 测试分组 | Electron 桌面包装 |
| **附录 A** 编辑器需求摘要（实施见步骤拆解附录） | AI 关卡生成 prompt 改造 |

### 1.3 与 P5 关系

本需求定义为 **P8 阶段**，不修改 P0–P5 已验收关卡的玩法与数据。P5 消除批处理、覆盖状态、管道穿越等规则继续适用；P8 在此基础上扩展触发源与物件类型。

---

## 2. 术语

### 2.1 管道穿越事件（PipeTraverseEvent）

kind 1 或 kind 2 箭从管道**入口**进入并在同一次发射动画中从**出口**离开，计为对该管道的一次穿越。运行时复用 `LaunchAnimation.pipesCrossedById` 与 `advanceArrowStep` 返回的 `pipeExitedId`；同一管道在一次发射中多次进出仅计 **1 次**（去重后处理）。

### 2.2 分组联动组（ToggleGroup）

相同 `groupID` 的 kind 15（拨动杆）与 kind 16（控制器）构成一组。拨动杆方向变更时，向同组所有**非覆盖**控制器广播信号；各控制器并行驱动其 `bindInstanceId` 宿主。

### 2.3 覆盖状态（Covered）

沿用 P5 定义（未揭示子区域 / 幕布遮盖 / 冻结覆盖）。P8 扩展：

| 物件 | 覆盖时行为 |
|------|------------|
| kind 15 拨动杆 | 箭穿过**不**切换方向、不发信号 |
| kind 16 控制器 | **不**执行宿主逻辑 |
| kind 14 收缩障碍 | 仍阻挡路径；管道穿越缩短仍生效（障碍格可见性按幕布判定） |

### 2.4 缩短操作（ShortenOp）

kind 14 的 `occupiedPositions` 从**远离 `bindCoordinate` 的一端**裁掉 `shorten` 个格点。逻辑层**即时**生效；渲染层可对格点变化做缓动（约 300–500ms，不阻塞后续操作）。

### 2.5 可操作箭（Operable Arrow）

同 P5：kind 1 或 kind 2，非覆盖，且通过可见性判定。

---

## 3. kind 映射扩展

在 P5 kind 表基础上增加：

| 玩法术语 | kind | layer | kind 12 子项 |
|----------|------|-------|--------------|
| 收缩障碍 | 14 | 3 | 允许 |
| 拨动杆 | 15 | 3 | 允许 |
| 控制器 | 16 | 3 | 允许 |

### 3.1 kind 4 反射角扩展字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| spin | 0 \| 90 \| 180 \| 270 | 0 | 拨动触发时旋转角度；0 表示不旋转 |
| spinDirection | 0 \| 1 | 0 | 0=顺时针，1=逆时针 |

未绑定控制器的反射角：`spin` 缺省为 0，行为与 P0–P4 一致。

### 3.2 渲染层级（自底向上）

区域底 → 管道 → **箭** → 收缩障碍 → 角块 → 拨动杆/控制器 → 捆绑/钥匙/炸弹 → 冻结 overlay → 幕布

> 箭先于管道下层绘制时管道可遮挡穿行箭身（P5 已约定）；收缩障碍在箭之上，便于观察绑定关系。

---

## 4. 共用规则

### 4.1 事件处理时序

**箭发射动画每步**（`advanceExitAnimation` / `advanceBumpAnimation` 内箭位更新后）：

1. 检测本步是否穿过 kind 15 → 切换拨动杆 → 触发同组控制器  
2. 控制器并行执行宿主逻辑（kind2 翻转 / kind4 旋转 / kind7 单步 / kind14 缩短）

**箭消除飞出完成**（`completeLaunchAnimation`）：

1. 既有：`onArrowEliminationBatch`（冻结 → 翻转 → 移动墙 → 炸弹…）  
2. `applyPipeCrossingDamage`：管道扣血  
3. **P8 新增**：对 `pipesCrossedById` 去重后，触发绑定管道的 kind 14 缩短  
4. 管道 `health === 0` 时移除管道及绑定 kind 14  

### 4.2 与 P5 消除批处理的关系

| 触发源 | kind 2 翻转 | kind 7 移动 | kind 14 缩短 |
|--------|-------------|-------------|--------------|
| 消除事件（P5） | 非覆盖 kind2 各翻 1 次 | 所有墙移动 1 次 | — |
| 拨动杆（P8） | 仅**绑定控制器**的 kind2 翻 1 次 | 仅绑定墙单步 | 缩短，不影响管道 |
| 管道穿越（P8） | — | — | 绑定该管道的 kind14 缩短 |

拨动触发的 kind2 翻转**不受**「同批消除只翻一次」限制；消除与拨动在同帧可先后各触发一次（先拨动步进，后消除批）。

### 4.3 与既有机制交互

| 机制 | 交互 |
|------|------|
| kind 3 管道 | kind14 绑定 `bindCoordinate` 须在管道占格上；穿越触发缩短；管毁障碍消 |
| kind 4 角块 | 未绑控制器：原折射；绑控制器：拨动按 spin 旋转反射面 |
| kind 7 移动墙 | 未绑控制器：消除驱动；绑控制器：拨动单步；墙格与 kind14 格均阻挡 |
| kind 8 捆绑 | kind14 可绑在捆绑箭邻近管道；穿越判定按 member 管道记录 |
| kind 12 子区域 | kind14/15/16 可入子项；未揭示区内拨动杆/控制器不生效 |
| kind 6 幕布 | 幕布下拨动杆不响应、控制器不执行 |

### 4.4 阻挡规则

- kind 14 占格纳入 `extraBlockerCells`（与移动墙同级），参与 `simulateCanExit`、`advanceArrowStep` 阻挡判定。  
- kind 15 / kind 16 **不阻挡** kind 1/2 移动与路径检测。

---

## 5. kind 14 — 收缩障碍

### 5.1 行为

1. 绑定在 kind 3 管道的**某一格**（`bindCoordinate`），障碍路径贴邻管道**一侧**，允许折线，与管道无间隔。  
2. 显示从 `bindCoordinate` 起沿路径的第一个**非管道格**开始绘制（管道格本身不画障碍纹理，仅画卡扣）。  
3. kind 1/2 **完整穿越**绑定管道后：障碍向管道侧缩短 `shorten` 格。  
4. 若缩短后剩余 **1 格**且管道 `health > 0`：**停止**再缩短。  
5. 管道 `health === 0`：管道与绑定障碍**一并移除**。  
6. 同组拨动杆触发时：绑定控制器的 kind14 执行缩短，**不**扣管道血、**不**要求穿越。

### 5.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 14 | 固定 |
| layer | 3 | 固定 |
| instanceId | number | 全关唯一 |
| occupiedPositions | Vec2[] | 折线路径，长度 ≥ 2；须含 `bindCoordinate` |
| bindCoordinate | Vec2 | 绑定的管道单格坐标 |
| shorten | number | 每次缩短格数，≥ 1 |
| zoneId | number \| null | 解析期注入（子区域） |

### 5.3 缩短算法

1. 在 `occupiedPositions` 中找到距 `bindCoordinate` **曼哈顿距离最远**的端点作为裁切端。  
2. 从裁切端删除 `min(shorten, len-1)` 格（保证缩短后至少剩 1 格，除非随后管道销毁）。  
3. 若 `len === 1` 且管道 `health > 0`：忽略后续缩短请求。

### 5.4 校验（V-P8-14）

- `bindCoordinate` 须落在某 kind 3 管道 `occupiedPositions` 内。  
- `occupiedPositions` 相邻格曼哈顿距离为 1，全部在棋盘内。  
- 障碍路径须贴邻管道一侧（与管道占格 4 邻接，且不跨越管道两侧）。  
- `shorten >= 1`。

### 5.5 渲染

- 螺旋纹双色条带（类似发廊灯），贴管道侧。  
- `bindCoordinate` 与管道接触处绘制**卡扣**小图标表示绑定。  
- 缩短时格点缓动收缩（逻辑已更新，画面追赶）。

---

## 6. kind 15 — 拨动杆

### 6.1 行为

1. 占 **1 格**，不阻挡 kind 1/2。  
2. 箭每步移动后，若本步路径（新旧 `occupiedPositions` 并集）经过拨动杆格，且拨动杆**非覆盖**：切换 `direction`（1 ↔ 2，表示左/右两种视觉状态）。  
3. 同一步内同一拨动杆最多触发 **1 次**。  
4. 方向变更后：同 `groupID` 下所有非覆盖 kind 16 控制器执行宿主逻辑；同组控制器指示灯闪一下。

### 6.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 15 | 固定 |
| layer | 3 | 固定 |
| occupiedPositions | Vec2[] | 长度 1 |
| groupID | number | 分组编号，≥ 1 |
| direction | 1 \| 2 | 拨动状态，默认 1 |

### 6.3 校验（V-P8-15）

- `occupiedPositions.length === 1`。  
- `groupID` 为正整数。  
- 格点不与其它物件占格冲突（按编辑器重叠规则）。

### 6.4 渲染

- 原始拨杆开关造型，占格心；显示 `groupID` 编号。  
- 切换时拨杆姿态变化；同组控制器灯同步闪烁。

---

## 7. kind 16 — 控制器

### 7.1 行为

1. 占 **1 格**，须落在宿主物件 `occupiedPositions` 范围内。  
2. `bindInstanceId` 指向 kind 2 / 4 / 7 / 14 之一。  
3. 收到同组拨动杆信号且控制器**非覆盖**时，对宿主执行 **1 次**行为（见 §7.3）。  
4. 同一信号下多个控制器**并行**执行，互不阻塞。

### 7.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 16 | 固定 |
| layer | 3 | 固定 |
| occupiedPositions | Vec2[] | 长度 1，在宿主占格内 |
| groupID | number | 与 kind 15 同组 |
| bindInstanceId | number | 宿主 instanceId |

### 7.3 宿主行为

| 宿主 kind | 行为 |
|-----------|------|
| 2 翻转箭 | 调用 `flipArrow`：反转 positions，切换 direction1 ↔ direction2 |
| 4 反射角 | 按 `spin`、`spinDirection` 旋转 `direction1`/`direction2` 向量（90° 倍数） |
| 7 移动墙 | `MovingWallManager.advanceWall(id)` 单步（同消除驱动语义） |
| 14 收缩障碍 | 执行 §5.3 缩短，**不**影响管道血量 |

未绑定控制器的 kind 2/4/7 保持 P5 规则（消除触发翻转/墙移；反射角不转）。

### 7.4 校验（V-P8-16）

- `bindInstanceId` 须存在且 kind ∈ {2,4,7,14}。  
- 控制器格须在宿主 `occupiedPositions` 内。  
- 同一宿主可有多个控制器（不同 groupID）；同一 groupID 下允许多个控制器绑不同宿主。

### 7.5 分组校验（V-P8-GROUP）

保存关卡时：每个出现的 `groupID` 须至少包含 **1** 个 kind 15 与 **1** 个 kind 16。

### 7.6 渲染

- 格心红色指示灯 + `groupID` 编号。  
- 触发时灯闪烁一次。

---

## 8. JSON Schema 摘要

### 8.1 kind 14 示例

```json
{
  "kind": 14,
  "instanceId": 1401,
  "layer": 3,
  "bindCoordinate": [4, 5],
  "shorten": 2,
  "occupiedPositions": [[4, 5], [4, 6], [4, 7], [4, 8]]
}
```

### 8.2 kind 15 示例

```json
{
  "kind": 15,
  "instanceId": 1501,
  "layer": 3,
  "groupID": 1,
  "direction": 1,
  "occupiedPositions": [[6, 5]]
}
```

### 8.3 kind 16 示例

```json
{
  "kind": 16,
  "instanceId": 1601,
  "layer": 3,
  "groupID": 1,
  "bindInstanceId": 701,
  "occupiedPositions": [[8, 5]]
}
```

### 8.4 kind 4 扩展示例（绑控制器时）

```json
{
  "kind": 4,
  "instanceId": 401,
  "layer": 2,
  "direction1": [0, 1],
  "direction2": [1, 0],
  "spin": 90,
  "spinDirection": 0,
  "occupiedPositions": [[8, 4]]
}
```

### 8.5 kind 12 子项扩展

P8 允许子项 kind：**1, 2, 4, 5, 8, 13, 14, 15, 16**（仍 **不含 7**）。

### 8.6 GameLevel 扩展

```typescript
interface GameLevel {
  // ...既有字段
  shrinkPipes: ShrinkPipeItem[];
  toggles: ToggleItem[];
  controllers: ControllerItem[];
}
```

解析期：`bindInstanceId` 校验宿主存在；kind14 解析 `bindPipeId`（运行时由 `bindCoordinate` 反查管道）。

---

## 9. 校验规则扩展

| ID | 严重度 | 规则 |
|----|--------|------|
| V-P8-14 | error | kind 14：bindCoordinate 在管道上；路径贴邻；shorten ≥ 1 |
| V-P8-15 | error | kind 15：单格；groupID 有效 |
| V-P8-16 | error | kind 16：宿主合法；格点在宿主占格内 |
| V-P8-GROUP | error | 每 groupID 至少 1×kind15 + 1×kind16 |
| V-P8-CORNER | error | 有控制器绑定的 kind4 须 spin/spinDirection 合法 |
| V06 更新 | error | kind 12 子项白名单增加 14/15/16 |

---

## 10. 功能需求（FR-P8）

| ID | 描述 | 验收 |
|----|------|------|
| FR-P8-01 | 解析并加载 kind 14/15/16 | 9024–9026 无解析错误 |
| FR-P8-02 | 管道穿越触发缩短 + 终止条件 | 9024 |
| FR-P8-03 | 拨动杆穿越切换 + 分组信号 | 9025 |
| FR-P8-04 | 控制器驱动 kind2/4/7/14 | 9026 |
| FR-P8-05 | 幕布/子区域覆盖下拨动杆与控制器不生效 | 9025/9026 变体 |
| FR-P8-06 | 收缩/拨动/控制器渲染符合规格 | 目视 |
| FR-P8-07 | dev 测试关 manifest.devTests | 选关可见 |
| FR-P8-08 | P0–P5 回归无破坏 | 自动化 + 抽测 |

---

## 11. 渲染规格

| 物件 | 样式要点 |
|------|----------|
| kind 14 | 双色螺旋纹折线条带；管道侧卡扣 |
| kind 15 | 左右拨杆 + groupID 数字 |
| kind 16 | 红色中心灯 + groupID；触发闪烁 |
| kind 4 spin | 反射面旋转动画与拨动同步 |

绘制入口：`mechanics-drawer.ts` 新增 `drawShrinkPipe`、`drawToggle`、`drawController`；`board-renderer.ts` 按 §3.2 顺序调用。

---

## 12. 测试关卡规格（9024–9026）

| ID | 名称 | 棋盘 | 验证点 |
|----|------|------|--------|
| 9024 | [测] 收缩障碍 | 14×14 | 1 管道 health=3 + kind14 shorten=2；穿越 2 次后剩 1 格不再缩；第 3 次穿越管毁障碍消 |
| 9025 | [测] 拨动杆 | 12×12 | 1 组 kind15+kind16 控 kind7；箭穿过拨杆 → 墙移动 1 步 |
| 9026 | [测] 分组联动 | 16×16 | 2 组；含 kind2 翻转、kind4 spin90、kind14 拨动缩短 |

关卡文件：`code/client/public/levels/level-9024.json` … `level-9026.json`。  
manifest 扩展 `devTests` 数组。

---

## 13. 风险与默认决策

| ID | 问题 | 默认决策 |
|----|------|----------|
| RISK-P8-01 | 缩短裁切端 | 距 bindCoordinate 最远端 |
| RISK-P8-02 | 同格多拨动杆 | 按 instanceId 升序各触发 1 次 |
| RISK-P8-03 | 拨动与消除同帧 | 先执行步进拨动，再执行消除批 |
| RISK-P8-04 | 收缩动画阻塞 | 逻辑即时，渲染缓动不锁操作 |
| RISK-P8-05 | kind14 在捆绑组 | 仅管道穿越触发；拨动缩短独立 |
| RISK-P8-06 | 控制器绑 kind14 时管道 | 缩短不影响管道 health |

---

## 14. 附录：代码索引（规划）

| 模块 | 路径 |
|------|------|
| 类型 | `code/shared/src/types.ts` |
| 解析 | `code/shared/src/parser.ts` |
| 校验 | `code/shared/src/validator.ts` |
| 收缩障碍 | `code/client/src/core/mechanics/shrink-pipe.ts` |
| 拨动/控制 | `code/client/src/core/mechanics/toggle.ts` |
| 角块旋转 | `code/client/src/core/mechanics/corner.ts` |
| 状态机 | `code/client/src/core/game/game-state.ts` |
| 管道 | `code/client/src/core/mechanics/pipe.ts` |
| 渲染 | `code/client/src/render/mechanics-drawer.ts` |

---

## 附录 A — 编辑器需求摘要

> 完整交互说明见 [新增两种机制编辑器需求.md](新增两种机制编辑器需求.md)。实施步骤见 [arrow_jaw_收缩拨动机制开发步骤拆解.md](arrow_jaw_收缩拨动机制开发步骤拆解.md) 附录。

### A.1 kind 14 收缩障碍

| 项 | 要求 |
|----|------|
| 工具栏 | 新增 K14 图标；hover：「收缩障碍：箭头穿过管道触发缩短」 |
| 绘制 | 先选中 kind3 管道 → 激活 K14 → 从管道某一格拖拽绘制折线 |
| 属性 | `bindCoordinate`（管道格）、`shorten`（≥1） |
| 联动 | 移动管道时，绑定 kind14 路径同步平移；可单独选中删除障碍 |
| 校验 | 贴邻管道一侧（阻塞级） |
| 试玩 | 与客户端 `GameState` 逻辑一致 |

### A.2 kind 15 拨动杆

| 项 | 要求 |
|----|------|
| 工具栏 | K15；hover：「拨动杆：箭头穿过触发同组物件动作」 |
| 绘制 | 单格放置；不可与其它物件占格冲突；可放幕布/子区域 |
| 属性 | `groupID` |
| 显示 | 拨杆造型 + 编号 |

### A.3 kind 16 控制器

| 项 | 要求 |
|----|------|
| 工具栏 | K16；hover：「控制器：接收拨动杆信号触发物件动作」 |
| 绘制 | 先选宿主（kind2/4/7/14）→ 点 K16 → 自动落宿主中部格；可拖但限宿主占格内 |
| 属性 | `groupID`、`bindInstanceId`（只读，由绑定决定） |
| 显示 | 红灯 + 编号；触发闪烁 |

### A.4 全局

| 项 | 要求 |
|----|------|
| 分组校验 | 每 groupID 至少 1 拨动杆 + 1 控制器 |
| 绑定校验 | 控制器宿主 kind ∈ {2,4,7,14} |
| 术语 | 「分组联动机制」：同 groupID 的 kind15 与 kind16 |
| 帮助 | 三种机制配置指南与交互示例 |
| 试玩 | 复用 `editor/app.ts` → `GameState` + `BoardRenderer` |

### A.5 kind 4 编辑器扩展

反射角属性面板增加 `spin`、`spinDirection`；仅当存在绑定控制器时建议非 0 spin。

---

*文档结束*
