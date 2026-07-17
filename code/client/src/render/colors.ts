/** 糖果色箭头色板：更明亮、饱和 */
export const COLORS: Record<number, string> = {
  1: "#FFE566",
  2: "#FFAA44",
  3: "#FF6B8A",
  4: "#E58AFF",
  6: "#5AE676",
  7: "#5EB8FF",
  8: "#5FF5D4",
};

export const FALLBACK_COLOR = "#C8BFD4";

/** Canvas 主题：游戏用柔和浅色，编辑器用深色底 */
export const THEME = {
  bg: "#E8E3EE",
  panel: "#24283b",
  gamePanel: "#E8E3EE",
  gameBoardBorder: "#9E94AA",
  gridCell: "#16161e",
  gridLine: "#2a2f45",
  text: "#4A3F55",
  textMuted: "#9B8FA8",
  accent: "#FF8AC2",
  success: "#5AE676",
  danger: "#FF6B8A",
  warning: "#FFB347",
};

export const CELL = 34;
export const GAP = 3;
export const STEP = CELL + GAP;
/** 游戏模式棋盘边框相对 playable 区域向外扩的格数 */
export const GAME_BOARD_BORDER_PAD_CELLS = 1;
export const LINE_W = 6;
export const GAME_LINE_W = 8;
export const R_BODY = 5.5;
export const R_HEAD = 7;
export const R_CORNER = 6;
export const CORNER_COLOR = "#FFAA44";
/** 反射角弹簧标识（与镜面线区分） */
export const CORNER_SPRING_COLOR = "#5FF5D4";
export const ZONE_STROKE = "#C89BFF";
export const ZONE_FILL = "rgba(200, 155, 255, 0.14)";
export const BUNDLE_COLORS = ["#FFB347", "#FF6B8A", "#E58AFF"];
export const BUNDLE_LINE_W = 5;
export const BUNDLE_WAVE_AMP = 4;
export const BUNDLE_WAVE_LEN = 10;
export const CURTAIN_FILL = "rgba(200, 190, 210, 0.55)";
export const CURTAIN_STROKE = "rgba(255, 255, 255, 0.92)";
export const CURTAIN_HEALTH_COLOR = "#FFE566";
export const KEY_COLOR = "#FFE566";
export const KEY_STROKE = "#FFAA44";
export const SHADOW_DX = 1.5;
export const SHADOW_DY = 2.5;
export const SHADOW_COLOR = "rgba(120, 80, 140, 0.14)";
export const TRACE_DOT_RADIUS = 3.5;
export const TRACE_DOT_COLOR = "rgba(130, 105, 150, 0.42)";

/** 编辑器：永久黑洞区域（与白色无效格区分） */
export const EDITOR_BLACK_HOLE_FILL = "rgba(135, 206, 250, 0.72)";
export const EDITOR_BLACK_HOLE_STROKE = "rgba(77, 171, 247, 0.95)";

export function colorForId(colorId: number): string {
  return COLORS[colorId] ?? FALLBACK_COLOR;
}

/** 无效格着色：0=白，9=黑，10=浅灰，其余同箭色 */
export function invalidCellColorHex(colorId: number): string {
  if (colorId === 0) return "#FFFFFF";
  if (colorId === 9) return "#000000";
  if (colorId === 10) return "#B8B8B8";
  return colorForId(colorId);
}

export function mixHex(hex: string, towardWhite: number): string {
  const rgb = parseHex(hex);
  const amount = Math.max(0, Math.min(1, towardWhite));
  const out = rgb.map((c) => Math.round(c + (255 - c) * amount));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function shadeHex(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  const out = rgb.map((c) =>
    Math.max(0, Math.min(255, Math.round(c + amount * 255))),
  );
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
