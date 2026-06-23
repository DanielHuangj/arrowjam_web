import featureMapRaw from "../../../../docs/arrow_jaw_游戏功能图谱.md?raw";
import aiGuideRaw from "../../../../docs/arrow_jaw_AI关卡编辑指南.md?raw";
import levelStructureRaw from "../../../../docs/Arrow 关卡结构说明.md?raw";

export interface AiContextBundle {
  featureMap: string;
  aiGuide: string;
  levelStructure: string;
}

let cached: AiContextBundle | null = null;

export function getAiContextBundle(): AiContextBundle {
  if (!cached) {
    cached = {
      featureMap: featureMapRaw,
      aiGuide: aiGuideRaw,
      levelStructure: levelStructureRaw,
    };
  }
  return cached;
}

export function getValidatorSummary(): string {
  return `常见校验错误码：
V01 缺 width/height/itemModels
V02 instanceId 重复
V03 坐标越界
V04 折线不连续
V05 矩形不完整
V06 子区域非法 kind
V07/V08 管道 passes 无效（position 须为路径首尾格）
V-PIPE-01 管道与箭身格重叠
V-CORNER-01 反射角与箭身格重叠
V11 kind1 direction / kind2 direction1 与末段不一致（箭头应顺箭身）
V12 路径自交
V15 捆绑 2-4 格
V-NEW-05 炸弹无效或未绑定箭
V-NEW-07 移动墙路径无效或不可在子区域
V-NEW-13 冻结未绑定同格箭
V-EDIT-01 同箭不可同时绑定钥匙/炸弹/冻结
AI-KIND 出现未勾选 kind
AI-KIND-MIN 勾选的 kind 未出现（每种至少 1 个）
AI-COUNT 折线箭数量不足
AI-DENSITY 箭身占用格过少
AI-OVERLAP 多条折线箭共享格子
AI-PIPE-OVERLAP 管道与箭身格重叠
AI-CORNER-OVERLAP 反射角与箭身格重叠
AI-BOMB-ANCHOR 炸弹未绑在箭身中段（应非头尾）
AI-BOMB-SHORT 炸弹宿主箭过短（须 ≥3 格）
AI-PIPE-USELESS 管道可穿行箭数 < health（管道无实际作用）`;
}
