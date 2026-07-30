import test from 'node:test';
import assert from 'node:assert/strict';
import { createFight, updateFight } from '../src/game/fight.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

const NONE = { left: false, right: false, jump: false, attack: false };
const ATK = { ...NONE, attack: true };

function run(f, seconds, input = NONE) {
  for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) updateFight(f, input, PHYSICS_DT);
}

test('開場:玩家在左、龍在右、血條全滿', () => {
  const f = createFight();
  assert.equal(f.dragon.hp, f.dragon.maxHp);
  assert.ok(f.player.x < f.dragon.x);
  assert.equal(f.phase, 'play');
});

test('龍照節奏吐火球,火球朝著玩家飛', () => {
  const f = createFight();
  run(f, 2.4);   // rest 1.3 + aim 0.7 + fire 的第一發(0.2)
  assert.ok(f.hazards.length >= 1, `該有火球了,實際 ${f.hazards.length}`);
  assert.equal(f.hazards[0].kind, 'fire');
  assert.ok(f.hazards[0].vx < 0, '玩家在左邊,火球該往左飛');
});

test('站著不動會被火球打死,重生後龍的血不變', () => {
  const f = createFight();
  run(f, 6);
  assert.ok(f.deaths >= 1, `站著挨火球應該死,實際 deaths=${f.deaths}`);
  assert.equal(f.dragon.hp, f.dragon.maxHp, '玩家死不該回復龍的血');
});

test('揮劍砍得到龍,而且冷卻擋得住連點', () => {
  const f = createFight();
  // 把玩家搬到龍面前
  f.player.x = f.dragon.x - 20;
  f.player.facing = 1;
  const before = f.dragon.hp;
  run(f, 1.0, ATK);   // 按住攻擊 1 秒
  const hits = before - f.dragon.hp;
  assert.ok(hits >= 1, '貼著龍揮劍應該砍得中');
  assert.ok(hits <= 3, `冷卻 0.42 秒,一秒最多 2~3 刀,實際 ${hits}`);
});

test('低身衝撞撞到就死', () => {
  const f = createFight();
  // 直接把龍調到衝撞前置
  f.dragon.state = 'crouch';
  f.dragon.t = 0;
  f.player.x = 12 * TILE;   // 站在必經之路上
  run(f, 3);
  assert.ok(f.deaths >= 1, '站在衝撞路線上應該死');
});

test('把血打完就贏,倒下動畫演完 done', () => {
  const f = createFight();
  f.dragon.hp = 1;
  f.player.x = f.dragon.x - 20;
  f.player.facing = 1;
  run(f, 0.5, ATK);
  assert.equal(f.won, true, '最後一刀該分出勝負');
  run(f, 3);
  assert.equal(f.done, true, '倒下動畫演完要收場');
});

test('貼著休息中的龍磨蹭,會吃到近身尾擊', () => {
  const f = createFight();
  f.player.x = f.dragon.x - 14;   // 貼臉站好,不揮劍
  run(f, 1.2);
  assert.ok(f.deaths >= 1, '貼臉站著不動應該被尾巴教訓');
});
