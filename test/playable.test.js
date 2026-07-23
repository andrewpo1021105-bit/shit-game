import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { createWorld, updateWorld } from '../src/game/world.js';
import { createProfile } from '../src/game/profile.js';
import { isSolid, isDeadly } from '../src/game/physics.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

// 一個很笨的機器人：往右走、前面沒路就跳、門吊在頭上就跳。
// 它不會倒退、不會等時機、不會算落點——正因為這麼笨，它才是好的守門員：
// 只要有任何一關需要它做不到的事，那一關就違反了「難度不加在手指上」。
function needsJump(world, lookahead) {
  const p = world.player;
  const footRow = Math.floor((p.y + p.h) / TILE);
  const col = Math.floor((p.x + p.w / 2) / TILE);

  for (let d = 1; d <= lookahead; d++) {
    const x = col + d;
    if (!isSolid(world.map, x, footRow)) return true;        // 前面是洞
    if (isDeadly(world.map, x, footRow)) return true;        // 前面是刺
    if (isDeadly(world.map, x, footRow - 1)) return true;    // 前面有倒刺
  }
  if (isSolid(world.map, col + 1, footRow - 1)) return true; // 前面有牆或落下的方塊

  // 門吊在半空中而且就在附近——跳上去搆它
  return world.door.y + 2 < footRow && Math.abs(world.door.x - col) <= 2;
}

function play(level, { waitFirst, hold, lookahead }) {
  const world = createWorld(level, createProfile());
  let jumpFrames = 0;

  for (let i = 0; i < Math.round(30 / PHYSICS_DT); i++) {
    // 「等一下」要用這條命的時間，死了之後要重新等
    const idle = waitFirst && world.time < 3.6;
    if (!idle && world.phase === 'play' && world.player.grounded && needsJump(world, lookahead)) {
      jumpFrames = Math.round(hold / PHYSICS_DT);
    }
    const input = { left: false, right: !idle, jump: jumpFrames > 0 };
    if (jumpFrames > 0) jumpFrames--;

    updateWorld(world, input, PHYSICS_DT);
    if (world.phase === 'won') return true;
  }
  return false;
}

const STRATEGIES = [];
for (const waitFirst of [false, true]) {
  for (const hold of [0.35, 0.2, 0.12]) {
    for (const lookahead of [1, 2, 3]) STRATEGIES.push({ waitFirst, hold, lookahead });
  }
}

test('每一關都有一條笨方法走得完的路', () => {
  for (const lv of LEVELS) {
    const winner = STRATEGIES.find((s) => play(lv, s));
    assert.ok(winner,
      `第 ${lv.id} 關「${lv.name}」沒有任何簡單策略走得完。`
      + '要嘛它有無解的死法，要嘛它需要精準操作——兩種都不行。');
  }
});
