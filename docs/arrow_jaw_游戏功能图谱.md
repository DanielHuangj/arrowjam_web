# Arrow Jam 游戏功能图谱

> **版本**：v1.0  
> **日期**：2026-06-15  
> **状态**：与仓库 `main` 实现同步（kind 1–8、11–13）  
> **受众**：关卡辅助编辑 AI、策划、程序  
> **关联**：[arrow_jaw_AI关卡编辑指南.md](arrow_jaw_AI关卡编辑指南.md) · [Arrow Jam 可玩性分析.md](Arrow%20Jam%20可玩性分析.md)

---

## 0. 文档说明

### 0.1 用途

本文档是 Arrow Jam **规则与数据结构的权威参考**：描述游戏如何运行、关卡 JSON 如何表达、各 kind 物件如何交互。AI 或人在编写/修改关卡前应优先查阅本文，机制设计原则见《AI 关卡编辑指南》。

### 0.2 与旧文档的差异（以代码为准）

| 主题 | 旧文档 | 当前实现 |
|------|--------|----------|
| 关卡文件名 | `arrowJam-main-level-{N}.json` | `level-{N}.json`（`code/client/public/levels/`） |
| kind12 子项 | 仅 1/4/8（`Arrow 关卡结构说明.md`） | **1/2/4/5/8/13**（`validator.ts` V06） |
| kind 9/10 | 部分枚举预留 | **未实现**，勿写入关卡 |
| 翻转箭 direction 校验 | 编辑器曾校验头尾方向 | 编辑器绘制阶段**不强制**方向与折线一致；运行时仍按 direction1/2 翻转 |

### 0.3 维护约定

规则变更时须同步更新：`code/shared/src/parser.ts`、`validator.ts`、`code/client/src/core/mechanics/` 及本文档对应章节。

---

## 1. 游戏概览

### 1.1 核心目标

在倒计时结束前，将棋盘上**所有箭头（kind 1 / kind 2）**全部发射出界，清空棋盘即胜利。

### 1.2 基本操作

| 操作 | 行为 |
|------|------|
| 点击箭 | 若该箭（或捆绑组）路径可出界，则沿头部方向蛇形步进飞出棋盘 |
| 点击不可出界箭 | 触发 bump 弹回动画，`mistakeCount++` |
| 关卡道具 | 自动/随机/指定消除（测试向 HUD，不写入关卡 JSON） |

### 1.3 游戏阶段（`GamePhase`）

| 阶段 | 含义 |
|------|------|
| `playing` | 可操作；倒计时递减 |
| `animating` | 发射/弹回/湮灭动画中；倒计时仍递减 |
| `exploding` | 炸弹爆炸动画 |
| `won` | 所有箭已清空 |
| `lost` | 失败（见 §1.4） |

### 1.4 胜负条件

| 结果 | 条件 | `lostReason` |
|------|------|--------------|
| **胜利** | `arrows.length === 0` 且仍在限时内完成 | — |
| **失败·超时** | `remainingSeconds <= 0` 且仍有箭（`playing` 阶段触发） | `"time"` |
| **失败·炸弹** | 已激活炸弹倒计时归零 | `"bomb"` |

### 1.5 评价机制

通关后根据**剩余时间**与**误操作次数**（`mistakeCount`）评级，档位含：excellent → well done → amazing → magnificent → superb → terrific。

### 1.6 方向枚举（kind 1 / kind 2）

| `direction` / `direction1` / `direction2` | 含义 |
|------------------------------------------|------|
| 1 | 下（+y） |
| 2 | 上（-y） |
| 3 | 右（+x） |
| 4 | 左（-x） |

kind 1：`direction` 为**头部**（`occupiedPositions` 最后一格）指向。  
kind 2：`direction1` 为默认头（尾→头折线的头部方向）；`direction2` 为翻转后的头部方向（首格为翻转后头部）。

---

## 2. 坐标系与棋盘

| 属性 | 说明 |
|------|------|
| 原点 | 左上角为 (0, 0) |
| x 轴 | 列，向右增大 |
| y 轴 | 行，向下增大 |
| 有效范围 | x ∈ [0, width−1]，y ∈ [0, height−1] |
| 格点 | 整数坐标；箭/管道等为占格物件 |
| 渲染 | `STEP=37` 像素/格，`CELL=34` 为格内绘制区（`colors.ts`） |

---

## 3. 关卡 JSON 结构

### 3.1 文件与路径

- 路径：`code/client/public/levels/level-{N}.json`
- 索引：`code/client/public/levels/manifest.json`

### 3.2 顶层字段（`LevelData`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `width` | number | 是 | 列数 |
| `height` | number | 是 | 行数 |
| `name` | string | 是 | 显示名，可为空字符串 |
| `durationInSec` | number | 是 | 限时秒数，默认 120 |
| `difficulty` | number | 是 | 1=Normal，2=Hard，3=Superhuman |
| `levelKind` | number | 否 | 关卡类型标签 |
| `itemModels` | RawItem[] | 是 | 顶层物件列表 |

### 3.3 物件通用字段（`RawItem`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `kind` | int | 物件类型 |
| `instanceId` | int | 全关唯一（含 kind12 嵌套子项） |
| `layer` | int | 渲染/逻辑层级 |
| `occupiedPositions` | `[[x,y],…]` | 占用格坐标 |
| `items` | RawItem[] | 仅 kind12：子区域内部物件 |

### 3.4 `occupiedPositions` 语义

| kind | 顺序含义 |
|------|----------|
| 1, 2 | 折线 **尾 → 头**；头在最后一格 |
| 3 | 管道路径顺序，与 `passes` 端点对应 |
| 4, 11 | 单格 |
| 6, 12 | 矩形区域全部格（顺序无方向语义） |
| 7 | 墙身占格（与 `movingPath` 独立） |
| 8 | 2–4 格条带，叠在箭身 |
| 13 | 与宿主箭**完全相同**的格序列 |

### 3.5 各 kind 专属字段

| kind | 额外字段 |
|------|----------|
| 1 | `direction`, `colorId` |
| 2 | `direction1`, `direction2`, `colorId` |
| 3 | `health`, `passes`, `healthViewPathIndex` |
| 4 | `direction1`, `direction2`（Vec2，如 `[1,0]`） |
| 5 | `time` |
| 6 | `health`, `order` |
| 7 | `movingPath`, `movingDistance`, `movingType` |
| 8 | — |
| 11 | — |
| 12 | `items` |
| 13 | `health` |

### 3.6 颜色 ID（`colorId`，kind 1/2）

常用：3 红、4 紫、6 绿、7 蓝（编辑器色板与客户端一致）。

---

## 4. Kind 全量机制表

> **未实现**：kind 9、kind 10 — 禁止出现在 `itemModels` 中。

| kind | 名称 | 行为摘要 | 默认 layer | 可入 kind12 | 覆盖态下 |
|------|------|----------|------------|-------------|----------|
| **1** | 折线箭 | 点击发射；尾→头折线 | 2 | 是 | 不可操作 |
| **2** | 翻转箭 | 每消除一批 kind1/2 后，未覆盖的 kind2 翻转方向并反转路径 | 2 | 是 | 不翻转、不可操作 |
| **3** | 管道 | 箭从合法入口进入，沿管身穿出；侧面挡箭；穿出扣 `health` | 2 | **否**（仅顶层） | 区内管道随区域揭示 |
| **4** | 反射角块 | 1 格；箭从 `-direction1` 或 `-direction2` 进入时 90° 折射 | 2 | 是 | 不可单独操作 |
| **5** | 定时炸弹 | 绑定 kind1/2 一格；宿主非覆盖后倒计时；超时失败 | 3 | 是 | 不计时 |
| **6** | 幕布 | 矩形遮挡；格阻挡路径；钥匙消除按 `order` 扣 health | 8 | **否** | 下箭 hidden |
| **7** | 移动墙 | 每消除一箭步进；占格阻挡；`movingType` 1=往复 2=环绕 | 2 | **否** | — |
| **8** | 捆绑条 | 2–4 格；多箭 union-find 成组，须整组同向且可出界 | 3 | 是 | 随宿主箭 |
| **11** | 钥匙箭 | 1 格叠在箭上；该箭消除时给幕布扣血 | 3 | **否** | 随宿主 |
| **12** | 子区域 | 矩形容器；覆盖清除后揭示内部 | 1 | N/A | 未揭示则子项 inactive |
| **13** | 冻结覆盖 | 与整条 kind1/2 同格；宿主不可点；相邻格箭消除扣 health | 8 | 是 | 不可操作 |

---

## 5. 各机制详述

### 5.1 kind 1 — 折线箭

- 占格为正交连续折线，长度 ≥ 1，不可自交。
- 头部方向 `direction` 须与末段走向一致（validator V11）。
- 发射：从头部沿 `direction` 逐格前进，直至离盘或阻挡。

### 5.2 kind 2 — 翻转箭

- 折线语义同 kind 1。
- **翻转触发**：任意一批 kind 1/2 被消除（含捆绑整组、道具湮灭）后触发**一次**全局翻转。
- **翻转对象**：当前**非覆盖**的所有 kind 2。
- **翻转效果**：`direction1` ↔ `direction2`；`occupiedPositions` 数组反转。
- 设计文档要求头尾射线不被自身格阻挡（V-NEW-02 为 warning 级设计约束，编辑器可不强制）。

### 5.3 kind 3 — 管道

- `passes`：至少 2 个端点，每点含 `position` 与 `directions`（允许进入方向）。
- 箭从合法方向进入入口后，沿 `occupiedPositions` 蛇形穿出至出口。
- 管身侧面格阻挡其他箭。
- 每有箭**完整穿出**，`health--`；归零后管道移除，侧面阻挡消失。
- 道具湮灭**不**扣管道 health（未走穿出逻辑）。

### 5.4 kind 4 — 反射角块

- `direction1`、`direction2` 须互相垂直（V09 warning），不可互为反向（V10 error）。
- 箭进入方向为 `-direction1` 或 `-direction2` 时，按角块规则折射 90°。

### 5.5 kind 5 — 定时炸弹

- `occupiedPositions` 为 1 格，须与 kind 1/2 某格重合。
- 宿主处于覆盖态时炸弹**不激活**；揭示后开始 `time` 秒倒计时。
- 宿主被消除则炸弹移除；超时 → `lostReason: "bomb"`。

### 5.6 kind 6 — 幕布

- 矩形区域，`health` 为需消耗的钥匙点数总量。
- `order`：多幕布时，钥匙奖励优先扣 **order 最小** 且 health>0 的幕布。
- 幕布格在路径模拟中视为阻挡；幕布下箭不可见、不可操作。

### 5.7 kind 7 — 移动墙

| 字段 | 说明 |
|------|------|
| `occupiedPositions` | 墙身初始占格 |
| `movingPath` | 移动路径，≥2 格，正交连续，须在棋盘内 |
| `movingDistance` | 每次消除后移动的格数，≥1 |
| `movingType` | 1=往复；2=环绕（末格→首格） |

- 墙身占格阻挡箭前进（`getBlockerCells`）。
- 每消除一箭（kind 1/2），所有墙按路径步进。
- **不可**放在 kind12 子区域内。

### 5.8 kind 8 — 捆绑条

- 占 2–4 格，须叠在箭身格上。
- 多条带通过共享格 union-find 成组；点击组内一箭则**整组**同向发射。
- 须整组 `canLaunchGroup` 为真才可点击。

### 5.9 kind 11 — 钥匙箭

- 1 格，叠在 kind 1/2 某格上。
- 该箭消除时，按消除格数累计钥匙，扣当前最小 `order` 幕布的 health。

### 5.10 kind 12 — 子区域

- 矩形框（layer 1）常显。
- **揭示条件**：覆盖该区域任意格的上层物件全部消除后，内部子项变为 active。
- **覆盖判定**：区域外箭/角，或其他**未揭示**区域的箭/角，若占用本区格则算覆盖。
- **子项坐标**：使用**全局棋盘坐标**（非相对区域）。
- **允许子项 kind**：1、2、4、5、8、13。
- **禁止子项 kind**：3、6、7、11、12。

### 5.11 kind 13 — 冻结覆盖

- `occupiedPositions` 与宿主 kind 1/2 **完全一致**。
- 宿主不可点击发射。
- 当其他箭在**相邻格**被消除时，冻结 `health--`（多冻结共享相邻格时各自扣血）。
- `health` 归零后解除冻结。

---

## 6. 覆盖状态（Hidden / Inactive）

### 6.1 定义

箭头或机制处于以下任一情况即为**覆盖状态**：

1. 位于**未揭示**的 kind12 子区域内  
2. 位于**幕布**遮挡格下  
3. 被 kind13 **冻结**（整条宿主箭）

### 6.2 覆盖态影响

| 机制 | 覆盖态行为 |
|------|------------|
| 箭发射 | 不可点击 |
| kind 5 炸弹 | 不激活、不计时 |
| kind 2 翻转 | 不参与翻转 |
| kind 11 钥匙 | 随宿主不可操作 |
| 道具湮灭 | 不可选中幕布下/未揭示区/捆绑/带钥匙箭 |

---

## 7. Layer 层级

| layer | 典型物件 | 说明 |
|-------|----------|------|
| 1 | kind12 区域框 | 最底，常显 |
| 2 | kind1/2 箭、kind3 管道、kind4 角、kind7 墙 | 主玩法层 |
| 3 | kind5 炸弹、kind8 捆绑、kind11 钥匙 | 叠在箭身 |
| 8 | kind6 幕布、kind13 冻结 | 顶层遮挡 |

管道内穿行时箭在渲染上隐藏。

---

## 8. 路径判定与发射流程

### 8.1 可发射判定（`simulateCanExit`）

从箭头部出发，沿当前头部方向逐步模拟：

1. **角块**：若进入方向匹配，按 `direction1/2` 折射  
2. **管道**：合法入口进入，沿管身走向出口；非法方向视为阻挡  
3. **阻挡物**：其他箭占格、管道侧面、幕布格、移动墙占格  
4. **捆绑**：整组须一起通过上述模拟  

若路径能离开棋盘边界 → 可发射；否则 bump 弹回。

### 8.2 发射动画类型

| 类型 | 触发 |
|------|------|
| `exit` | 路径畅通，蛇形飞出 |
| `bump` | 中途阻挡，原路弹回 |

---

## 9. 消除后连锁时序

每批箭移除后（发射飞出或道具湮灭），`onArrowEliminationBatch` 顺序：

```
1. frozenManager.onAdjacentElimination  — 相邻格消除扣冻结 health
2. flipUncoveredArrows                  — 未覆盖 kind2 翻转
3. wallManager.advanceAll               — 移动墙步进
4. bombManager.removeForHosts           — 移除已无宿主炸弹
5. bombManager.updateActivation         — 更新炸弹激活状态
```

**另并行/前置逻辑**（发射完成时）：

- 钥匙奖励 → 幕布扣血（`applyKeyRewards`）  
- 管道穿出 → `health--`  
- 子区域揭示 → `zoneManager` 更新  

**重要**：同一批消除（如捆绑组、随机消除 3 箭）只触发**一次**翻转。

---

## 10. 附件与互斥（V-EDIT-01）

同一 kind 1/2 箭最多绑定一种附件：

- kind 11 钥匙（单格重合）  
- kind 5 炸弹（单格重合）  
- kind 13 冻结（整路径重合）  

不可同时绑定多种。

---

## 11. 关卡道具（不写入 JSON）

| 道具 | 行为 | 阻挡 | 误操作 |
|------|------|------|--------|
| 自动消除 | 选一条可发射箭，正常 `tryLaunch` | 遵守 | 遵守 |
| 随机消除 | 随机最多 3 条，湮灭淡出 | **无视** | 不计入 |
| 指定消除 | 点选模式湮灭 1 条 | **无视** | 不计入 |

不可湮灭：捆绑箭、带钥匙箭、幕布下、未揭示子区域内箭。

详见 [arrow_jaw_关卡道具需求文档.md](arrow_jaw_关卡道具需求文档.md)。

---

## 12. 校验规则索引（`validator.ts`）

### 12.1 阻塞级错误（severity: error）

| 代码 | 含义 |
|------|------|
| V01 | 缺少 width/height/itemModels |
| V02 | instanceId 重复 |
| V03 | 坐标超出棋盘 |
| V04 | 折线不连续（kind 1/2/3） |
| V05 | kind6/12 区域非完整矩形 |
| V06 | kind12 子项 kind 不在 1/2/4/5/8/13 |
| V07 | 管道 pass 位置不在管身格内 |
| V08 | 管道 passes 少于 2 |
| V10 | 角块 direction 互为反向 |
| V11 | kind1 头部方向与末段不一致 |
| V12 | 折线路径自交 |
| V15 | 捆绑格数不在 2–4 |
| V16 | 缺少必填字段（health、direction 等） |
| V-NEW-02 | 翻转箭缺少 direction1/2/colorId |
| V-NEW-05 | 炸弹 time/占格/宿主无效 |
| V-NEW-07 | 移动墙路径/距离/类型无效或在子区域内 |
| V-NEW-13 | 冻结 health/layer/宿主无效 |
| V-EDIT-01 | 同箭多附件互斥 |

### 12.2 警告（severity: warning）

| 代码 | 含义 |
|------|------|
| V09 | 角块 direction1/2 不垂直 |
| V13 | 幕布 order 重复 |
| V14 | 钥匙未绑定同格箭 |
| V-NEW-02 | 翻转箭 layer 建议为 2 |
| V-NEW-05 | 炸弹 layer 建议为 3 |
| V16 | 幕布 layer 建议为 8 |

编辑器试玩前须 `hasBlockingErrors === false`。

---

## 13. 参考关卡索引

### 13.1 机制测试关（9001–9005）

| ID | 文件 | 机制 |
|----|------|------|
| 9001 | level-9001.json | kind2 翻转箭 |
| 9002 | level-9002.json | kind7 移动墙（往复） |
| 9003 | level-9003.json | kind13 冻结解冻 |
| 9004 | level-9004.json | kind5 定时炸弹 |
| 9005 | level-9005.json | kind7 移动墙（环绕） |

### 13.2 经典主线示例

| ID | 机制侧重 |
|----|----------|
| 26 | kind12 子区域 |
| 41 | kind3 管道 |
| 61 | kind6 幕布 + kind11 钥匙 |

---

## 14. 机制交互总览

```
玩家点击 / 道具湮灭
    ↓
路径模拟（角块 → 管道 → 幕布/墙/箭阻挡）
    ↓
箭移除
    ↓
├─ 钥匙 → 幕布 health--（按 order）
├─ 管道 → health--（仅穿出）
├─ 冻结 → 相邻消除扣 health
├─ kind2 → 翻转（未覆盖）
├─ kind7 → 步进
├─ kind5 → 激活/移除
└─ kind12 → 检查揭示
```

---

## 15. 源码与文档索引

### 15.1 核心代码

| 模块 | 路径 |
|------|------|
| 游戏状态机 | `code/client/src/core/game/game-state.ts` |
| 路径判定 | `code/client/src/core/board/path-check.ts` |
| 关卡解析 | `code/shared/src/parser.ts` |
| 关卡校验 | `code/shared/src/validator.ts` |
| 序列化 | `code/shared/src/serializer.ts` |
| 类型定义 | `code/shared/src/types.ts` |
| 机制实现 | `code/client/src/core/mechanics/*.ts` |
| 渲染 | `code/client/src/render/board-renderer.ts`、`mechanics-drawer.ts` |
| 编辑器 | `code/editor/src/` |

### 15.2 参考文档

| 文档 | 内容 |
|------|------|
| [Arrow玩法规则详解.md](Arrow玩法规则详解.md) | 玩法目标与障碍概述 |
| [Arrow 关卡结构说明.md](Arrow%20关卡结构说明.md) | JSON 字段（部分已过时，以本文为准） |
| [Arrow Jam 新增规则内容.md](Arrow%20Jam%20新增规则内容.md) | kind2/5/7/13 产品规则 |
| [arrow_jaw_关卡道具需求文档.md](arrow_jaw_关卡道具需求文档.md) | HUD 道具 |
| [arrow_jaw_AI关卡编辑指南.md](arrow_jaw_AI关卡编辑指南.md) | AI 关卡设计规范 |

---

*文档结束*
