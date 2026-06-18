# arrow_jaw 新机制开发需求文档（P5）

> **版本**：v0.1  
> **日期**：2026-06-15  
> **状态**：待开发  
> **关联文档**：[Arrow Jam 新增规则内容.md](Arrow%20Jam%20新增规则内容.md) · [arrow_jaw_开发需求文档.md](arrow_jaw_开发需求文档.md) · [arrow_jaw_新机制开发步骤拆解.md](arrow_jaw_新机制开发步骤拆解.md) · [Arrow 关卡结构说明.md](Arrow%20关卡结构说明.md)

---

## 1. 概述

### 1.1 目标

在已完成 P0–P4（kind 1/3/4/6/8/11/12）的基础上，为游戏客户端增加 **4 种新物件机制**：

| kind | 名称 | 核心作用 |
|------|------|----------|
| 2 | 翻转箭 | 其他箭消除时翻转朝向 |
| 5 | 定时炸弹 | 宿主箭须在倒计时内消除，否则失败 |
| 7 | 移动墙 | 箭消除时沿路径移动，阻挡发射 |
| 13 | 冻结箭 | 覆盖宿主箭，邻接箭消除后解冻 |

### 1.2 范围

| 在范围 | 不在范围 |
|--------|----------|
| `code/client` 游戏逻辑与渲染 | 关卡编辑器绘制/校验 UI |
| `code/shared` 类型、解析、校验扩展 | 正式主线关卡（L25–L64）改造 |
| dev 测试关 9001–9004 + manifest 测试分组 | 音效、复杂粒子 |

### 1.3 与 P0–P4 关系

本需求定义为 **P5 阶段**，不修改 P0–P4 已验收关卡的玩法与数据。

---

## 2. 术语

### 2.1 覆盖状态（Covered）

物件处于以下任一情形时，视为**覆盖状态**：

1. 位于**未揭示**的 kind 12 子区域内  
2. 格点被激活的 kind 6 幕布遮盖  
3. 被 kind 13 冻结 overlay 绑定且 `health > 0`  

覆盖状态下：箭不可点击发射、kind 2 不响应翻转、kind 5 炸弹不开始倒计时。

### 2.2 消除事件（EliminationEvent）

一次或一批 kind 1 / kind 2 箭从棋盘**移除**（飞出消除或湮灭消除），计为 **1 次消除事件**。

| 来源 | 计入 | 批处理 |
|------|------|--------|
| 正常飞出消除（含捆绑整组） | 是 | 同动画 `memberIds` 为 1 批 |
| 随机消除 / 指定消除（湮灭） | 是 | 同一次 `tryRandomVanish` 为 1 批 |
| bump 弹回（未消除） | 否 | — |
| 管道扣血（箭未移除） | 否 | — |

### 2.3 可操作箭（Operable Arrow）

kind 1 或 kind 2，且**非覆盖状态**，且通过子区域/幕布可见性判定。

---

## 3. kind 映射扩展

在 [arrow_jaw_开发需求文档.md](arrow_jaw_开发需求文档.md) §2 基础上增加：

| 玩法术语 | kind | layer | kind 12 子项 |
|----------|------|-------|--------------|
| 翻转箭 | 2 | 2 | 允许 |
| 定时炸弹 | 5 | 3 | 允许 |
| 移动墙 | 7 | 2 | **v1 仅顶层** |
| 冻结箭 | 13 | 8 | 允许 |

### 3.1 layer 补充

| layer | 关联 kind | 角色 |
|-------|-----------|------|
| 8 | 6, **13** | 幕布目标层 / 冻结 overlay |

---

## 4. 共用规则

### 4.1 消除后处理顺序

每批箭移除后，按序执行（逻辑层，动画可排队）：

1. 既有副作用：钥匙奖励 → 管道扣血 → 子区域揭示判定  
2. kind 13：邻接减血、可能解除冻结  
3. kind 2：非覆盖翻转箭各翻转一次  
4. kind 7：所有移动墙沿路径移动  
5. kind 5：检查激活/超时；移除已消宿主上的炸弹  
6. 重建 CellMap；胜负判定  

### 4.2 与道具交互

| 道具 | kind 2 | kind 5 | kind 7 | kind 13 |
|------|--------|--------|--------|---------|
| 自动消除 | 可选取可发射的 kind 2 | — | 墙仍阻挡路径 | 冻结箭不可操作 |
| 随机/指定湮灭 | 可湮灭非冻结 kind 2 | 宿主湮灭则炸弹移除 | 触发墙移动 | **不可湮灭**冻结宿主 |
| 消除批处理 | 同批多箭仍只翻转 1 次 | — | 每批移动 1 次 | 邻接减血 |

### 4.3 与既有机制交互

| 机制 | 交互 |
|------|------|
| kind 8 捆绑 | kind 2 可捆绑；整组消除为 1 批 |
| kind 11 钥匙 | 可叠在 kind 2；规则同 kind 1 |
| kind 3 管道 | 移动墙格与箭身格同等阻挡射线 |
| kind 4 角块 | 翻转箭、冻结箭均参与折射/阻挡照旧 |
| kind 6 幕布 | 幕布下炸弹不激活 |
| kind 12 子区域 | 未揭示区内新物件均覆盖 |

---

## 5. kind 2 — 翻转箭

### 5.1 行为

- 发射规则与 kind 1 相同（路径检测、捆绑、管道、角块、幕布）。  
- 运行时当前朝向为 `direction`，初始等于 `direction1`。  
- 每次消除事件：棋盘上所有**非覆盖** kind 2 各翻转一次。  
- 翻转：`occupiedPositions` 反转；`direction` 在 `direction1` ↔ `direction2` 切换。  

### 5.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 2 | 固定 |
| occupiedPositions | Vec2[] | 尾→头，同 kind 1 |
| direction1 | Direction | 默认头部朝向 |
| direction2 | Direction | 翻转后头部朝向 |
| colorId | number | 同 kind 1 |
| layer | 2 | 同 kind 1 |
| instanceId | number | 全关唯一 |

### 5.3 校验（V-NEW-02）

- `direction1`、`direction2` ∈ {1,2,3,4} 且互不相同（警告若相同）。  
- 以 direction1 从尾格射线、以 direction2 从首格射线，均不得被**自身身段格**阻挡。  

### 5.4 动画

- `LaunchAnimation.mode = "flip"`（或等价翻转动画状态）。  
- 视觉效果：头部翻转后身段滑动至新头部位置。  

---

## 6. kind 5 — 定时炸弹

### 6.1 行为

- 绑定在 kind 1/2 箭的**某一格**（通常头部格）。  
- 炸弹与宿主均非覆盖时，开始独立倒计时 `time`（秒）。  
- `remainingTime <= 0` → `phase = "lost"`。  
- 宿主箭消除 → 炸弹移除。  

### 6.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 5 | 固定 |
| occupiedPositions | Vec2[] | 长度 1，与宿主箭某格重合 |
| time | number | 激活后倒计时秒数 |
| layer | 3 | 固定 |

### 6.3 校验（V-NEW-05）

- `occupiedPositions.length === 1`。  
- 须存在 kind 1/2 箭占用同格。  

### 6.4 HUD

- 显示**最紧迫**一枚已激活炸弹的剩余秒数 + 钟表图标。  

### 6.5 渲染

- 未激活：灰钟；激活：红色倒计时；爆炸：烟尘占位（Canvas 圆形扩散）。  

---

## 7. kind 7 — 移动墙

### 7.1 行为

- 每次消除事件：所有 kind 7 沿 `movingPath` 移动 `movingDistance` 格。  
- `movingType`：1=往复（到头反向）；2=环绕（尾格下一格为 path[0]）。  
- 墙身格纳入路径阻挡；与 kind 1/2 头射线上遇墙则不可发射。  

### 7.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 7 | 固定 |
| occupiedPositions | Vec2[] | 墙身初始占格（连续块） |
| movingPath | Vec2[] | 墙参考点（首格）路径 |
| movingDistance | number | 每次移动格数 ≥ 1 |
| movingType | 1 \| 2 | 往复 / 环绕 |
| layer | 2 | 同 kind 1 |

### 7.3 移动语义

- 墙身为刚性平移：`occupiedPositions` 各格沿 path 同步位移。  
- path 索引跟踪墙首格在 `movingPath` 中的位置。  
- v1 **不支持** kind 12 子区域内移动墙。  

### 7.4 校验（V-NEW-07）

- `movingPath.length >= 2`。  
- `movingDistance >= 1`。  
- 初始 `occupiedPositions` 在棋盘内。  

---

## 8. kind 13 — 冻结箭

### 8.1 行为

- 与整条 kind 1/2 **同格同序**绑定；`layer = 8`。  
- 冻结中宿主箭为**覆盖状态**。  
- 任意 kind 1/2 被消除时，若其任一格与冻结区任一格 **4 邻接**（上下左右），该冻结 `health -= 1`。  
- `health === 0` → 移除 overlay，宿主可操作。  
- 多个冻结区共享邻接箭时，**每个**冻结区各减 1。  

### 8.2 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| kind | 13 | 固定 |
| occupiedPositions | Vec2[] | 与宿主箭完全一致 |
| health | number | 初始血量 ≥ 1 |
| layer | 8 | 固定不可改 |

### 8.3 校验（V-NEW-13）

- 须存在 kind 1/2 箭与 `occupiedPositions` 完全一致。  
- `health >= 1`。  

### 8.4 渲染

- 冷蓝色不规则晶状 overlay，半透明，不遮挡格心逻辑。  

---

## 9. JSON Schema 摘要

### 9.1 kind 2 示例

```json
{
  "kind": 2,
  "instanceId": 101,
  "layer": 2,
  "direction1": 3,
  "direction2": 4,
  "colorId": 7,
  "occupiedPositions": [[4, 5], [5, 5], [6, 5]]
}
```

解析后运行时 `direction = direction1`。

### 9.2 kind 5 示例

```json
{
  "kind": 5,
  "instanceId": 201,
  "layer": 3,
  "time": 15,
  "occupiedPositions": [[6, 5]]
}
```

### 9.3 kind 7 示例

```json
{
  "kind": 7,
  "instanceId": 301,
  "layer": 2,
  "occupiedPositions": [[8, 4], [8, 5]],
  "movingPath": [[8, 4], [8, 5], [8, 6], [8, 7]],
  "movingDistance": 1,
  "movingType": 1
}
```

### 9.4 kind 13 示例

```json
{
  "kind": 13,
  "instanceId": 401,
  "layer": 8,
  "health": 2,
  "occupiedPositions": [[2, 3], [3, 3]]
}
```

### 9.5 kind 12 子项扩展

v1 允许子项 kind：**1, 2, 4, 5, 8, 13**（**不含 7**）。

---

## 10. 校验规则扩展

| ID | 严重度 | 规则 |
|----|--------|------|
| V-NEW-02 | error | kind 2 缺 direction1/2 或头尾射线被自身阻挡 |
| V-NEW-05 | error | kind 5 非单格或未绑定箭 |
| V-NEW-07 | error | kind 7 缺 path/距离/类型或置于子区域 |
| V-NEW-13 | error | kind 13 未绑定箭或 health < 1 |
| V06 更新 | error | kind 12 子项 kind 白名单扩展 |

---

## 11. 功能需求（FR-NEW）

| ID | 描述 | 验收 |
|----|------|------|
| FR-NEW-01 | 解析并加载 kind 2/5/7/13 | 9001–9004 无解析错误 |
| FR-NEW-02 | 消除事件批处理触发翻转 | 捆绑/随机多箭只翻 1 次 |
| FR-NEW-03 | 覆盖状态统一判定 | 冻结/幕布/子区域一致 |
| FR-NEW-04 | 移动墙阻挡路径检测 | 9002 墙挡路、移开后可发射 |
| FR-NEW-05 | 冻结邻接减血与公共邻接 | 9003 两步解冻 |
| FR-NEW-06 | 炸弹激活倒计时与失败 | 9004 超时 lost |
| FR-NEW-07 | dev 测试关在选关「机制测试」区 | manifest.devTests |
| FR-NEW-08 | P0–P4 主线 40 关回归无破坏 | 自动化 + 抽测 |

---

## 12. 渲染规格

| 物件 | 样式要点 |
|------|----------|
| kind 2 | 与 kind 1 相同折线箭；可选翻转中缩放提示 |
| kind 5 | 格心钟表图标 + 倒计时数字 |
| kind 7 | 深灰实心块 + 浅灰边框 |
| kind 13 | `#7dd3fc` 晶状多边形 overlay |

绘制顺序（后绘在上）：区域底 → 管道 → 移动墙 → 箭 → 冻结 overlay → 炸弹/钥匙/捆绑。

---

## 13. 测试关卡规格（9001–9004）

| ID | 名称 | 棋盘 | 验证点 |
|----|------|------|--------|
| 9001 | [测] 翻转箭 | 12×12 | 2×kind2 + 1×kind1；消 kind1 后 kind2 翻转且可发射 |
| 9002 | [测] 移动墙 | 14×14 | kind7 往复挡路；消另一箭后墙移开可发射 |
| 9003 | [测] 冻结解冻 | 12×12 | kind13 health=2；两侧邻接箭分步解冻 |
| 9004 | [测] 定时炸弹 | 12×12 | kind5 time=15；幕布揭示后倒计时；超时失败 |

关卡文件：`code/client/public/levels/level-9001.json` … `level-9004.json`。

manifest 扩展 `devTests` 数组，选关 UI 单独分组。

---

## 14. 风险与默认决策

| ID | 问题 | 默认决策 |
|----|------|----------|
| RISK-NEW-01 | kind 13 邻接定义 | 4 方向正交，不含对角 |
| RISK-NEW-02 | kind 7 在子区域 | v1 禁止，校验报错 |
| RISK-NEW-03 | 翻转与移动墙动画排队 | 逻辑立即生效，动画可简化 |
| RISK-NEW-04 | kind 2 与 kind 1 类型 | 统一 `ArrowItem`，`kind: 1 \| 2` |
| RISK-NEW-05 | 炸弹与关卡限时 | 独立 `time`，HUD 单独显示 |

---

## 附录：代码索引（规划）

| 模块 | 路径 |
|------|------|
| 类型 | `code/shared/src/types.ts` |
| 解析 | `code/shared/src/parser.ts` |
| 校验 | `code/shared/src/validator.ts` |
| 翻转 | `code/client/src/core/mechanics/flip.ts` |
| 炸弹 | `code/client/src/core/mechanics/bomb.ts` |
| 移动墙 | `code/client/src/core/mechanics/moving-wall.ts` |
| 冻结 | `code/client/src/core/mechanics/frozen.ts` |
| 状态机 | `code/client/src/core/game/game-state.ts` |
| 路径 | `code/client/src/core/board/path-check.ts` |
| 渲染 | `code/client/src/render/board-renderer.ts` |

---

*文档结束*
