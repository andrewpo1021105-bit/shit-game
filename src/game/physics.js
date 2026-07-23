import { TILE } from './constants.js';

export function isSolid(map, tx, ty) {
  if (ty < 0 || ty >= map.length) return true;
  const row = map[ty];
  if (tx < 0 || tx >= row.length) return true;
  return row[tx] === '#';
}

export function collides(map, box) {
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.floor((box.x + box.w - 1) / TILE);
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.floor((box.y + box.h - 1) / TILE);
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
