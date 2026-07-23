import { TILE } from './constants.js';

export function createTrapState(level) {
  return { fired: new Array(level.traps ? level.traps.length : 0).fill(false) };
}

function triggered(when, ctx) {
  switch (when.t) {
    case 'crossX':
      return ctx.prevX < when.x * TILE && ctx.px >= when.x * TILE;
    case 'crossY':
      return ctx.prevY < when.y * TILE && ctx.py >= when.y * TILE;
    case 'enterRect': {
      const x0 = when.x * TILE, x1 = (when.x + when.w) * TILE;
      const y0 = when.y * TILE, y1 = (when.y + when.h) * TILE;
      return ctx.px >= x0 && ctx.px < x1 && ctx.py >= y0 && ctx.py < y1;
    }
    case 'afterDelay':
      return ctx.time >= when.s;
    case 'deathCount':
      return ctx.deaths >= when.n;
    case 'jumpCount':
      return ctx.jumps >= when.n;
    case 'touchDoor':
      return ctx.atDoor === true;
    default:
      throw new Error(`未知的觸發器型別：${when.t}`);
  }
}

export function checkTriggers(level, state, ctx) {
  const out = [];
  const traps = level.traps || [];
  for (let i = 0; i < traps.length; i++) {
    const trap = traps[i];
    if (trap.once && state.fired[i]) continue;
    if (!triggered(trap.when, ctx)) continue;
    state.fired[i] = true;
    for (const action of trap.do) out.push(action);
  }
  return out;
}

function paint(world, x, y, w, h, ch) {
  for (let ty = y; ty < y + h; ty++) {
    if (ty < 0 || ty >= world.map.length) continue;
    const row = world.map[ty].split('');
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tx >= row.length) continue;
      row[tx] = ch;
    }
    world.map[ty] = row.join('');
  }
}

export function applyAction(world, action) {
  switch (action.t) {
    case 'removeTiles':
      paint(world, action.x, action.y, action.w, action.h, '.');
      break;
    case 'addTiles':
      paint(world, action.x, action.y, action.w, action.h, '#');
      break;
    case 'moveDoor':
      world.door.x += action.x;
      world.door.y += action.y;
      break;
    default:
      throw new Error(`未知的動作型別：${action.t}`);
  }
}
