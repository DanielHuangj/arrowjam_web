# Arrow 关卡结构说明

## 文件命名与顶层结构

每个文件对应一个关卡，命名规则：
- 关卡文件固定前缀：`arrowJam-main-level-`
- 关卡编号：`{N}`
- 完整命名：`arrowJam-main-level-{N}.json`

JSON 顶层为单个对象，包含棋盘参数与物件列表，配置实例：

```json
{
  "width": 20,
  "height": 32,
  "name": "",
  "durationInSec": 150,
  "difficulty": 2,
  "levelKind": 1,
  "itemModels": [ ... ]
}
```

---

## 关卡根字段

| 字段 | 含义 |
|------|------|
| width | 棋盘列数；有效 x 为 0 … width-1 |
| height | 棋盘行数；有效 y 为 0 … height-1 |
| name | 关卡显示名，可为空 |
| durationInSec | 限时（秒） |
| difficulty | 难度档位；与棋盘规模、物件复杂度正相关 |
| levelKind | 关卡类型；主线/普通 |
| itemModels | 关卡内所有顶层物件数组 |

---

## 难度配置

| 难度划分 | 难度说明 |
|----------|----------|
| 1 | Normal |
| 2 | Hard |
| 3 | Superhuman |

---

## 关卡中坐标系与 occupiedPositions

| 属性 | 说明 |
|------|------|
| 格式 | `[[x, y], [x, y], …]`，每点占一格 |
| x 轴 | 列，向右增大（0 = 最左列） |
| y 轴 | 行，向下增大（0 = 最上行） |

不同 kind 下坐标顺序语义：

| kind | 类型名 | 点的顺序含义 |
|------|--------|--------------|
| 1 | 箭 | 折线路径，顺序为 尾 → 头；头部在最后一格，direction 为头部指向 |
| 3 | 管道 | 折线/蛇身，顺序反映走向（与 passes 端点对应） |
| 4 | 反射角块 | 恒为 1 格 |
| 6 | 幕布 | 矩形区域内所有格（顺序不具方向语义） |
| 8 | 捆绑箭 | 2–4 格短条，沿箭头身一段 |
| 11 | 钥匙箭 | 恒定为 1 格 |
| 12 | 子区域 | 子区域外框覆盖的所有格 |

---

## itemModels 通用字段

每个物件（含 kind 12 内嵌套子项）均具备：

| 字段 | 类型 | 含义 |
|------|------|------|
| kind | int | 物件类型枚举 |
| occupiedPositions | [[x,y],…] | 占用格子 |
| instanceId | int | 运行时唯一 ID；全关（含嵌套）不重复；与 JSON 数组顺序无关 |
| layer | int | 渲染/逻辑层级 |

**嵌套关系**：kind: 12 的容器含 `items[]`；子项可有 kind 1、4、8，坐标仍使用全局棋盘坐标（非局部坐标）。子项 layer 与顶层同类物件一致。

**instanceId 说明**：ID 由编辑器分配，不同关卡区间差异大（如第 25 关主体箭头 1–50、边框 649–664；其他关可达 1700+）。不能跨关用 ID 范围推断物件角色，仅在同关内作唯一引用。

---

## 物件类型（kind）详解

### kind: 1 — 折线箭

顺序为 尾 → 头；头部在最后一格，direction 为头部指向。

**配置实例**：

```json
{
  "kind": 1,
  "occupiedPositions": [[3,14],[3,15],[3,16]],
  "instanceId": 659,
  "layer": 2,
  "direction": 1,
  "colorId": 6
}
```

| 字段 | 说明 |
|------|------|
| occupiedPositions | 占用的格子坐标（通用参数） |
| instanceId | 物件唯一id，在全部配置文件中不重复（通用参数） |
| layer | 渲染/逻辑层级，物件自身在关卡场景中所处层级（通用参数） |
| direction | 箭朝向枚举类型 |
| colorId | 折线绘制的颜色枚举类型 |

**行为**：点击箭后按照向量飞出屏幕，箭前方有其他物件时箭会被阻挡无法飞出。

#### direction 枚举

| 值 | 方向 | 步进向量 (dx, dy) |
|----|------|-------------------|
| 1 | 下 | (0, +1) |
| 2 | 上 | (0, -1) |
| 3 | 右 | (+1, 0) |
| 4 | 左 | (-1, 0) |

#### colorId 枚举

| colorId | 推测颜色 |
|---------|----------|
| 1 | 未定义 |
| 2 | 未定义 |
| 3 | 红 #ff6b6b |
| 4 | 紫 #e599f7 |
| 6 | 绿 #51cf66 |
| 7 | 蓝 #4dabf7 |
| 8 | 未定义 |

---

### kind: 3 — 管道（折线/蛇身）

顺序反映身段走向（与 passes 端点对应）。

**配置实例**：

```json
{
  "kind": 3,
  "occupiedPositions": [[12,8],[13,8],[14,8],[15,8],[16,8],[17,8],[18,8],[19,8]],
  "instanceId": 134,
  "layer": 2,
  "health": 3,
  "passes": [
    {"position": [12, 8], "directions": [[-1, 0], [1, 0]]},
    {"position": [19, 8], "directions": [[-1, 0], [1, 0]]}
  ],
  "healthViewPathIndex": 1
}
```

| 字段 | 说明 |
|------|------|
| health | 血量，消除管道所需通过的线数量 |
| passes | 管道两端位置配置 |
| position | 管道所处的某一格（通常为两端之一） |
| directions | 允许箭穿过的方向向量列表，向量方向与反射角块相同 |
| healthViewPathIndex | 血量 UI 锚点，取 occupiedPositions 的索引 |

**行为**：管道两头作为箭的出入口，管道侧面为障碍作用。

---

### kind: 4 — 反射角块

**配置实例**：

```json
{
  "kind": 4,
  "occupiedPositions": [[6,25]],
  "instanceId": 645,
  "layer": 2,
  "direction1": [1,0],
  "direction2": [0,-1]
}
```

| 字段 | 说明 |
|------|------|
| direction1 | 允许穿出方向之一，[dx, dy] 向量（非枚举） |
| direction2 | 允许穿出方向之二 |

**direction 向量对照**：

| direction1 | direction2 |
|------------|------------|
| [1, 0] 向右 | [0, -1] 向上 |
| [-1, 0] 向左 | [0, 1] 向下 |

**行为**：箭碰撞角块正面后根据 direction1、direction2 折射 90 度方向，配置箭的向量不能指向反射角块后方。

---

### kind: 6 — 幕布（大块锁定区域）

通过 kind:11 绑定箭消除解锁。

**配置实例**：

```json
{
  "kind": 6,
  "occupiedPositions": [[12,14],[13,14],...],
  "instanceId": 1,
  "layer": 8,
  "health": 5,
  "order": 0
}
```

| 字段 | 说明 |
|------|------|
| occupiedPositions | 通过配置的格子坐标覆盖的一个子区域范围（矩形区域） |
| layer | 层级固定配置为 8 |
| health | 血量，通过 kind:11 箭消除后减少血量，血量为零时幕布消失 |
| order | 消除/激活顺序，场景中有多个大块区域时按照 order 配置顺序进行消除 |

---

### kind: 8 — 捆绑箭

**配置实例**：

```json
{
  "kind": 8,
  "occupiedPositions": [[2,3],[3,3],[4,3],[5,3]],
  "instanceId": 135,
  "layer": 3
}
```

| 字段 | 说明 |
|------|------|
| layer | 固定 3（叠在已有箭之上） |

**行为**：将已配置的相同箭捆绑在一起，整体可视为一个加粗的箭。

---

### kind: 11 — 钥匙箭

解锁 kind:6 幕布的计数条件。

**配置实例**：

```json
{
  "kind": 11,
  "occupiedPositions": [[13,8]],
  "instanceId": 65,
  "layer": 3
}
```

| 字段 | 说明 |
|------|------|
| occupiedPositions | 该位置的箭绑定钥匙用于消除本关 kind:6 类型区域。该坐标的箭为计数点。 |

---

### kind: 12 — 区域（子区域容器）

**配置实例**：

```json
{
  "kind": 12,
  "occupiedPositions": [[3,4],[4,4],[5,4],...],
  "instanceId": 1,
  "layer": 1,
  "items": [
    {
      "kind": 1,
      "occupiedPositions": [[4,4],[3,4],[3,5],[3,6],[3,7]],
      "instanceId": 34,
      "layer": 2,
      "direction": 1,
      "colorId": 3
    },
    ...
  ]
}
```

| 字段 | 说明 |
|------|------|
| occupiedPositions | 通过配置的格子坐标覆盖的一个子区域范围（矩形区域） |
| layer | 固定 1，为场景最底层 |
| items | kind:12 类型内的子物件，可包含 1、4、8 类型 |

**层级结构**：

```
全棋盘 (width × height)
└── kind:12 矩形区域 (layer 1)
    ├── kind:1 箭若干 (layer 2, 全局坐标)
    ├── kind:4 角块 (可选, 区域边缘)
    └── kind:8 锁条 (可选, 叠在区域内箭上)
```

---

*创建时间: 2026-06-10*
