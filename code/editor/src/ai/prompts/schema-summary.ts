export const LEVEL_SCHEMA_SUMMARY = `LevelData JSON 顶层结构：
{
  "width": number (必填),
  "height": number (必填),
  "name": string,
  "durationInSec": number,
  "difficulty": 1|2|3,
  "levelKind": number (可选),
  "itemModels": RawItem[]
}

RawItem 通用字段：kind, instanceId (全关唯一正整数), layer, occupiedPositions [[x,y],...]

kind 1: direction (1下2上3右4左), colorId, 折线尾→头
kind 2: direction1, direction2, colorId, 折线尾→头
  direction1 = **末段方向**（箭头朝向，须与箭身末段一致）
  direction2 = **折线反转后的末段方向**（翻转后箭头朝向）；直管例 [[5,6],[6,6],[7,6]] → d1=3(右), d2=4(左)
kind 3: health, passes (恰好2个端点对象), healthViewPathIndex, layer=2
  passes 每项: {"position":[x,y], "directions":[[dx,dy],[dx,dy]]}（禁止裸坐标数组）
  position **必须**是 occupiedPositions 路径的**首尾格**（与路径顺序一致）
  healthViewPathIndex = Math.floor(管身格数/2)，血量 UI 锚在管身中段（勿用 0）
  管身格 **不可**与 kind1/kind2 箭身格重叠
  **health 须 ≤ 能穿行穿出该管道的箭条数**（每条箭穿出计 1 次，穿出后 health-1）
  occupiedPositions 可为**弯曲折线**（不限直线），passes 两端方向分别匹配该端延伸方向
  直管水平: directions [[-1,0],[1,0]]；直管竖直: [[0,1],[0,-1]]
  L 形弯管示例（竖入横出）:
  {"kind":3,"instanceId":10,"layer":2,"health":2,"healthViewPathIndex":2,
   "occupiedPositions":[[5,6],[6,6],[7,6],[7,7],[7,8]],
   "passes":[{"position":[5,6],"directions":[[-1,0],[1,0]]},{"position":[7,8],"directions":[[0,1],[0,-1]]}]}
kind 4: direction1, direction2 (Vec2)
  占 1 格；**不可**与 kind1/kind2 箭身格重叠（可邻接箭身，不可同格）
  **须至少有 1 条箭飞出时经此角块折射**；将角放在箭飞行路径上，direction1/2 与入射/出射垂直
kind 5: time, occupiedPositions **1 格**，须与宿主 kind1/kind2 **身中段**同格（索引 floor(格数/2)，**禁止**绑在头/尾；宿主箭 ≥3 格）
kind 6: health, order, 矩形 occupiedPositions
kind 7: movingPath (≥2), movingDistance, movingType (1往复2环绕), 不可在 kind12 内
kind 8: occupiedPositions 2-4格条带
kind 11: 1格钥匙叠在箭上
kind 12: 矩形 + items[] 子项(全局坐标), 子项仅 1/2/4/5/8/13
kind 13: health, occupiedPositions 与宿主箭完全相同

禁止 kind 9/10。layer: 12→1, 1/2/3/4/7→2, 5/8/11→3, 6/13→8`;
