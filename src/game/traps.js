import { TILE, DEFAULT_TUNE } from './constants.js';
import { noteRoute } from './profile.js';

// 敵人的出廠設定。座標從格子換成像素,巡邏邊界也一起換算好,
// 更新迴圈就不用每幀做單位換算。
// 三種個性:walker 來回巡邏、charger 看到你就衝、spitter 只射站著不動的人。
export function makeEnemy(def) {
  const w = 12, h = 14;
  return {
    kind: def.kind,
    x: def.x * TILE + (TILE - w) / 2,
    y: def.y * TILE + (TILE - h),
    w, h,
    dir: def.dir ?? 1,
    speed: def.speed ?? 35,
    min: (def.min ?? def.x - 3) * TILE,
    max: (def.max ?? def.x + 3) * TILE,
    sight: (def.sight ?? 9) * TILE,      // charger 的視野
    range: (def.range ?? 12) * TILE,     // spitter 的射程
    mode: 'patrol',                      // charger:patrol → dash → tired
    dashDir: 0,
    timer: 0,                            // charger 累倒的恢復時間
    cool: 0,                             // spitter 開火冷卻
  };
}

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

// 跟 paint 不同：它不是塗掉一整塊，而是照對照表逐格換。
// 沒列在對照表裡的字元一律不動——所以空氣永遠是空氣，
// 不會因為「把這塊變成實心」而把玩家要走的洞填掉。
function repaint(world, x, y, w, h, mapping) {
  for (let ty = y; ty < y + h; ty++) {
    if (ty < 0 || ty >= world.map.length) continue;
    const row = world.map[ty].split('');
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tx >= row.length) continue;
      const to = mapping[row[tx]];
      if (to) row[tx] = to;
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
    case 'revealFake':
      // 你第一次穿過去的地板，第二次是實的。同一塊地磚，兩種命運。
      repaint(world, action.x, action.y, action.w, action.h, { ',': '#', '/': '^' });
      break;
    case 'fakeTiles':
      // 反過來：你剛剛才踩過的地板，現在只是畫上去的。
      repaint(world, action.x, action.y, action.w, action.h, { '#': ',', '^': '/' });
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
      // 邊界用實際地圖尺寸——BOSS 關比標準地圖寬三倍。
      const mw = world.map[0].length, mh = world.map.length;
      const fromX = world.door.x, fromY = world.door.y;
      world.door.x = Math.min(mw - 3, Math.max(1, world.door.x + action.x));
      world.door.y = Math.min(mh - 4, Math.max(1, world.door.y + action.y));

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
    case 'crumbleFromRight': {
      // 同樣的東西，但從門那一側往回吃。這是「切斷去路」而不是「切斷退路」，
      // 玩家會眼睜睜看著自己要去的地方一格一格消失。
      const row = world.map[action.y];
      // from 讓關卡指定「從哪一格開始往回吃」，免得每次都只咬到邊界牆
      const start = Math.min(action.from ?? row.length - 2, row.length - 2);
      for (let x = start; x > 0; x--) {
        if (row[x] === '#') {
          paint(world, x, action.y, 1, world.map.length - action.y, '.');
          break;
        }
      }
      break;
    }
    case 'lockDoor':
      // 你碰到門了，門就是不開。沒有解釋，只有一個倒數。
      // 解法永遠是「站在那裡等」——所以它考的是你敢不敢不動，
      // 而不是你手多快。等的期間通常會有別的東西找上你。
      world.doorLock = Math.max(world.doorLock ?? 0, action.s ?? 1);
      break;
    case 'moveDecoy': {
      // 假門也會跑。這樣「哪一扇是真的」就不是背得起來的知識。
      const d = world.decoys[action.decoy ?? 0];
      if (!d) break;
      d.x = Math.min(world.map[0].length - 3, Math.max(1, d.x + (action.x ?? 0)));
      d.y = Math.min(world.map.length - 4, Math.max(1, d.y + (action.y ?? 0)));
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
    case 'fakeDeath':
    case 'fakeWin': {
      // 演一次死亡／過關。震動、音效、CLEAR! 字樣全部跟真的一模一樣，
      // 但你沒死也沒過。它破壞的是玩家最底層的信任：
      // 你連「我剛剛是不是死了」都不確定。
      if (world.phase !== 'play') break;
      world.phase = 'faking';
      world.fakeKind = action.t === 'fakeWin' ? 'win' : 'death';
      world.fakeTimer = 0;
      world.fakeDuration = action.s ?? (action.t === 'fakeWin' ? 1.2 : 0.6);
      // 停住。真的死亡是不會繼續往前滑的。
      world.player.vx = 0;
      world.player.vy = 0;
      break;
    }
    case 'glitch':
      // 假當機。freeze 與 crash 連物理一起凍住——只凍畫面、物理照跑
      // 會變成「你看到的是 0.8 秒前的自己」，那是純考手指，而且踩到
      // 「跟時間賽跑」的紅線。凍結解除時場上已經不一樣了，一樣嚇人。
      //
      // label 沒有 s，所以 timer 是 0，這條命之內不會自己恢復——
      // 關卡編號亂掉之後就一路錯下去，玩家會持續懷疑自己漏了什麼。
      world.glitch = {
        kind: action.kind,
        text: action.text ?? null,
        timer: action.s ?? 0,
      };
      break;
    case 'spawnEnemy':
      // 場上多一隻敵人。檢查用的假世界沒有 enemies 陣列,補一個就好。
      (world.enemies ??= []).push(makeEnemy(action));
      break;
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
