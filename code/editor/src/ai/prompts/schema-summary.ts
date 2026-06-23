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
kind 3: health, passes (≥2端点), healthViewPathIndex
kind 4: direction1, direction2 (Vec2)
kind 5: time, occupiedPositions 1格绑定箭
kind 6: health, order, 矩形 occupiedPositions
kind 7: movingPath (≥2), movingDistance, movingType (1往复2环绕), 不可在 kind12 内
kind 8: occupiedPositions 2-4格条带
kind 11: 1格钥匙叠在箭上
kind 12: 矩形 + items[] 子项(全局坐标), 子项仅 1/2/4/5/8/13
kind 13: health, occupiedPositions 与宿主箭完全相同

禁止 kind 9/10。layer: 12→1, 1/2/3/4/7→2, 5/8/11→3, 6/13→8`;
