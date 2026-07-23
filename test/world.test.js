import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld, resetLevel } from '../src/game/world.js';
import { LEVELS } from '../src/game/levels/index.js';
import { PHYSICS_DT, TILE, RESPAWN_DELAY } from '../src/game/constants.js';

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
  const [dx, dy] = LEVELS[0].door;
  w.player.x = dx * TILE + 4;
  w.player.y = dy * TILE + 2;
  updateWorld(w, NONE, PHYSICS_DT);
  assert.equal(w.phase, 'won');
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
