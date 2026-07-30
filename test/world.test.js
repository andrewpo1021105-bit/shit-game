import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld, resetLevel } from '../src/game/world.js';
import { LEVELS } from '../src/game/levels/index.js';
import { createProfile } from '../src/game/profile.js';
import { PHYSICS_DT, TILE, RESPAWN_DELAY } from '../src/game/constants.js';

// 一個地板完整、沒有陷阱的測試關卡；adapt 會在第 10 格挖洞並留下一句話
const FLOOR = '##############################';
const AIR = '#............................#';
const ADAPTIVE = {
  id: 99,
  name: '測試用',
  tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
  spawn: [3, 13],
  door: [24, 12],
  traps: [],
  adapt(tiles, profile) {
    const at = profile.lastLandTile ?? 10;
    const out = tiles.slice();
    for (let y = 14; y <= 16; y++) {
      const row = out[y].split('');
      row[at] = '.';
      out[y] = row.join('');
    }
    return { tiles: out };
  },
};

const NONE = { left: false, right: false, jump: false };
const RIGHT = { left: false, right: true, jump: false };

function run(w, input, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateWorld(w, input, PHYSICS_DT);
}

test('世界會複製關卡地圖，不會污染原始資料', () => {
  const w = createWorld(LEVELS[0]);
  w.map[14] = '..............................';
  assert.equal(LEVELS[0].tiles[14], '##############################');
});

test('一直往右走會踩中陷阱，地板消失並掉進洞裡摔死', () => {
  const w = createWorld(LEVELS[0]);
  run(w, RIGHT, 4);
  assert.ok(w.deaths >= 1, `應該死掉，實際 deaths=${w.deaths}`);
});

// 一路往右走到死為止（不要跑滿固定秒數，否則會重生後又往右再死一次）
function runUntilDeath(w) {
  let t = 0;
  while (w.phase !== 'dying' && t < 10) {
    updateWorld(w, RIGHT, PHYSICS_DT);
    t += PHYSICS_DT;
  }
  assert.equal(w.phase, 'dying', '應該已經摔死了');
}

test('死亡後經過重生延遲會回到出生點，死亡計數保留', () => {
  const w = createWorld(LEVELS[0]);
  runUntilDeath(w);
  const deaths = w.deaths;
  run(w, NONE, RESPAWN_DELAY + 0.1);
  assert.equal(w.phase, 'play');
  assert.equal(w.deaths, deaths);
  assert.ok(Math.abs(w.player.x - (LEVELS[0].spawn[0] * TILE + 3)) < TILE);
});

test('重生會復原被挖掉的地板', () => {
  const w = createWorld(LEVELS[0]);
  run(w, RIGHT, 4);
  resetLevel(w);
  assert.equal(w.map[14], '##############################');
});

test('掉出畫面下緣算死亡', () => {
  const w = createWorld(LEVELS[0]);
  w.map[14] = '#...........................#';
  w.map[15] = '#...........................#';
  w.map[16] = '#...........................#';
  run(w, NONE, 2);
  assert.ok(w.deaths >= 1);
});

test('碰到門就過關', () => {
  const w = createWorld(LEVELS[0]);
  // 第 1 關的門會在判定過關前一瞬間閃開，所以要追著它塞幾次
  for (let i = 0; i < 6 && w.phase !== 'won'; i++) {
    w.player.x = w.door.x * TILE + 4;
    w.player.y = w.door.y * TILE + 2;
    updateWorld(w, NONE, PHYSICS_DT);
  }
  assert.equal(w.phase, 'won');
});

test('過關後 phaseTimer 持續累加，通關動畫才有時間軸可用', () => {
  const w = createWorld(LEVELS[0]);
  // 第 1 關的門會在判定過關前一瞬間閃開，所以要追著它塞幾次
  for (let i = 0; i < 6 && w.phase !== 'won'; i++) {
    w.player.x = w.door.x * TILE + 4;
    w.player.y = w.door.y * TILE + 2;
    updateWorld(w, NONE, PHYSICS_DT);
  }
  assert.equal(w.phase, 'won');
  assert.equal(w.phaseTimer, 0);
  run(w, NONE, 0.5);
  assert.ok(w.phaseTimer > 0.4, `phaseTimer 應該有在跑，實際 ${w.phaseTimer}`);
  assert.equal(w.phase, 'won', '過關後不該自己跳離 won 狀態');
});

test('adapt 在建立世界時就套用，地形一開始就是被改過的', () => {
  const w = createWorld(ADAPTIVE, createProfile());
  assert.equal(w.map[14][10], '.', '第 10 格應該被挖掉');
});

test('adapt 不會弄髒關卡的原始 tiles', () => {
  const w = createWorld(ADAPTIVE, createProfile());
  w.map[14] = '..............................';
  assert.equal(ADAPTIVE.tiles[14], FLOOR, '原始關卡資料必須維持乾淨');
  createWorld(ADAPTIVE, createProfile());
  assert.equal(ADAPTIVE.tiles[14], FLOOR);
});

test('重生時重跑 adapt，並且讀得到最新的側寫', () => {
  const profile = createProfile();
  const w = createWorld(ADAPTIVE, profile);
  assert.equal(w.map[14][10], '.');
  profile.lastLandTile = 18;
  resetLevel(w);
  assert.equal(w.map[14][10], '#', '舊的洞應該補回來');
  assert.equal(w.map[14][18], '.', '新的洞應該挖在側寫指的地方');
});

test('碰到假門會死，碰到真門才過關', () => {
  const TWO_DOORS = {
    id: 90,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    decoys: [[16, 12]],
    traps: [],
  };
  const w = createWorld(TWO_DOORS, createProfile());
  w.player.x = 16 * TILE + 4;
  w.player.y = 12 * TILE + 2;
  updateWorld(w, NONE, PHYSICS_DT);
  assert.equal(w.phase, 'dying', '碰到假門應該死');
  assert.equal(w.deaths, 1);

  const w2 = createWorld(TWO_DOORS, createProfile());
  w2.player.x = 24 * TILE + 4;
  w2.player.y = 12 * TILE + 2;
  updateWorld(w2, NONE, PHYSICS_DT);
  assert.equal(w2.phase, 'won', '碰到真門才過關');
});

test('重生會把突然冒出來的假門清掉', () => {
  const POPPER = {
    id: 89,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'spawnDecoy', x: 18, y: 12 }], once: true }],
  };
  const w = createWorld(POPPER, createProfile());
  assert.deepEqual(w.decoys, [], '一開始沒有假門');
  run(w, NONE, 0.3);
  assert.equal(w.decoys.length, 1, '假門應該冒出來了');
  resetLevel(w);
  assert.deepEqual(w.decoys, [], '重生後不該留著上一條命冒出來的假門');
});

test('砸下來的方塊會落地變成實心方塊，擋在那裡', () => {
  const DROPPER = {
    id: 97,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'dropBlock', x: 20, y: 2 }], once: true }],
  };
  const w = createWorld(DROPPER, createProfile());
  run(w, NONE, 0.2);
  assert.equal(w.hazards.length, 1, '方塊應該正在掉');
  run(w, NONE, 2);
  assert.equal(w.hazards.length, 0, '落地後就不該還是活動危險物');
  assert.equal(w.map[13][20], '#', '方塊應該變成實心地形');
});

test('被砸下來的方塊打中會死', () => {
  const ONHEAD = {
    id: 96,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'dropBlock', x: 3, y: 2 }], once: true }],
  };
  const w = createWorld(ONHEAD, createProfile());
  run(w, NONE, 2);
  assert.ok(w.deaths >= 1, '站在正下方不動應該被砸死');
});

test('封路的高牆砸下來時，被關在後面的玩家算死', () => {
  const WALL = {
    id: 92,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{
      when: { t: 'afterDelay', s: 0.1 },
      do: [{ t: 'dropBlock', x: 12, y: 1, rows: 5, seals: true, gravity: 400 }],
      once: true,
    }],
  };
  const w = createWorld(WALL, createProfile());
  run(w, NONE, 3);            // 站在原地不動，牆落在前方
  assert.ok(w.deaths >= 1, '被關在牆後面應該直接算死，而不是卡住');
});

test('封路的高牆有五格高，玩家跳不上去', () => {
  const WALL = {
    id: 91,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{
      when: { t: 'afterDelay', s: 0.1 },
      do: [{ t: 'dropBlock', x: 12, y: 1, rows: 5, seals: true, gravity: 400 }],
      once: true,
    }],
  };
  const w = createWorld(WALL, createProfile());
  let landed = false;
  for (let i = 0; i < Math.round(3 / PHYSICS_DT); i++) {
    updateWorld(w, NONE, PHYSICS_DT);
    if (w.events.includes('thud')) { landed = true; break; }
  }
  assert.equal(landed, true, '牆應該要落地');
  // 牆佔第 9~13 列，頂端 y = 144。玩家跳躍最高只能讓腳底到 y = 173，
  // 所以站不上去——這就是「跳不過去」的意思。
  for (let row = 9; row <= 13; row++) {
    assert.equal(w.map[row][12], '#', `第 ${row} 列應該是牆的一部分`);
  }
});

test('橫掃的刺撞到牆就消失，不會永遠留在場上', () => {
  const SWEEP = {
    id: 95,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    // 走高空路線，才不會半路掃到站在原地的玩家而中斷測試
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'sweepSpike', x: 20, y: 5, vx: -90 }], once: true }],
  };
  const w = createWorld(SWEEP, createProfile());
  run(w, NONE, 0.2);
  assert.equal(w.hazards.length, 1);
  run(w, NONE, 6);
  assert.equal(w.hazards.length, 0, '掃到左牆就該消失');
  assert.equal(w.deaths, 0, '高空掃過不該碰到玩家');
});

test('橫掃的刺掃到玩家會死', () => {
  const SWEEP = {
    id: 93,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'sweepSpike', x: 20, y: 13, vx: -90 }], once: true }],
  };
  const w = createWorld(SWEEP, createProfile());
  run(w, NONE, 5);
  assert.ok(w.deaths >= 1, '站在原地應該被掃到');
});

test('重生會清掉場上所有危險物', () => {
  const SWEEP = {
    id: 94,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'sweepSpike', x: 20, y: 13, vx: -90 }], once: true }],
  };
  const w = createWorld(SWEEP, createProfile());
  run(w, NONE, 0.2);
  assert.equal(w.hazards.length, 1);
  resetLevel(w);
  assert.deepEqual(w.hazards, [], '重生後場上不該留著上一條命的危險物');
});

test('刺突然冒出來時會發出事件，玩家才察覺得到', () => {
  const POPPER = {
    id: 98,
    name: '測試用',
    tiles: [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR],
    spawn: [3, 13],
    door: [24, 12],
    traps: [{ when: { t: 'crossX', x: 6 }, do: [{ t: 'spawnSpikes', x: 20, y: 14, w: 1, h: 1 }], once: true }],
  };
  const w = createWorld(POPPER, createProfile());
  let sawSpike = false;
  for (let i = 0; i < Math.round(3 / PHYSICS_DT); i++) {
    updateWorld(w, RIGHT, PHYSICS_DT);
    if (w.events.includes('spike')) {
      sawSpike = true;
      // 要在事件當下檢查——再跑下去玩家會踩到刺，重生時地圖就重建了
      assert.equal(w.map[14][20], '^', '刺應該真的長在地圖上');
      break;
    }
  }
  assert.equal(sawSpike, true, '刺冒出來必須發出 spike 事件');
});

test('adapt 只在建立與重生時跑，遊玩途中地形不會自己變', () => {
  const profile = createProfile();
  const w = createWorld(ADAPTIVE, profile);
  const before = w.map.join('|');
  profile.lastLandTile = 18;          // 側寫在遊玩途中改變
  run(w, RIGHT, 0.5);
  assert.equal(w.map.join('|'), before, '這條命之內地形必須紋風不動');
});

test('墜落穿過地板線時會把落點記進側寫', () => {
  const profile = createProfile();
  const w = createWorld(ADAPTIVE, profile);
  runUntilDeath(w);
  assert.equal(profile.lastLandTile, 10, `應該記下掉進洞的那一格，實際 ${profile.lastLandTile}`);
});

test('出生的那一瞬間不算落地，不會污染側寫', () => {
  const profile = createProfile();
  const w = createWorld(ADAPTIVE, profile);
  run(w, NONE, 0.3);
  assert.equal(profile.lastLandTile, null, '站在原地不該產生落點紀錄');
});

test('重生會累加嘗試次數', () => {
  const profile = createProfile();
  const w = createWorld(ADAPTIVE, profile);
  resetLevel(w);
  resetLevel(w);
  assert.equal(profile.attempts, 2);
});

test('死亡事件會出現在 events 裡', () => {
  const w = createWorld(LEVELS[0]);
  let sawDeath = false;
  for (let i = 0; i < Math.round(4 / PHYSICS_DT); i++) {
    updateWorld(w, RIGHT, PHYSICS_DT);
    if (w.events.includes('death')) sawDeath = true;
  }
  assert.equal(sawDeath, true);
});

// 一條完全空的平路，走到 x=8 就觸發指定的動作
function actionLevel(id, action) {
  return {
    id, name: '測試用',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12],
    decoys: [[20, 8]],
    traps: [{ when: { t: 'crossX', x: 8 }, do: [action], once: true }],
  };
}

function runTo(world, seconds, input = { left: false, right: true, jump: false }) {
  for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) updateWorld(world, input, PHYSICS_DT);
}

test('假死看起來就是死亡，但沒有真的死', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  // 撞到觸發線大約在 0.68 秒，s=0.6 的演出會在 1.28 秒左右演完，
  // 所以要在這段窗口中間取樣，才驗得到「正在演」的狀態。
  runTo(world, 1.0);
  assert.equal(world.phase, 'faking', '應該正在演出');
  assert.equal(world.fakeKind, 'death');
  assert.equal(world.deaths, 0, '假死不能算進死亡數');
  assert.equal(world.player.vx, 0, '演出期間人是停住的');
});

test('假死演完就原地繼續，位置不變', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  runTo(world, 1.0);
  const x = world.player.x;
  // 這裡刻意不繼續按右——要驗的是「演完沒有被傳送」，
  // 不是「玩家自己選擇停下來」，所以後半段不能再給位移輸入。
  runTo(world, 0.5, { left: false, right: false, jump: false });
  assert.equal(world.phase, 'play');
  assert.equal(world.fakeKind, null);
  assert.equal(world.player.x, x, '演完人要在原地，不是回到出生點');
});

test('假通關演完會把真門換成假門', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeWin', s: 1.2 }));
  const before = { x: world.door.x, y: world.door.y };
  runTo(world, 1.5);
  assert.equal(world.fakeKind, 'win');
  runTo(world, 1.3);
  assert.equal(world.phase, 'play');
  assert.notDeepEqual({ x: world.door.x, y: world.door.y }, before,
    '你剛剛「過關」的那扇門現在是假的');
});

test('重生會清掉演出狀態', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  runTo(world, 1.5);
  resetLevel(world);
  assert.equal(world.phase, 'play');
  assert.equal(world.fakeKind, null);
});

// 撞到觸發線大約在 0.6833 秒（跟假死／假通關測試同一條觸發線），
// s=0.8 的凍結會在觸發後 96 個物理格解除，也就是全域時間 ≈1.4833 秒。
// 原本 brief 的檢查點是 runTo(world, 1.5)——比解凍時刻晚了約 0.0167 秒，
// 到這個檢查點時凍結其實已經解除，斷言會直接踩到 null。改成 1.0，
// 離觸發線還有 0.3167 秒緩衝（保證已經觸發），離解凍還有 0.4833 秒緩衝。
test('freeze 期間物理完全不前進', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'freeze', s: 0.8 }));
  runTo(world, 1.0);
  assert.equal(world.glitch.kind, 'freeze');
  const x = world.player.x;
  runTo(world, 0.3);
  assert.equal(world.player.x, x, '凍住了就不能再往前滑——這是它不吃手速的保證');
});

// 同樣把檢查點從 1.5 移到 1.0，再多等 0.7 秒（累計 1.7 秒），
// 離解凍時刻 1.4833 秒還有約 0.2167 秒緩衝，確保這一刻凍結真的已經解除。
test('freeze 時間到就解凍', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'freeze', s: 0.8 }));
  runTo(world, 1.0);
  runTo(world, 0.7);
  assert.equal(world.glitch, null);
  const x = world.player.x;
  runTo(world, 0.2);
  assert.ok(world.player.x > x, '解凍後要能繼續走');
});

test('label 在這條命之內不會自己消失', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'label', text: 'LEVEL 13' }));
  runTo(world, 1.5);
  assert.equal(world.glitch.text, 'LEVEL 13');
  runTo(world, 5.0);
  assert.equal(world.glitch.text, 'LEVEL 13', '沒有 s 就不會過期');
});

test('重生清掉 glitch', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'label', text: 'LEVEL 13' }));
  runTo(world, 1.5);
  resetLevel(world);
  assert.equal(world.glitch, null);
});

// ─── 敵人 ───────────────────────────────────────────────────────
// 敵人是會動的死亡判定,跟假門一樣碰到就死。三種個性:
// walker 來回巡邏、charger 看到你就衝過來、spitter 只在你停下來時開火。

function enemyLevel(id, enemies, traps = []) {
  return {
    id, name: '測試用',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12],
    enemies,
    traps,
  };
}

test('walker 在巡邏範圍內來回走,到邊界就折返', () => {
  const w = createWorld(enemyLevel(95, [
    { kind: 'walker', x: 12, y: 13, min: 10, max: 15, speed: 40 },
  ]));
  const e = w.enemies[0];
  assert.ok(e, '世界裡應該有敵人');
  const x0 = e.x;
  runTo(w, 0.5, NONE);
  assert.notEqual(e.x, x0, '敵人應該會動');
  // 跑很久,永遠不出界
  for (let i = 0; i < Math.round(10 / PHYSICS_DT); i++) {
    updateWorld(w, NONE, PHYSICS_DT);
    assert.ok(e.x >= 10 * TILE - 1 && e.x + e.w <= (15 + 1) * TILE + 1,
      `敵人跑出巡邏範圍:x=${e.x}`);
  }
});

test('碰到敵人就死', () => {
  const w = createWorld(enemyLevel(94, [
    { kind: 'walker', x: 7, y: 13, min: 5, max: 12, speed: 30 },
  ]));
  runTo(w, 2.0);   // 一直往右走,直直撞上去
  assert.ok(w.deaths >= 1, `撞到敵人應該死,實際 deaths=${w.deaths}`);
});

test('charger 看到玩家會衝刺,衝到巡邏邊界會累倒再恢復', () => {
  const w = createWorld(enemyLevel(93, [
    { kind: 'charger', x: 18, y: 13, min: 12, max: 21, speed: 30 },
  ]));
  const e = w.enemies[0];
  // 玩家走進視野(4 格內、同一列)
  runTo(w, 1.35);
  assert.equal(e.mode, 'dash', `應該在衝刺,實際 mode=${e.mode}`);
  // 衝刺方向朝著玩家(玩家在左邊)
  assert.ok(e.dashDir < 0, '應該朝玩家衝');
});

test('spitter 只在玩家停下來的時候開火', () => {
  const w = createWorld(enemyLevel(92, [
    { kind: 'spitter', x: 20, y: 13, dir: -1, range: 14 },
  ]));
  // 一直動就永遠不會被射
  runTo(w, 1.0);
  assert.equal(w.hazards.length, 0, '玩家在動,砲塔不該開火');
  // 停下來超過門檻就開火
  runTo(w, 1.2, NONE);
  assert.ok(w.hazards.length >= 1, '玩家站著不動,砲塔應該開火');
  assert.equal(w.hazards[0].kind, 'spit');
});

test('重生會把敵人放回原位', () => {
  const w = createWorld(enemyLevel(91, [
    { kind: 'walker', x: 14, y: 13, min: 10, max: 19, speed: 40 },
  ]));
  const x0 = w.enemies[0].x;
  runTo(w, 1.0, NONE);
  assert.notEqual(w.enemies[0].x, x0);
  resetLevel(w);
  assert.equal(w.enemies[0].x, x0, '重生後敵人要回到原位');
});

test('spawnEnemy 動作會在場上多一隻敵人', () => {
  const w = createWorld(enemyLevel(90, [], [
    {
      when: { t: 'crossX', x: 10 },
      do: [{ t: 'spawnEnemy', kind: 'walker', x: 18, y: 13, min: 15, max: 22, speed: 40 }],
      once: true,
    },
  ]));
  assert.equal(w.enemies.length, 0);
  runTo(w, 1.5);
  assert.equal(w.enemies.length, 1, '越線之後應該多一隻敵人');
});
