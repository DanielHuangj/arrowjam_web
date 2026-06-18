# arrow_jaw 新机制编辑器开发需求文档（P6）

> **版本**：v0.1  
> **日期**：2026-06-15  
> **状态**：待开发  
> **关联文档**：[Arrow Jam 新增规则编辑器需求.md](Arrow%20Jam%20新增规则编辑器需求.md) · [Arrow Jam 新增规则内容.md](Arrow%20Jam%20新增规则内容.md) · [arrow_jaw_新机制开发需求文档.md](arrow_jaw_新机制开发需求文档.md) · [arrow_jaw_关卡编辑器开发需求文档.md](arrow_jaw_关卡编辑器开发需求文档.md) · [arrow_jaw_新机制编辑器开发步骤拆解.md](arrow_jaw_新机制编辑器开发步骤拆解.md)

---

## 1. 概述

### 1.1 目标

在已完成 P0–P4 关卡编辑器（kind 1/3/4/6/8/11/12）的基础上，为 `code/editor` 增加 **4 种新物件**的可视化编辑能力，并与 P5 游戏客户端玩法对齐。

| kind | 名称 | 编辑器核心能力 |
|------|------|----------------|
| 2 | 翻转箭 | 折线绘制 + 双方向编辑 |
| 5 | 定时炸弹 | 绑定 kind1/2 箭 + 倒计时 |
| 7 | 移动墙 | 矩形墙身 + 路径编辑 + 预览 |
| 13 | 冻结箭 | 绑定 kind1/2 箭 + health |

### 1.2 范围

| 在范围 | 不在范围 |
|--------|----------|
| `code/editor` 工具栏、属性面板、画布 overlay | Electron 桌面包装 |
| `code/shared` 序列化/校验扩展 | kind11 交互改造（仍单格放置） |
| 试玩模式接线 P5 机制 | 正式主线关卡批量改造 |
| devTests 9001–9005 往返与验收 | 复杂粒子/音效 |

### 1.3 依赖

- P5 玩法已在 `code/client` 实现（flip/bomb/moving-wall/frozen）
- shared 解析/校验已支持 kind 2/5/7/13
- client `mechanics-drawer.ts` 可复用于编辑器渲染

---

## 2. 术语补充

| 术语 | 含义 |
|------|------|
| 翻转特性 | kind2 在非覆盖状态下，消除 kind1/kind2 时切换 direction1 ↔ direction2 |
| 往复循环 | kind7 movingType=1：路径锚点到达有效范围尽头后反向 |
| 环绕循环 | kind7 movingType=2：路径锚点 modulo 循环，多格墙逐段衔接 |
| 冻结区域解锁 | 消除与冻结区 4 邻接的 kind1/kind2 后 health 减 1 |
| 绑定物件互斥 | 同一 kind1/2 箭最多绑定一种：kind8 捆绑 / kind11 钥匙 / kind5 炸弹 / kind13 冻结 |

---

## 3. 数据契约

### 3.1 kind 与 layer

| kind | layer | 编辑器默认 | 可改 |
|------|-------|-----------|------|
| 2 | 2 | 2 | 否（与 kind1 一致） |
| 5 | 3 | 3 | 否 |
| 7 | 2 | 2 | 否 |
| 13 | 8 | 8 | 否 |

### 3.2 字段清单

**kind 2**

| 字段 | 类型 | 说明 |
|------|------|------|
| occupiedPositions | Vec2[] | 折线，最后一格为 direction1 头部 |
| direction1 | Direction | 默认朝向 |
| direction2 | Direction | 翻转后朝向（第一格为头部） |
| colorId | number | 3/4/6/7 |

**kind 5**

| 字段 | 类型 | 说明 |
|------|------|------|
| occupiedPositions | Vec2[] | 与宿主箭完全一致，只读 |
| time | number | 倒计时秒数 ≥ 1 |

**kind 7**

| 字段 | 类型 | 说明 |
|------|------|------|
| occupiedPositions | Vec2[] | 墙身初始占格（连续矩形块） |
| movingPath | Vec2[] | 锚点路径，长度 ≥ 2 |
| movingDistance | number | 每次移动格数 ≥ 1 |
| movingType | 1 \| 2 | 1=往复，2=环绕 |

**kind 13**

| 字段 | 类型 | 说明 |
|------|------|------|
| occupiedPositions | Vec2[] | 与宿主箭完全一致，只读 |
| health | number | 解冻所需邻接消除次数 ≥ 1 |

### 3.3 绑定规则

- kind5/kind13：必须先选中 kind1 或 kind2 箭，再通过工具栏添加
- 添加时拷贝宿主 `occupiedPositions`
- 拖拽移动宿主箭时，绑定物件坐标同步更新
- 删除宿主箭时，级联删除绑定物件

---

## 4. 工具栏与交互

### 4.1 新增工具

| 工具 | kind | 交互 |
|------|------|------|
| K2 翻转 | 2 | 与 K1 相同折线拖拽；完成前可设 direction1；direction2 默认由首段推断 |
| K5 炸弹 | 5 | 选中 kind1/2 → 点击工具 → 添加 bomb（默认 time=10） |
| K7 移动墙 | 7 | ① 矩形框选墙身 ② 路径模式点击/拖拽追加 movingPath |
| K13 冻结 | 13 | 选中 kind1/2 → 点击工具 → 添加 frozen（默认 health=1） |

工具按钮 `title` 属性显示规则说明（hover tooltip）。

### 4.2 kind2 折线校验

- 正交连续折线，长度 ≥ 2
- direction1 对应末段延伸方向，direction2 对应首段反向延伸方向
- 头/尾射出射线不得被自身 occupiedPositions 阻挡（V-NEW-02）

### 4.3 kind7 路径编辑

- 路径点须正交连续且在棋盘内
- 首点默认与墙身锚格（occupiedPositions[0]）一致
- 选中 kind7 物件后可进入「编辑路径」模式追加/调整点
- movingType=1 路径橙色预览；movingType=2 路径绿色预览

### 4.4 子区域 kind12

- 子项允许 kind 2/5/13（validator 已允许）
- **不允许** kind 7（V-NEW-07）
- 子区域编辑模式工具集扩展：select / arrow / flipArrow / corner / bundle / bomb / frozen

### 4.5 kind8 捆绑扩展

- `startBundle()` 允许选中 kind **1 或 2** 作为源箭

---

## 5. 属性面板

| kind | 字段 | 控件 | 约束 |
|------|------|------|------|
| 2 | direction1 | 方向下拉 | 校验头尾阻挡 |
| 2 | direction2 | 方向下拉 | 同上 |
| 2 | colorId | 色块选择 | 3/4/6/7 |
| 5 | time | 数字输入 ≥ 1 | — |
| 5 | occupiedPositions | 只读文本 | 随宿主同步 |
| 7 | movingDistance | 数字输入 ≥ 1 | — |
| 7 | movingType | 下拉 1/2 | 往复/环绕 |
| 7 | movingPath | 只读坐标列表 + 「编辑路径」按钮 | 棋盘内连续 |
| 13 | health | 数字输入 ≥ 1 | — |
| 13 | occupiedPositions | 只读文本 | 随宿主同步 |

---

## 6. 画布渲染

### 6.1 复用 client 绘制

`EditorBoardView` 调用 `BoardRenderer.drawBoard` 时传入：

```typescript
{
  movingWalls: level.movingWalls,
  frozenOverlays: level.frozenOverlays,
  bombStates: /* 编辑态 remaining=null 或试玩态激活倒计时 */,
}
```

### 6.2 编辑器 overlay

| 物件 | overlay 内容 |
|------|-------------|
| kind2 | 实线箭头（direction1 头）+ 虚线/副色箭头（direction2 头） |
| kind7 | 路径折线 + 方向箭头；往复橙/环绕绿 |
| kind7 | 可选：静态 1~2 步位置预览帧 |

### 6.3 层级

- layer 3：kind8/11/5 同层渲染顺序沿用现有规则
- layer 8：kind6 幕布 + kind13 冻结 overlay

---

## 7. 校验规则

### 7.1 已有规则（shared）

- V-NEW-02：kind2 字段与朝向
- V-NEW-05：kind5 绑定有效性
- V-NEW-07：kind7 路径完整性
- V-NEW-13：kind13 绑定有效性

### 7.2 新增 V-EDIT-01（阻塞）

同一 kind1/2 箭（按 occupiedPositions 完全一致或同格推断）不得同时存在：

- kind8 捆绑条带关联
- kind11 钥匙（同格）
- kind5 炸弹（同格/同 positions）
- kind13 冻结（同 positions）

### 7.3 kind7 路径连续性（阻塞）

movingPath 相邻点须曼哈顿距离为 1，且全部在棋盘内。

---

## 8. 序列化

`serializeRawItem` 必须输出：

| kind | 额外字段 |
|------|----------|
| 2 | direction1, direction2, colorId |
| 5 | time |
| 7 | movingPath, movingDistance, movingType |
| 13 | health |

往返测试：9001–9004 JSON parse → serialize → parse 语义等价。

---

## 9. 试玩模式

试玩 `drawBoard` 与 client `app.ts` 对齐：

- `movingWalls`, `frozenOverlays`, `bombStates`, `urgentBombRemaining`
- 炸弹爆炸：`bombExplosion`, `exploding` 阶段后再弹失败窗

Esc 退出试玩恢复编辑态；编辑改动后试玩反映最新 `itemModels`。

---

## 10. 验收标准

| ID | 验收项 |
|----|--------|
| AC-NE01 | 打开 level-9001.json，kind2 双方向可视化，可编辑保存往返 |
| AC-NE02 | 打开 level-9002.json，往复移动墙路径预览正确 |
| AC-NE03 | 打开 level-9003.json，冻结 overlay + health 显示 |
| AC-NE04 | 打开 level-9004.json，炸弹绑定与倒计时试玩正常 |
| AC-NE05 | 打开 level-9005.json，环绕多格墙预览无中间黑洞 |
| AC-NE06 | kind5/13 绑定互斥：同箭不可重复绑定 |
| AC-NE07 | 子区域内可放置 kind2/5/13 |
| AC-NE08 | 保存后再打开，kind2/5/7/13 字段不丢失 |

---

## 11. 不在本期

- kind11 改为「先选箭再绑」
- kind7 放入子区域
- 自动关卡生成 / AI 辅助

---

*文档结束*
