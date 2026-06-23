/** 棋盘宽度/高度允许范围（格） */
export const BOARD_MIN_SIZE = 4;
export const BOARD_MAX_SIZE = 255;

export function isBoardSizeValid(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= BOARD_MIN_SIZE &&
    width <= BOARD_MAX_SIZE &&
    height >= BOARD_MIN_SIZE &&
    height <= BOARD_MAX_SIZE
  );
}

export function boardSizeRangeLabel(): string {
  return `${BOARD_MIN_SIZE}–${BOARD_MAX_SIZE}`;
}
