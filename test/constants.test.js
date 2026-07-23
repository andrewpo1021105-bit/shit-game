import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/game/constants.js';

test('地圖與畫面尺寸互相吻合', () => {
  assert.equal(C.TILE, 16);
  assert.equal(C.MAP_W * C.TILE, C.VIEW_W);
  assert.equal(C.MAP_H * C.TILE, C.VIEW_H);
});

test('下墜重力比上升重力重，跳躍才不會飄', () => {
  assert.ok(C.GRAVITY_DOWN > C.GRAVITY_UP);
});

test('玩家碰撞箱小於一格寬，才鑽得進單格縫隙', () => {
  assert.ok(C.PLAYER_W < C.TILE);
});
