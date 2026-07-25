// 從 Level Devil 借來的三個把戲：左右反轉、物理改變、門的欺騙。
// 它們是可重用的 trap action，不是某一關的特例，所以測試也放在一起。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld } from '../src/game/world.js';
import { applyAction } from '../src/game/traps.js';
import { createPlayer, updatePlayer } from '../src/game/player.js';
import { createProfile, noteJumpLead, noteHesitation, countHesitations } from '../src/game/profile.js';
import { PHYSICS_DT, TILE, DEFAULT_TUNE, RESPAWN_DELAY } from '../src/game/constants.js';

const FLOOR = '##############################';
const AIR = '#............................#';
const flat = () => [FLOOR, ...Array(13).fill(AIR), FLOOR, FLOOR, FLOOR];

const NONE = { left: false, right: false, jump: false };
const RIGHT = { left: false, right: true, jump: false };
const JUMP_RIGHT = { left: false, right: true, jump: true };

function run(w, input, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateWorld(w, input, PHYSICS_DT);
}

function level(over = {}) {
  return { id: 99, name: '測試用', tiles: flat(), spawn: [3, 13], door: [24, 12], traps: [], ...over };
}

// 在地板上擺一根刺，用來製造「一定會死」的測試關卡
function spikeAt(x) {
  const tiles = flat();
  const row = tiles[14].split('');
  row[x] = '^';
  tiles[14] = row.join('');
  return tiles;
}

// 走到死，然後剛好跨過重生延遲——重生後立刻檢查，
// 不能多跑，否則陷阱會在新的一條命裡再次觸發，看到的就不是重生後的乾淨狀態
function killAndRespawn(w, input) {
  for (let i = 0; i < 1200 && w.phase !== 'dying'; i++) updateWorld(w, input, PHYSICS_DT);
  assert.equal(w.phase, 'dying', '測試關卡應該要能把玩家弄死');
  const n = Math.round((RESPAWN_DELAY + PHYSICS_DT) / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateWorld(w, NONE, PHYSICS_DT);
  assert.equal(w.phase, 'play', '應該已經重生');
}

// ---------------------------------------------------------------- 左右反轉

test('反轉之後，按右變成往左走', () => {
  const w = createWorld(level());
  run(w, RIGHT, 0.5);
  const beforeX = w.player.x;
  assert.ok(beforeX > 3 * TILE, '先確認正常狀態下按右是往右走');

  applyAction(w, { t: 'flipControls' });
  run(w, RIGHT, 0.5);
  assert.ok(w.player.x < beforeX, `反轉後按右應該往左，實際 x 從 ${beforeX} 變成 ${w.player.x}`);
});

test('flipControls 可以明確關掉，不是只能切換', () => {
  const w = createWorld(level());
  applyAction(w, { t: 'flipControls', on: true });
  assert.equal(w.flipped, true);
  applyAction(w, { t: 'flipControls', on: false });
  assert.equal(w.flipped, false);
});

test('反轉是命內狀態，重生就歸零', () => {
  // 刺放在出生點左邊：反轉之後按右會往左走，正好走上去
  const w = createWorld(level({
    tiles: spikeAt(1),
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'flipControls' }], once: true }],
  }));
  run(w, RIGHT, 0.3);
  assert.equal(w.flipped, true, '陷阱應該已經把控制反轉了');

  killAndRespawn(w, RIGHT);
  assert.equal(w.flipped, false, '重生後必須恢復正常操作');
});

test('反轉觸發時會發出事件，玩家才察覺得到', () => {
  const w = createWorld(level({
    traps: [{ when: { t: 'afterDelay', s: 0.1 }, do: [{ t: 'flipControls' }], once: true }],
  }));
  let sawFlip = false;
  for (let i = 0; i < 60; i++) {
    updateWorld(w, RIGHT, PHYSICS_DT);
    if (w.events.includes('flip')) sawFlip = true;
  }
  assert.ok(sawFlip, '反轉沒有任何提示等於作弊，必須推出 flip 事件');
});

// ---------------------------------------------------------------- 物理改變

test('tune 可以改掉跳躍高度', () => {
  const map = flat();
  const weak = createPlayer(3, 13);
  const strong = createPlayer(3, 13);
  const lowTune = { ...DEFAULT_TUNE, jumpSpeed: 150 };

  for (let i = 0; i < 60; i++) {
    updatePlayer(weak, map, { ...NONE, jump: true }, PHYSICS_DT, lowTune);
    updatePlayer(strong, map, { ...NONE, jump: true }, PHYSICS_DT);
  }
  assert.ok(strong.y < weak.y, `跳躍初速小的應該跳得比較低（strong=${strong.y} weak=${weak.y}）`);
});

test('沒給 tune 時行為跟改動前完全一樣', () => {
  const map = flat();
  const a = createPlayer(3, 13);
  const b = createPlayer(3, 13);
  for (let i = 0; i < 90; i++) {
    updatePlayer(a, map, JUMP_RIGHT, PHYSICS_DT);
    updatePlayer(b, map, JUMP_RIGHT, PHYSICS_DT, DEFAULT_TUNE);
  }
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
});

test('setTune 只覆蓋指定欄位，其餘保持不變', () => {
  const w = createWorld(level());
  applyAction(w, { t: 'setTune', tune: { gravityDown: 3400 } });
  assert.equal(w.tune.gravityDown, 3400);
  assert.equal(w.tune.jumpSpeed, DEFAULT_TUNE.jumpSpeed, '沒指定的欄位不該被動到');
});

test('物理突變是命內的，重生會復原', () => {
  const w = createWorld(level({
    tiles: spikeAt(5),
    traps: [{ when: { t: 'afterDelay', s: 0.05 }, do: [{ t: 'setTune', tune: { jumpSpeed: 10 } }], once: true }],
  }));
  run(w, RIGHT, 0.2);
  assert.equal(w.tune.jumpSpeed, 10);

  killAndRespawn(w, RIGHT);
  assert.equal(w.tune.jumpSpeed, DEFAULT_TUNE.jumpSpeed, '重生必須拿回原本的手感');
});

test('adapt 可以整包換掉手感', () => {
  const w = createWorld(level({
    adapt: (tiles) => ({ tiles: tiles.slice(), tune: { gravityUp: 2000 } }),
  }));
  assert.equal(w.tune.gravityUp, 2000);
  assert.equal(w.tune.maxSpeed, DEFAULT_TUNE.maxSpeed, 'adapt 沒指定的欄位仍用預設值');
});

// ---------------------------------------------------------------- 門的欺騙

test('swapDoor 讓真門與假門交換位置', () => {
  const w = createWorld(level({ decoys: [[10, 5]] }));
  applyAction(w, { t: 'swapDoor', decoy: 0 });
  assert.deepEqual({ x: w.door.x, y: w.door.y }, { x: 10, y: 5 });
  assert.deepEqual({ x: w.decoys[0].x, y: w.decoys[0].y }, { x: 24, y: 12 });
});

test('碰到門的瞬間換走，你摸到的那扇當場變成假的，直接死', () => {
  const w = createWorld(level({
    decoys: [[10, 5]],
    traps: [{ when: { t: 'touchDoor' }, do: [{ t: 'swapDoor', decoy: 0 }], once: true }],
  }));
  run(w, RIGHT, 6);
  assert.ok(w.deaths >= 1, '應該死在自己碰到的那扇門上');
  assert.notEqual(w.phase, 'won', '絕不能讓他過關');
});

test('沒有那扇假門時 swapDoor 什麼都不做，不會爆掉', () => {
  const w = createWorld(level());
  applyAction(w, { t: 'swapDoor', decoy: 3 });
  assert.deepEqual({ x: w.door.x, y: w.door.y }, { x: 24, y: 12 });
});

test('重生會把交換過的門放回原位', () => {
  const w = createWorld(level({
    decoys: [[10, 5]],
    tiles: spikeAt(5),
    traps: [{ when: { t: 'afterDelay', s: 0.05 }, do: [{ t: 'swapDoor', decoy: 0 }], once: true }],
  }));
  run(w, RIGHT, 0.2);
  assert.equal(w.door.x, 10);

  killAndRespawn(w, RIGHT);
  assert.equal(w.door.x, 24, '重生後真門必須回到原位');
  assert.equal(w.decoys[0].x, 10);
});

// ---------------------------------------------------------------- 新側寫指標

test('起跳提前量：量的是人到坑邊的距離', () => {
  // 第 12 格開始是洞
  const tiles = flat();
  for (let y = 14; y <= 16; y++) {
    const row = tiles[y].split('');
    for (let x = 12; x <= 14; x++) row[x] = '.';
    tiles[y] = row.join('');
  }
  const w = createWorld(level({ tiles }));
  // 走到坑前再跳
  run(w, RIGHT, 0.9);
  run(w, JUMP_RIGHT, 0.2);

  const lead = w.profile.lastJumpLead;
  assert.ok(lead !== null, '在坑前起跳應該要留下樣本');
  assert.ok(lead >= 0 && lead < 8 * TILE, `提前量應該落在掃描範圍內，實際 ${lead}`);
});

test('前方一路平坦時不取樣，不用平地亂跳污染側寫', () => {
  const w = createWorld(level());
  const before = w.profile.jumpLeads.length;
  run(w, JUMP_RIGHT, 0.4);
  assert.ok(w.jumps >= 1, '確認真的跳了');
  assert.equal(w.profile.jumpLeads.length, before, '平地上的跳躍不算一次「對著障礙起跳」');
});

test('猶豫：停下來想過的那條命會被記一筆', () => {
  const w = createWorld(level());
  run(w, RIGHT, 0.4);      // 先動起來
  run(w, NONE, 1.0);       // 再停下來想
  assert.equal(w.hesitated, true);
});

test('出生後還沒動的那段靜止不算猶豫', () => {
  const w = createWorld(level());
  run(w, NONE, 1.5);
  assert.equal(w.hesitated, false, '還沒開始走就不算「猶豫」，那只是還沒開始');
});

test('過關也會結算猶豫，不是只從死亡中學習', () => {
  const w = createWorld(level());
  run(w, RIGHT, 6);
  assert.equal(w.phase, 'won');
  assert.equal(w.profile.hesitations.length, 1, '過關同樣要留下一筆樣本');
});

test('一條命只結算一次側寫', () => {
  const w = createWorld(level());
  run(w, RIGHT, 6);
  const n = w.profile.hesitations.length;
  run(w, RIGHT, 2);
  assert.equal(w.profile.hesitations.length, n, '停在通關畫面不該每幀再記一次');
});

test('countHesitations 數的是猶豫過的次數', () => {
  const p = createProfile();
  noteHesitation(p, true);
  noteHesitation(p, false);
  noteHesitation(p, true);
  assert.equal(countHesitations(p), 2);
});

test('noteJumpLead 忽略 null，不會在歷史裡塞進空值', () => {
  const p = createProfile();
  noteJumpLead(p, null);
  noteJumpLead(p, undefined);
  noteJumpLead(p, 24);
  assert.deepEqual(p.jumpLeads, [24]);
});

// ---------------------------------------------------------------- adapt 的第三參數

test('adapt 收得到本關死亡數，而且不會被前面關卡的嘗試次數污染', () => {
  const seen = [];
  const w = createWorld(level({
    tiles: spikeAt(5),
    adapt(tiles, profile, ctx) {
      seen.push(ctx.deaths);
      return { tiles: tiles.slice() };
    },
  }));
  assert.deepEqual(seen, [0], '第一次建立世界時還沒死過');

  killAndRespawn(w, RIGHT);
  assert.deepEqual(seen, [0, 1], '重生時要再跑一次 adapt，而且看得到「這一關死過 1 次」');
});
