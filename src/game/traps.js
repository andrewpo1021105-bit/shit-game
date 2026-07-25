import { TILE, MAP_W, MAP_H, DEFAULT_TUNE } from './constants.js';
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
    case 'standOn':
      return ctx.grounded && ctx.footX === when.x && ctx.footY === when.y;
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
    case 'spawnSpikes':
      // 沒有預告，就是突然長出來。看得見是唯一的公平性保證。
      paint(world, action.x, action.y, action.w, action.h, action.down ? 'v' : '^');
      break;
    case 'dropBlock':
      // 從天花板砸下來的東西。砸到人會死，落地後就地變成實心地形。
      // rows 給到 4 以上就高過玩家跳得上去的極限，等於一面牆；
      // 這種牆要配 seals，被關在後面的人會直接算死，免得卡在原地動彈不得。
      world.hazards.push({
        kind: 'block',
        x: action.x * TILE, y: action.y * TILE,
        w: TILE, h: (action.rows ?? 1) * TILE,
        vx: 0, vy: 0,
        gravity: action.gravity ?? 1200,
        seals: action.seals ?? false,
      });
      break;
    case 'spawnDecoy':
      // 憑空多出一扇門。玩家沒辦法分辨哪扇是真的。
      world.decoys.push({ x: action.x, y: action.y });
      break;
    case 'sweepSpike':
      // 橫著掃過來的刺。撞到牆就消失。
      world.hazards.push({
        kind: 'spike',
        x: action.x * TILE, y: action.y * TILE,
        w: TILE, h: TILE,
        vx: action.vx, vy: 0, gravity: 0,
      });
      break;
    case 'moveDoor': {
      // 門是兩格寬，夾在左右牆之間才不會逃出地圖。
      // 逃到底就無處可逃，所以「追門」永遠追得到。
      const fromX = world.door.x, fromY = world.door.y;
      world.door.x = Math.min(MAP_W - 3, Math.max(1, world.door.x + action.x));
      world.door.y = Math.min(MAP_H - 4, Math.max(1, world.door.y + action.y));

      // 門搬走之後，它原本站的地方塌成一個洞——追門因此要跨坑。
      if (action.leaveHole) {
        const restRow = fromY + 2;
        const sameRow = world.door.y + 2 === restRow;
        for (let x = fromX; x <= fromX + 1; x++) {
          // 門新位置的落腳處不能挖，否則門會浮在半空中永遠碰不到
          const stillUnderDoor = sameRow && x >= world.door.x && x <= world.door.x + 1;
          if (!stillUnderDoor) paint(world, x, restRow, 1, world.map.length - restRow, '.');
        }
      }
      break;
    }
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
    case 'flipControls':
      // 左右對調。這是命內翻臉，重生就歸零（applyBuild 會清掉）。
      // 公平性靠「觸發那一瞬間看得見」：world.js 會推一個 flip 事件，
      // 而且反轉期間 HUD 的關卡編號是鏡像的。
      world.flipped = action.on ?? true;
      break;
    case 'setTune':
      // 物理突變。只覆蓋指定的欄位，其餘維持這條命目前的值。
      // 有些檢查用的假世界沒有 tune，退回預設值就好，不該炸掉。
      world.tune = { ...(world.tune ?? DEFAULT_TUNE), ...action.tune };
      break;
    case 'swapDoor': {
      // 真門跟假門互換身分。配 touchDoor 觸發器時特別惡毒：
      // updateWorld 的順序是「跑觸發器 → 檢查假門 → 檢查真門」，
      // 所以你正碰著的那扇會在過關判定之前變成假的，當場死。
      const d = world.decoys[action.decoy ?? 0];
      if (!d) break;
      const { x, y } = world.door;
      world.door.x = d.x;
      world.door.y = d.y;
      d.x = x;
      d.y = y;
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
