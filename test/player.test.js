import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/game/player.js';
import { PHYSICS_DT, MAX_SPEED, TILE } from '../src/game/constants.js';

const FLAT = [
  '..........',
  '..........',
  '..........',
  '..........',
  '##########',
];
// 平台只到第 2 格，右邊是深不見底的空洞（下方留足夠空間才不會掉一下就撞到地圖底）
const LEDGE = [
  '..........',
  '..........',
  '..........',
  '..........',
  '###.......',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
];
const NONE = { left: false, right: false, jump: false };
const RIGHT = { left: false, right: true, jump: false };
const JUMP = { left: false, right: false, jump: true };

function step(p, map, input, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updatePlayer(p, map, input, PHYSICS_DT);
}

test('出生時落在指定格上並貼著地板', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.5);
  assert.equal(p.grounded, true);
  assert.equal(p.y + p.h, 4 * TILE);
});

test('站著不動時 y 不會每幀微幅抖動', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.3);
  const y = p.y;
  for (let i = 0; i < 240; i++) {
    updatePlayer(p, FLAT, NONE, PHYSICS_DT);
    assert.equal(p.y, y, `第 ${i} 幀 y 從 ${y} 變成 ${p.y}`);
  }
});

test('走路時不會上下晃', () => {
  const p = createPlayer(1, 3);
  step(p, FLAT, NONE, 0.3);
  const y = p.y;
  for (let i = 0; i < 200; i++) {
    updatePlayer(p, FLAT, RIGHT, PHYSICS_DT);
    assert.equal(p.y, y, `第 ${i} 幀 y 從 ${y} 變成 ${p.y}`);
  }
});

test('按右鍵會加速到最高速並封頂', () => {
  const p = createPlayer(1, 3);
  step(p, FLAT, RIGHT, 0.5);
  assert.ok(Math.abs(p.vx - MAX_SPEED) < 1);
});

test('放開方向鍵會煞停', () => {
  const p = createPlayer(1, 3);
  step(p, FLAT, RIGHT, 0.3);
  step(p, FLAT, NONE, 0.2);
  assert.equal(p.vx, 0);
});

test('在地面按跳會離地', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  const y0 = p.y;
  step(p, FLAT, JUMP, 0.2);
  assert.ok(p.y < y0 - TILE, `應該跳起來，實際 y 從 ${y0} 變 ${p.y}`);
});

test('跳躍高度約 3 格', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  const y0 = p.y;
  let peak = y0;
  for (let i = 0; i < Math.round(1.0 / PHYSICS_DT); i++) {
    updatePlayer(p, FLAT, JUMP, PHYSICS_DT);
    peak = Math.min(peak, p.y);
  }
  const tiles = (y0 - peak) / TILE;
  assert.ok(tiles > 2.7 && tiles < 3.7, `跳躍高度 ${tiles} 格，應在 2.7~3.7`);
});

test('中途放開跳躍鍵會跳得比較矮', () => {
  const high = createPlayer(2, 3);
  const low = createPlayer(2, 3);
  step(high, FLAT, NONE, 0.2);
  step(low, FLAT, NONE, 0.2);
  const y0 = high.y;
  let hPeak = y0, lPeak = y0;
  for (let i = 0; i < Math.round(1.0 / PHYSICS_DT); i++) {
    updatePlayer(high, FLAT, JUMP, PHYSICS_DT);
    updatePlayer(low, FLAT, i < 10 ? JUMP : NONE, PHYSICS_DT);
    hPeak = Math.min(hPeak, high.y);
    lPeak = Math.min(lPeak, low.y);
  }
  assert.ok(lPeak > hPeak, '短按應該跳得比長按矮');
});

// 往右走到腳完全離開平台為止
function walkOffLedge(p) {
  step(p, LEDGE, NONE, 0.2);
  p.vx = MAX_SPEED;
  let t = 0;
  while (p.grounded && t < 1) {
    updatePlayer(p, LEDGE, RIGHT, PHYSICS_DT);
    t += PHYSICS_DT;
  }
  assert.equal(p.grounded, false, '應該已經走出平台邊緣');
}

test('土狼時間：離開平台邊緣 0.05 秒內仍可跳', () => {
  const p = createPlayer(2, 3);
  walkOffLedge(p);
  step(p, LEDGE, RIGHT, 0.05);
  updatePlayer(p, LEDGE, { left: false, right: true, jump: true }, PHYSICS_DT);
  assert.ok(p.vy < 0, `土狼時間內應該還能跳，vy=${p.vy}`);
});

test('土狼時間過期後不能再跳', () => {
  const p = createPlayer(2, 3);
  walkOffLedge(p);
  step(p, LEDGE, RIGHT, 0.15);          // 超過 0.10 秒的土狼時間
  updatePlayer(p, LEDGE, { left: false, right: true, jump: true }, PHYSICS_DT);
  assert.ok(p.vy > 0, `早就該過期了，應該還在往下掉，vy=${p.vy}`);
});

test('跳躍緩衝：落地前按跳，一落地就自動起跳', () => {
  const p = createPlayer(2, 0);
  step(p, FLAT, NONE, 0.15);            // 空中下墜
  assert.equal(p.grounded, false);
  step(p, FLAT, JUMP, 0.5);             // 一路按著跳
  assert.ok(p.y < 4 * TILE - p.h - TILE, '應該已經彈起來了');
});

test('按住跳躍鍵不會在空中連跳', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  step(p, FLAT, JUMP, 2.0);             // 全程按住
  assert.equal(p.grounded, true, '落地後不該因為按住而再跳');
});
