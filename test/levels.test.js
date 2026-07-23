import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { MAP_W, MAP_H } from '../src/game/constants.js';
import { isSolid } from '../src/game/physics.js';

test('每關的地圖尺寸都正確', () => {
  for (const lv of LEVELS) {
    assert.equal(lv.tiles.length, MAP_H, `第 ${lv.id} 關列數錯誤`);
    for (const row of lv.tiles) assert.equal(row.length, MAP_W, `第 ${lv.id} 關行數錯誤`);
  }
});

test('出生點與門都不在牆裡', () => {
  for (const lv of LEVELS) {
    assert.equal(isSolid(lv.tiles, lv.spawn[0], lv.spawn[1]), false, `第 ${lv.id} 關出生點卡在牆裡`);
    assert.equal(isSolid(lv.tiles, lv.door[0], lv.door[1]), false, `第 ${lv.id} 關門卡在牆裡`);
  }
});

test('出生點腳下有地板，玩家不會一出生就掉下去', () => {
  for (const lv of LEVELS) {
    assert.equal(isSolid(lv.tiles, lv.spawn[0], lv.spawn[1] + 1), true, `第 ${lv.id} 關出生點懸空`);
  }
});

test('陷阱座標都在地圖範圍內', () => {
  for (const lv of LEVELS) {
    for (const trap of lv.traps) {
      for (const a of trap.do) {
        if (a.w === undefined) continue;
        assert.ok(a.x >= 0 && a.x + a.w <= MAP_W, `第 ${lv.id} 關動作超出左右邊界`);
        assert.ok(a.y >= 0 && a.y + a.h <= MAP_H, `第 ${lv.id} 關動作超出上下邊界`);
      }
    }
  }
});

test('第 1 關在陷阱不觸發的前提下是一條直路', () => {
  const lv = LEVELS[0];
  const row = lv.spawn[1] + 1;
  for (let x = lv.spawn[0]; x <= lv.door[0]; x++) {
    assert.equal(isSolid(lv.tiles, x, row), true, `x=${x} 的地板破了，第 1 關不該一開始就有洞`);
  }
});
