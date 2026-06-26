export const COLORS: Record<number, string> = {
  1: "#ffd43b",
  2: "#ffa94d",
  3: "#ff6b6b",
  4: "#e599f7",
  6: "#51cf66",
  7: "#4dabf7",
  8: "#63e6be",
};

export const FALLBACK_COLOR = "#adb5bd";

export const THEME = {
  bg: "#1a1b26",
  panel: "#24283b",
  gamePanel: "#2a3148",
  gridCell: "#16161e",
  gridLine: "#2a2f45",
  text: "#c0caf5",
  textMuted: "#565f89",
  accent: "#7aa2f7",
  success: "#9ece6a",
  danger: "#f7768e",
  warning: "#e0af68",
};

export const CELL = 34;
export const GAP = 3;
export const STEP = CELL + GAP;
export const LINE_W = 6;
export const GAME_LINE_W = 7;
export const R_BODY = 5.5;
export const R_HEAD = 7;
export const R_CORNER = 6;
export const CORNER_COLOR = "#fd7e14";
/** 反射角弹簧标识（与镜面线区分） */
export const CORNER_SPRING_COLOR = "#63e6be";
export const ZONE_STROKE = "#7c6fef";
export const ZONE_FILL = "rgba(124, 111, 239, 0.12)";
export const BUNDLE_COLORS = ["#ff922b", "#f03e3e", "#ae3ec9"];
export const BUNDLE_LINE_W = 5;
export const BUNDLE_WAVE_AMP = 4;
export const BUNDLE_WAVE_LEN = 10;
export const CURTAIN_FILL = "rgba(134, 142, 150, 0.62)";
export const CURTAIN_STROKE = "rgba(210, 214, 220, 0.95)";
export const CURTAIN_HEALTH_COLOR = "#ffd43b";
export const KEY_COLOR = "#ffd43b";
export const KEY_STROKE = "#f08c00";
export const SHADOW_DX = 2;
export const SHADOW_DY = 2;
export const SHADOW_COLOR = "rgba(0, 0, 0, 0.28)";
export const TRACE_DOT_RADIUS = 3;
export const TRACE_DOT_COLOR = "rgba(255, 255, 255, 0.18)";

export function colorForId(colorId: number): string {
  return COLORS[colorId] ?? FALLBACK_COLOR;
}
