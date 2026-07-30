import test from 'node:test';
import assert from 'node:assert/strict';
import { createFight, updateFight } from '../src/game/fight.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

const NONE = { left: false, right: false, jump: false, attack: false };
const RIGHT = { ...NONE, right: true };
const ATK = { ...NONE, attack: true };

function run(f, seconds, input = NONE) {
  for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) updateFight(f, input, PHYSICS_DT);
}

test('開場:玩家在左、龍在右、雙方血條全滿', () => {
  const f = createFight();
  assert.equal(f.dragon.hp, f.dragon.maxHp);
  assert.equal(f.playerHp, f.maxPlayerHp);
  assert.ok(f.player.x < f.dragon.x);
  assert.equal(f.round, 1);
});

test('ROUND 報幕期間雙方站樁,FIGHT! 之後才能動', () => {
  const f = createFight();
  const x0 = f.player.x;
  run(f, 1.0, RIGHT);
  assert.equal(f.player.x, x0, '報幕中不准動,這是規矩');
  run(f, 1.0, RIGHT);
  assert.ok(f.player.x > x0, 'FIGHT! 之後要能動');
});

test('龍照節奏吐火球,火球朝著玩家飛', () => {
  const f = createFight();
  run(f, 3.8);   // 報幕 1.4 + rest 1.3 + aim 0.7 + 第一發(0.2)
  assert.ok(f.hazards.length >= 1, `該有火球了,實際 ${f.hazards.length}`);
  assert.equal(f.hazards[0].kind, 'fire');
  assert.ok(f.hazards[0].vx < 0, '玩家在左邊,火球該往左飛');
});

test('火球打中會扣血、進入無敵閃爍,不是秒死', () => {
  const f = createFight();
  run(f, 8);
  assert.ok(f.playerHp < f.maxPlayerHp, '站著挨火球應該扣血');
  assert.ok(f.deaths === 0 || f.playerHp === f.maxPlayerHp, '一發不該直接死');
});

test('血歸零就是屠龍失敗——單命制,沒有續關投幣', () => {
  const f = createFight();
  f.playerHp = 1;
  f.shownPlayerHp = 1;
  run(f, 10);
  assert.equal(f.deaths, 1, `剩 1 滴血挨打應該倒下,實際 deaths=${f.deaths}`);
  assert.equal(f.lost, true, '倒下就是敗北');
  run(f, 3);
  assert.equal(f.done, true, '敗北演出完要收場');
  assert.equal(f.won, false);
});

test('每第三刀放出劍氣,遠距離也砍得到龍', () => {
  const f = createFight();
  f.roundT = 2;                 // 跳過報幕
  f.dragon.state = 'tired';     // 讓牠安分一下,專心驗證劍氣
  f.dragon.t = -99;
  f.player.x = 5 * TILE;        // 站得遠遠的
  f.player.facing = 1;
  run(f, 1.2, ATK);             // 三刀:0 / 0.42 / 0.84,第三刀出劍氣
  assert.ok(f.beams.length > 0 || f.dragon.hp < f.dragon.maxHp,
    '第三刀該有劍氣在飛,或已經打中了');
  run(f, 1.5, NONE);            // 讓劍氣飛完
  assert.ok(f.dragon.hp < f.dragon.maxHp, `劍氣該打中龍,實際 hp=${f.dragon.hp}`);
});

test('揮劍砍得到龍,冷卻+打擊停頓擋得住連點', () => {
  const f = createFight();
  run(f, 1.5);              // 先讓報幕演完
  f.player.x = f.dragon.x - 20;
  f.player.facing = 1;
  const before = f.dragon.hp;
  run(f, 1.0, ATK);
  const hits = before - f.dragon.hp;
  assert.ok(hits >= 1, '貼著龍揮劍應該砍得中');
  assert.ok(hits <= 3, `冷卻 0.42 秒+打擊停頓,一秒最多 2~3 刀,實際 ${hits}`);
  assert.ok(f.combo >= 1, '連擊數要累積');
});

test('低身衝撞撞到會扣血擊退', () => {
  const f = createFight();
  f.roundT = 2;             // 跳過報幕
  f.dragon.state = 'crouch';
  f.dragon.t = 0;
  f.player.x = 12 * TILE;
  run(f, 3);
  assert.ok(f.playerHp < f.maxPlayerHp, '站在衝撞路線上應該挨打');
});

test('貼著休息中的龍磨蹭,會吃到近身尾擊', () => {
  const f = createFight();
  f.roundT = 2;
  f.player.x = f.dragon.x - 14;
  run(f, 1.4);
  assert.ok(f.playerHp < f.maxPlayerHp, '貼臉站著不動應該被尾巴教訓');
});

test('把血打完就 K.O.,倒下動畫演完 done', () => {
  const f = createFight();
  f.roundT = 2;
  f.dragon.hp = 1;
  f.dragon.shownHp = 1;
  f.player.x = f.dragon.x - 20;
  f.player.facing = 1;
  run(f, 0.5, ATK);
  assert.equal(f.won, true, '最後一刀該分出勝負');
  run(f, 3);
  assert.equal(f.done, true, '倒下動畫演完要收場');
});
