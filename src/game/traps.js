import { TILE } from './constants.js';
import { noteRoute } from './profile.js';

export function createTrapState(traps) {
  const n = traps ? traps.length : 0;
  return {
    fired: new Array(n).fill(false),
    lastFired: new Array(n).fill(-Infinity),
  };
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
    case 'idleFor':
      return ctx.idle >= when.s;
    case 'touchDoor':
      return ctx.atDoor === true;
    default:
      throw new Error(`未知的觸發器型別：${when.t}`);
  }
}

export function checkTriggers(traps, state, ctx) {
  const out = [];
  for (let i = 0; i < (traps ? traps.length : 0); i++) {
    const trap = traps[i];
    if (trap.once && state.fired[i]) continue;
    // every：條件持續成立時每隔幾秒重複觸發一次（例如地板一格一格崩）
    if (trap.every && ctx.time - state.lastFired[i] < trap.every) continue;
    if (!triggered(trap.when, ctx)) continue;
    state.fired[i] = true;
    state.lastFired[i] = ctx.time;
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
    case 'crumbleFromLeft': {
      // 從最左邊還活著的那一格開始，一次吃掉一整column，往玩家逼近
      const row = world.map[action.y];
      for (let x = 1; x < row.length - 1; x++) {
        if (row[x] === '#') {
          paint(world, x, action.y, 1, world.map.length - action.y, '.');
          break;
        }
      }
      break;
    }
    case 'noteRoute':
      // 玩家此刻在分界線上方還是下方，決定他走的是哪條路
      noteRoute(
        world.profile,
        world.player.y + world.player.h / 2 < action.y * TILE ? 'high' : 'low',
      );
      break;
    default:
      throw new Error(`未知的動作型別：${action.t}`);
  }
}
