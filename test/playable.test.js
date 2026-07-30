import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { createWorld, updateWorld } from '../src/game/world.js';
import { createProfile } from '../src/game/profile.js';
import { isSolid, isDeadly, tileAt } from '../src/game/physics.js';
import { PHYSICS_DT, TILE } from '../src/game/constants.js';

// 一個很笨的機器人：往右走、前面沒路就跳、門吊在頭上就跳。
// 它不會倒退、不會等時機、不會算落點——正因為這麼笨，它才是好的守門員：
// 只要有任何一關需要它做不到的事，那一關就違反了「難度不加在手指上」。
//
// 唯一的例外是左右反轉：機器人讀得到 world.flipped 並自己反過來按。
// 這是刻意的——反轉如果連「知道它反了」都救不了，那就是在考手速。
// 讓機器人察覺得到，這條測試守住的命題就變成
// 「只要你注意到反轉，零精準操作就過得去」。
// 假地板與假刺畫得跟真的一模一樣，所以機器人也必須照「畫面上的樣子」
// 判斷——否則它會自動繞過玩家根本看不出來的陷阱，這條測試就守不住玩家了。
//
// known 記的是「我親身穿過／踩進去過的那一格」。經歷過之後就改讀真相，
// 因為玩家也是這樣：假地板穿過去的那一瞬間就看見了。
// 這剛好是鐵則 4 的實作保證——每個騙局都必須「死一次就學得會」。
const key = (x, y) => `${x},${y}`;

function apparentSolid(map, tx, ty, known) {
  if (known.has(key(tx, ty))) return isSolid(map, tx, ty);
  return tileAt(map, tx, ty) !== '.';    // 畫面上除了空氣，看起來都是實體
}

function apparentDeadly(map, tx, ty, known) {
  if (known.has(key(tx, ty))) return isDeadly(map, tx, ty);
  const ch = tileAt(map, tx, ty);
  return ch === '^' || ch === 'v' || ch === '/';
}

// 腳正在穿過一格「看起來是實心／看起來是刺」但其實不是的地磚——
// 這一瞬間玩家也看得到，所以機器人當場學會。
function noticeFakes(world, known) {
  const p = world.player;
  const y = Math.floor((p.y + p.h) / TILE);
  for (let x = Math.floor(p.x / TILE); x <= Math.floor((p.x + p.w - 1) / TILE); x++) {
    const ch = tileAt(world.map, x, y);
    if (ch === ',' || ch === '/') known.add(key(x, y));
  }
}

function needsJump(world, lookahead, known) {
  const p = world.player;
  const footRow = Math.floor((p.y + p.h) / TILE);
  const col = Math.floor((p.x + p.w / 2) / TILE);

  for (let d = 1; d <= lookahead; d++) {
    const x = col + d;
    if (!apparentSolid(world.map, x, footRow, known)) return true;        // 前面看起來是洞
    if (apparentDeadly(world.map, x, footRow, known)) return true;        // 前面看起來是刺
    if (apparentDeadly(world.map, x, footRow - 1, known)) return true;    // 前面看起來有倒刺
  }
  if (apparentSolid(world.map, col + 1, footRow - 1, known)) return true; // 前面有牆或落下的方塊

  // 敵人跟橫著飛過來的東西都看得見。看得見的死亡判定,
  // 機器人就跟玩家一樣用跳的繞過去——這不是開掛,是視力。
  // 從天上砸下來的方塊不跳(kind block),那種要用走的閃。
  for (const t of [...(world.enemies ?? []), ...world.hazards]) {
    if (t.kind === 'block') continue;
    if (Math.floor((t.y + t.h) / TILE) !== footRow) continue;
    const ahead = (t.x + t.w / 2) / TILE - (p.x + p.w / 2) / TILE;
    if (ahead > 0.3 && ahead <= lookahead + 0.7) return true;
  }

  // 門吊在半空中而且就在附近——跳上去搆它
  return world.door.y + 2 < footRow && Math.abs(world.door.x - col) <= 2;
}

function play(level, { waitFirst, hold, lookahead }) {
  const world = createWorld(level, createProfile());
  let jumpFrames = 0;
  // 被騙過的格子。跨死亡保留（同一個坑不會被騙第二次），
  // 但不跨 play() 呼叫——每個策略都從零開始被騙。
  const known = new Set();

  for (let i = 0; i < Math.round(30 / PHYSICS_DT); i++) {
    noticeFakes(world, known);
    // 「等一下」要用這條命的時間，死了之後要重新等
    const idle = waitFirst && world.time < 3.6;
    if (!idle && world.phase === 'play' && world.player.grounded
        && needsJump(world, lookahead, known)) {
      jumpFrames = Math.round(hold / PHYSICS_DT);
    }
    // 它想去的方向永遠是右邊；反轉時要按的鍵才是左邊
    const goRight = !idle;
    const input = {
      left: goRight && world.flipped,
      right: goRight && !world.flipped,
      jump: jumpFrames > 0,
    };
    if (jumpFrames > 0) jumpFrames--;

    updateWorld(world, input, PHYSICS_DT);
    if (world.phase === 'won') return true;
  }
  return false;
}

// 第 9～12 關的鐵則 7 放開了，允許窄平台，策略集合跟著放寬——
// 但不是寫一個更聰明的機器人：聰明機器人守不住任何有意義的命題。
const STRATEGIES = [];
for (const waitFirst of [false, true]) {
  for (const hold of [0.45, 0.35, 0.28, 0.2, 0.15, 0.12]) {
    for (const lookahead of [1, 2, 3, 4]) STRATEGIES.push({ waitFirst, hold, lookahead });
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
