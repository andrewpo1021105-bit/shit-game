import test from 'node:test';
import assert from 'node:assert/strict';
import { isSolid, collides, moveAndCollide, onGround } from '../src/game/physics.js';

// 10 格寬、5 格高的小地圖，最底下一排是地板
const MAP = [
  '..........',
  '..........',
  '..........',
  '.....#....',
  '##########',
];

test('超出邊界視為實心，玩家不會飛出地圖', () => {
  assert.equal(isSolid(MAP, -1, 0), true);
  assert.equal(isSolid(MAP, 0, -1), true);
  assert.equal(isSolid(MAP, 10, 0), true);
  assert.equal(isSolid(MAP, 0, 0), false);
  assert.equal(isSolid(MAP, 5, 3), true);
});

test('碰撞箱重疊實心格時回報碰撞', () => {
  assert.equal(collides(MAP, { x: 0, y: 0, w: 10, h: 14 }), false);
  assert.equal(collides(MAP, { x: 80, y: 40, w: 10, h: 14 }), true);
});

test('往下移動會停在地板上，不會穿透', () => {
  // 地板在第 4 列，頂端 y = 64。玩家高 14，應停在 y = 50
  const r = moveAndCollide(MAP, { x: 16, y: 48, w: 10, h: 14 }, 0, 10);
  assert.equal(r.y, 50);
  assert.equal(r.hitY, 1);
});

test('往右撞牆會停在牆邊', () => {
  // 牆在第 5 行，左緣 x = 80。玩家寬 10，應停在 x = 70
  const r = moveAndCollide(MAP, { x: 64, y: 48, w: 10, h: 14 }, 12, 0);
  assert.equal(r.x, 70);
  assert.equal(r.hitX, 1);
});

test('往左撞牆會停在牆右緣', () => {
  // 牆右緣 x = 96
  const r = moveAndCollide(MAP, { x: 100, y: 48, w: 10, h: 14 }, -12, 0);
  assert.equal(r.x, 96);
  assert.equal(r.hitX, -1);
});

test('沒撞到東西時原樣移動', () => {
  const r = moveAndCollide(MAP, { x: 16, y: 0, w: 10, h: 14 }, 3, 4);
  assert.equal(r.x, 19);
  assert.equal(r.y, 4);
  assert.equal(r.hitX, 0);
  assert.equal(r.hitY, 0);
});

test('同時撞到牆與地板時兩軸都要解算', () => {
  const r = moveAndCollide(MAP, { x: 64, y: 48, w: 10, h: 14 }, 12, 10);
  assert.equal(r.x, 70);
  assert.equal(r.y, 50);
});

test('onGround 只在腳下一像素有實心時為真', () => {
  assert.equal(onGround(MAP, { x: 16, y: 50, w: 10, h: 14 }), true);
  assert.equal(onGround(MAP, { x: 16, y: 20, w: 10, h: 14 }), false);
});

test('腳下的地板被挖掉後 onGround 立刻變假', () => {
  // 洞挖在第 7 行（避開第 5 行那面牆），玩家正站在洞的正上方
  const holed = MAP.slice();
  holed[4] = '#######.##';
  assert.equal(onGround(holed, { x: 114, y: 50, w: 10, h: 14 }), false);
});
