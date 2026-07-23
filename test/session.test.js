import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, updateSession, restartLevel,
  CLEAR_HOLD, REVEAL_AT, TRANSITION_TIME,
} from '../src/game/session.js';
import { LEVELS } from '../src/game/levels/index.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

const NONE = { left: false, right: false, jump: false };

function run(s, seconds, input = NONE) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateSession(s, input, PHYSICS_DT);
}

// 直接把玩家塞到門上，省去真的走完一關。
// 門會在判定過關前一瞬間閃開，所以要追著它的現在位置多塞幾次。
function forceWin(s) {
  for (let i = 0; i < 6 && s.world.phase !== 'won'; i++) {
    s.world.player.x = s.world.door.x * TILE + 4;
    s.world.player.y = s.world.door.y * TILE + 2;
    updateSession(s, NONE, PHYSICS_DT);
  }
  assert.equal(s.world.phase, 'won', '追著門塞了幾次還是沒過關');
}

test('一開始在第 1 關', () => {
  const s = createSession(LEVELS);
  assert.equal(s.index, 0);
  assert.equal(s.world.level.id, 1);
  assert.equal(s.phase, 'play');
});

test('過關後先讓 CLEAR! 停留，時間到才開始轉場', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  run(s, CLEAR_HOLD - 0.2);
  assert.equal(s.phase, 'play', 'CLEAR! 還沒停夠就不該轉場');
  run(s, 0.4);
  assert.equal(s.phase, 'transition');
});

test('有樣本時轉場會講出它學到什麼', () => {
  const s = createSession(LEVELS);
  s.profile.landings.push(16, 16);
  s.profile.lastLandTile = 16;
  forceWin(s);
  run(s, CLEAR_HOLD + 0.1);
  assert.ok(s.analysis && s.analysis.includes('16'), `應該講出落點，實際：${s.analysis}`);
});

test('樣本不足時轉場保持沉默', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  run(s, CLEAR_HOLD + 0.1);
  assert.equal(s.analysis, null, '沒根據就不要開口');
});

test('黑幕蓋滿之前不換關，蓋滿之後才換', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  run(s, CLEAR_HOLD + 0.1);
  run(s, REVEAL_AT - 0.2);
  assert.equal(s.world.level.id, 1, '黑幕還沒蓋滿就換關會被看到');
  run(s, 0.4);
  assert.equal(s.world.level.id, 2, '黑幕蓋滿後應該已經換成第 2 關');
});

test('轉場結束後回到可操作狀態', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  run(s, CLEAR_HOLD + TRANSITION_TIME + 0.2);
  assert.equal(s.phase, 'play');
  assert.equal(s.index, 1);
});

test('跨關時側寫會延續，第 2 關才學得到第 1 關的習慣', () => {
  const s = createSession(LEVELS);
  const profile = s.profile;
  profile.landings.push(16);
  profile.lastLandTile = 16;
  forceWin(s);
  run(s, CLEAR_HOLD + TRANSITION_TIME + 0.2);
  assert.equal(s.world.profile, profile, '第 2 關必須拿到同一份側寫');
  assert.equal(s.world.map[14][16], '.', '第 2 關的洞應該已經對準第 1 關的落點');
});

test('跨關時死亡數會累計到總數', () => {
  const s = createSession(LEVELS);
  s.world.deaths = 5;
  forceWin(s);
  run(s, CLEAR_HOLD + TRANSITION_TIME + 0.2);
  assert.equal(s.totalDeaths, 5);
});

test('最後一關過關後進入全破狀態，不會試圖載入不存在的關卡', () => {
  const s = createSession([LEVELS[0]]);
  forceWin(s);
  run(s, CLEAR_HOLD + 0.2);
  assert.equal(s.phase, 'finished');
  assert.equal(s.index, 0);
});

test('轉場與全破期間不會殘留舊事件，音效才不會每幀重播', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  assert.ok(s.world.events.includes('win'));
  run(s, CLEAR_HOLD + 0.1);
  assert.equal(s.phase, 'transition');
  assert.deepEqual(s.world.events, [], '轉場中不該還留著 win 事件');

  const solo = createSession([LEVELS[0]]);
  forceWin(solo);
  run(solo, CLEAR_HOLD + 0.3);
  assert.equal(solo.phase, 'finished');
  assert.deepEqual(solo.world.events, [], '全破後不該還留著 win 事件');
});

test('轉場途中按 R 不會有事', () => {
  const s = createSession(LEVELS);
  forceWin(s);
  run(s, CLEAR_HOLD + 0.1);
  restartLevel(s);
  assert.equal(s.phase, 'transition', '轉場中重來應該被忽略');
});

test('遊玩中按 R 會重來本關但保留死亡數', () => {
  const s = createSession(LEVELS);
  s.world.deaths = 3;
  s.world.player.x = 200;
  restartLevel(s);
  assert.equal(s.world.deaths, 3);
  assert.ok(Math.abs(s.world.player.x - (LEVELS[0].spawn[0] * TILE + 3)) < 1);
});
