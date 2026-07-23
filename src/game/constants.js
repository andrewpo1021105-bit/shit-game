export const TILE = 16;
export const MAP_W = 30;
export const MAP_H = 17;
export const VIEW_W = MAP_W * TILE;   // 480
export const VIEW_H = MAP_H * TILE;   // 270

export const PHYSICS_DT = 1 / 120;

export const PLAYER_W = 10;
export const PLAYER_H = 14;

export const MAX_SPEED = 112;      // px/s ＝ 每秒 7 格
export const ACCEL = 1400;         // px/s²，0.08 秒到全速
export const FRICTION = 1867;      // px/s²，0.06 秒煞停
export const JUMP_SPEED = 304;     // px/s，約 3.2 格高
export const GRAVITY_UP = 900;
export const GRAVITY_DOWN = 1620;  // 上升的 1.8 倍
export const JUMP_CUT = 0.4;       // 放開跳躍鍵時上升速度乘以此值
export const COYOTE_TIME = 0.10;
export const JUMP_BUFFER = 0.12;
export const RESPAWN_DELAY = 0.30;
