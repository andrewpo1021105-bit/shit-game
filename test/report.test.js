// 第 12 關結束後那份「它對你的評語」，以及第 10 關當面宣告的那句話。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile, buildReport, noteLanding, noteApex, noteSpeed,
  noteRestartDelay, noteJumpLead, noteHesitation, noteRoute, noteAttempt,
} from '../src/game/profile.js';
import { createSession, updateSession, CLEAR_HOLD, REVEAL_AT } from '../src/game/session.js';
import { LEVELS } from '../src/game/levels/index.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

const NONE = { left: false, right: false, jump: false };

function run(s, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateSession(s, NONE, PHYSICS_DT);
}

// 直接把玩家塞到門上。門會閃開，也可能鎖住不開，
// 所以要一直追著它的現在位置塞，直到鎖也退完為止。
function forceWin(s) {
  const limit = Math.round(3 / PHYSICS_DT);
  for (let i = 0; i < limit && s.world.phase !== 'won'; i++) {
    s.world.player.x = s.world.door.x * TILE + 4;
    s.world.player.y = s.world.door.y * TILE + 2;
    updateSession(s, NONE, PHYSICS_DT);
  }
  assert.equal(s.world.phase, 'won', '追著門塞了三秒還是沒過關');
}

function fullProfile() {
  const p = createProfile();
  for (const t of [19, 19, 12]) noteLanding(p, t);
  for (const a of [50, 51, 49]) noteApex(p, a);
  for (const s of [110, 112, 108]) noteSpeed(p, s);
  for (const d of [0.08, 0.09, 0.11]) noteRestartDelay(p, d);
  for (const l of [30, 32, 28]) noteJumpLead(p, l);
  noteHesitation(p, false);
  noteHesitation(p, false);
  noteRoute(p, 'high');
  noteRoute(p, 'high');
  for (let i = 0; i < 41; i++) noteAttempt(p);
  return p;
}

test('報告只講量得出來的事，不出現捏造的統計', () => {
  const report = buildReport(fullProfile()).join('\n');
  // 我們沒有母體資料，所以任何百分位、任何「跟別人比」都是唬爛
  const banned = ['%', '百分', '比別人', '平均玩家', '大多數人', '排名'];
  for (const word of banned) {
    assert.ok(!report.includes(word), `報告裡出現了沒有根據的說法：「${word}」\n${report}`);
  }
});

test('報告涵蓋每一個有樣本的指標', () => {
  const lines = buildReport(fullProfile());
  const text = lines.join('\n');
  assert.ok(text.includes('19'), '落點');
  assert.ok(/50|51|49/.test(text), '跳躍高度');
  assert.ok(/110|112|108/.test(text), '速度');
  assert.ok(text.includes('0.09'), '重生延遲');
  assert.ok(text.includes('30'), '起跳提前量');
  assert.ok(text.includes('41'), '重來次數');
});

test('樣本不足的指標整行不出現，寧可報告短一點', () => {
  const empty = buildReport(createProfile());
  assert.equal(empty.length, 1, `沒有任何樣本時只該有結尾那一行，實際：${JSON.stringify(empty)}`);
  assert.ok(empty[0].includes('0'));
});

test('報告的每一行都是非空字串', () => {
  for (const line of buildReport(fullProfile())) {
    assert.equal(typeof line, 'string');
    assert.ok(line.trim().length > 0);
  }
});

test('同一份側寫永遠產出同一份報告——沒有隨機', () => {
  const a = buildReport(fullProfile());
  const b = buildReport(fullProfile());
  assert.deepEqual(a, b);
});

test('全部跑完之後 session 帶著報告', () => {
  const solo = createSession([LEVELS[0]]);
  forceWin(solo);
  run(solo, CLEAR_HOLD + 0.3);
  assert.equal(solo.phase, 'finished');
  assert.ok(Array.isArray(solo.report) && solo.report.length >= 1);
});

test('第 10 關會在轉場時當面宣布「已停止分析」', () => {
  const lv10 = LEVELS.find((l) => l.id === 10);
  assert.equal(typeof lv10.announce, 'string');

  // 從第 9 關過關，轉場時唸的應該是第 10 關的宣告，而不是側寫結果
  const s = createSession(LEVELS);
  s.index = 8;
  s.world = createSession([LEVELS[8]]).world;
  forceWin(s);
  run(s, CLEAR_HOLD + 0.1);
  assert.equal(s.phase, 'transition');
  assert.equal(s.analysis, lv10.announce);
});

test('第 10 關說它不再適應，它就真的不再適應', () => {
  const lv = LEVELS.find((l) => l.id === 10);
  const wild = {
    ...createProfile(),
    lastLandTile: 27, landings: [27, 27],
    lastApex: 99, apexes: [99, 99],
    lastSpeed: 0, speeds: [0, 0],
    lastRestartDelay: 9, restartDelays: [9, 9],
    lastJumpLead: 90, jumpLeads: [90, 90],
  };
  assert.deepEqual(lv.adapt(lv.tiles, wild).tiles, lv.tiles.slice(),
    '它宣布停止分析，那句話必須是真的');
});
