import { TILE } from './constants.js';

// 地磚字元：'.' 空氣、'#' 實心、'^' 地上的刺、'v' 天花板倒掛的刺
// 兩種刺都是實心的，而且都會殺人
export const AIR = '.';
export const SPIKE = '^';
export const SPIKE_DOWN = 'v';

export function tileAt(map, tx, ty) {
  if (ty < 0) return '#';
  if (ty >= map.length) return AIR;   // 地圖下緣是深淵
  const row = map[ty];
  if (tx < 0 || tx >= row.length) return '#';
  return row[tx];
}

export function isSolid(map, tx, ty) {
  return tileAt(map, tx, ty) !== AIR;
}

export function isDeadly(map, tx, ty) {
  const ch = tileAt(map, tx, ty);
  return ch === SPIKE || ch === SPIKE_DOWN;
}

export function collides(map, box) {
  // 碰撞箱佔的是半開區間 [x, x+w)。右／下邊界要用 ceil(...)-1，
  // 用 (x+w-1) 在小數座標下會少算一格：靜止站在地板上時會被判定成沒碰到地板，
  // 於是每幀被重力推下零點幾像素、下一幀又被彈回來，看起來就是人在原地上下抖。
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.ceil((box.x + box.w) / TILE) - 1;
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.ceil((box.y + box.h) / TILE) - 1;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(map, tx, ty)) return true;
  return false;
}

export function moveAndCollide(map, box, dx, dy) {
  let { x, y } = box;
  const { w, h } = box;
  let hitX = 0, hitY = 0;

  x += dx;
  if (collides(map, { x, y, w, h })) {
    if (dx > 0) { x = Math.floor((x + w) / TILE) * TILE - w; hitX = 1; }
    else if (dx < 0) { x = (Math.floor(x / TILE) + 1) * TILE; hitX = -1; }
  }

  y += dy;
  if (collides(map, { x, y, w, h })) {
    if (dy > 0) { y = Math.floor((y + h) / TILE) * TILE - h; hitY = 1; }
    else if (dy < 0) { y = (Math.floor(y / TILE) + 1) * TILE; hitY = -1; }
  }

  return { x, y, hitX, hitY };
}

export function onGround(map, box) {
  return collides(map, { x: box.x, y: box.y + 1, w: box.w, h: box.h });
}

// 碰撞箱有沒有碰到刺。刺是實心的，所以玩家是「站在刺上」而不是陷進去——
// 底邊要多探一個像素（跟 onGround 同樣的道理），否則正好站在刺頂上不算數。
export function touchesDeadly(map, box) {
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.ceil((box.x + box.w) / TILE) - 1;
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.ceil((box.y + box.h + 1) / TILE) - 1;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isDeadly(map, tx, ty)) return true;
  return false;
}
