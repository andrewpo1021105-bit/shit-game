import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, updateSession, restartLevel, jumpLevel,
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

test('假通關不會讓 session 進轉場', () => {
  const level = {
    id: 98, name: '假過關',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12],
    decoys: [[20, 8]],
    traps: [{ when: { t: 'crossX', x: 8 }, do: [{ t: 'fakeWin', s: 1.2 }], once: true }],
  };
  const session = createSession([level, { ...level, id: 97 }]);
  for (let i = 0; i < Math.round(1.5 / PHYSICS_DT); i++) {
    updateSession(session, { left: false, right: true, jump: false }, PHYSICS_DT);
  }
  assert.equal(session.world.phase, 'faking');
  assert.equal(session.phase, 'play', 'session 只認真的通關');
  assert.equal(session.index, 0, '不能因為演出就換關');
});

test('遊玩時間只在操作中累計,轉場與結算不算', () => {
  const level = {
    id: 96, name: '計時',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12], traps: [],
  };
  const session = createSession([level, { ...level, id: 95 }]);
  assert.equal(session.totalTime, 0);
  // 走 1 秒
  for (let i = 0; i < Math.round(1 / PHYSICS_DT); i++) {
    updateSession(session, { left: false, right: true, jump: false }, PHYSICS_DT);
  }
  assert.ok(Math.abs(session.totalTime - 1) < 0.02, `應累計約 1 秒,實際 ${session.totalTime}`);
  // 手動切到轉場,時間就不該再走
  session.phase = 'transition';
  session.timer = 0;
  const t0 = session.totalTime;
  for (let i = 0; i < Math.round(0.5 / PHYSICS_DT); i++) {
    updateSession(session, { left: false, right: false, jump: false }, PHYSICS_DT);
  }
  assert.equal(session.totalTime, t0, '轉場期間計時要停');
});

test('創造者模式的跳關:前進、後退、都夾在合法範圍內', () => {
  const s = createSession(LEVELS);
  jumpLevel(s, 1);
  assert.equal(s.index, 1);
  assert.equal(s.world.level.id, LEVELS[1].id);
  assert.equal(s.phase, 'play');
  jumpLevel(s, -1);
  jumpLevel(s, -1);   // 已經在第一關,再退不該爆炸
  assert.equal(s.index, 0);
  for (let i = 0; i < 99; i++) jumpLevel(s, 1);   // 衝過頭要停在最後一關
  assert.equal(s.index, LEVELS.length - 1);
});
