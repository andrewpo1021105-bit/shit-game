import { moveAndCollide, onGround } from './physics.js';
import {
  TILE, PLAYER_W, PLAYER_H, MAX_SPEED, ACCEL, FRICTION,
  JUMP_SPEED, GRAVITY_UP, GRAVITY_DOWN, JUMP_CUT,
  COYOTE_TIME, JUMP_BUFFER,
} from './constants.js';

export function createPlayer(tx, ty) {
  return {
    x: tx * TILE + (TILE - PLAYER_W) / 2,
    y: ty * TILE + (TILE - PLAYER_H),
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
    facing: 1,
  };
}

export function updatePlayer(p, map, input, dt) {
  // 水平：有輸入就加速，沒輸入就煞車
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    p.facing = dir;
    p.vx += dir * ACCEL * dt;
    if (p.vx > MAX_SPEED) p.vx = MAX_SPEED;
    if (p.vx < -MAX_SPEED) p.vx = -MAX_SPEED;
  } else if (p.vx !== 0) {
    const drop = FRICTION * dt;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - drop) : Math.min(0, p.vx + drop);
  }

  // 跳躍緩衝：只在按下的那一幀記錄
  if (input.jump && !p.jumpHeld) p.buffer = JUMP_BUFFER;
  p.buffer = Math.max(0, p.buffer - dt);

  // 土狼時間
  if (p.grounded) p.coyote = COYOTE_TIME;
  else p.coyote = Math.max(0, p.coyote - dt);

  // 起跳
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_SPEED;
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
  }

  // 可變跳躍高度：上升中放開就切斷
  if (!input.jump && p.jumpHeld && p.vy < 0) p.vy *= JUMP_CUT;
  p.jumpHeld = input.jump;

  // 重力
  p.vy += (p.vy < 0 ? GRAVITY_UP : GRAVITY_DOWN) * dt;

  // 移動與碰撞
  const r = moveAndCollide(map, p, p.vx * dt, p.vy * dt);
  if (r.hitX !== 0) p.vx = 0;
  if (r.hitY !== 0) p.vy = 0;
  p.x = r.x;
  p.y = r.y;
  p.grounded = onGround(map, p);
}
