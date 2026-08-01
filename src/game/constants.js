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

// 落地紀錄的門檻：離地超過這個秒數才算一次真正的跳躍落點，
// 免得出生那一幀被當成落地而污染側寫
export const AIRBORNE_MIN = 0.12;

// 排行榜受理的最短通關時間，單位秒。低於這個數字的成績一律不上榜——
// 十八關光是轉場與必死的橋段就吃掉不只這些時間，跑得比它快的只有兩種人：
// 改過計時器的，跟用創造者模式跳關的。門檻擋的是這兩種。
export const MIN_BOARD_TIME = 60;

// 手感參數打包成一個可以整包換掉的物件。關卡可以用 setTune 陷阱在命內
// 突然改掉重力，也可以在 adapt() 裡依側寫換掉整包——這是「物理會變」
// 這件事唯一的入口，player.js 不再直接讀常數。
export const DEFAULT_TUNE = Object.freeze({
  maxSpeed: MAX_SPEED,
  accel: ACCEL,
  friction: FRICTION,
  jumpSpeed: JUMP_SPEED,
  gravityUp: GRAVITY_UP,
  gravityDown: GRAVITY_DOWN,
  jumpCut: JUMP_CUT,
});
