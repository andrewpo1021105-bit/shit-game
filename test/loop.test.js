import test from 'node:test';
import assert from 'node:assert/strict';
import { stepAccumulator } from '../src/engine/loop.js';

test('累積不足一步時不推進', () => {
  const r = stepAccumulator(0, 0.005, 1 / 120);
  assert.equal(r.steps, 0);
  assert.ok(Math.abs(r.rest - 0.005) < 1e-9);
});

test('一幀 60fps 推進兩步 120Hz 物理', () => {
  const r = stepAccumulator(0, 1 / 60, 1 / 120);
  assert.equal(r.steps, 2);
});

test('卡頓時限制最多推進 8 步，避免死亡螺旋', () => {
  const r = stepAccumulator(0, 5, 1 / 120);
  assert.equal(r.steps, 8);
  assert.equal(r.rest, 0);
});
