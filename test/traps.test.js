import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrapState, checkTriggers, applyAction } from '../src/game/traps.js';
import { TILE } from '../src/game/constants.js';

const LEVEL = {
  traps: [
    { when: { t: 'crossX', x: 5 }, do: [{ t: 'removeTiles', x: 6, y: 4, w: 2, h: 1 }], once: true },
  ],
};

function ctx(over = {}) {
  return { px: 0, py: 0, prevX: 0, prevY: 0, time: 0, deaths: 0, jumps: 0, idle: 0, atDoor: false, ...over };
}

test('crossX 在越線的那一幀觸發', () => {
  const s = createTrapState(LEVEL.traps);
  const before = checkTriggers(LEVEL.traps, s, ctx({ prevX: 4 * TILE, px: 4.5 * TILE }));
  assert.equal(before.length, 0);
  const on = checkTriggers(LEVEL.traps, s, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  assert.equal(on.length, 1);
  assert.deepEqual(on[0], { t: 'removeTiles', x: 6, y: 4, w: 2, h: 1 });
});

test('once 的陷阱不會觸發第二次', () => {
  const s = createTrapState(LEVEL.traps);
  checkTriggers(LEVEL.traps, s, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  const again = checkTriggers(LEVEL.traps, s, ctx({ prevX: 5.2 * TILE, px: 6 * TILE }));
  assert.equal(again.length, 0);
});

test('往回走不會觸發 crossX', () => {
  const s = createTrapState(LEVEL.traps);
  const out = checkTriggers(LEVEL.traps, s, ctx({ prevX: 6 * TILE, px: 4 * TILE }));
  assert.equal(out.length, 0);
});

test('重生時重建狀態，陷阱可以再次觸發', () => {
  const s1 = createTrapState(LEVEL.traps);
  checkTriggers(LEVEL.traps, s1, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  const s2 = createTrapState(LEVEL.traps);
  const out = checkTriggers(LEVEL.traps, s2, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  assert.equal(out.length, 1);
});

test('afterDelay 在時間到之後觸發', () => {
  const lv = { traps: [{ when: { t: 'afterDelay', s: 1.5 }, do: [{ t: 'removeTiles', x: 0, y: 0, w: 1, h: 1 }], once: true }] };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ time: 1.4 })).length, 0);
  assert.equal(checkTriggers(lv.traps, s, ctx({ time: 1.6 })).length, 1);
});

test('deathCount 只在死夠次數後觸發', () => {
  const lv = { traps: [{ when: { t: 'deathCount', n: 3 }, do: [{ t: 'moveDoor', x: 1, y: 1 }], once: true }] };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ deaths: 2 })).length, 0);
  assert.equal(checkTriggers(lv.traps, s, ctx({ deaths: 3 })).length, 1);
});

test('enterRect 在玩家進入區域時觸發', () => {
  const lv = { traps: [{ when: { t: 'enterRect', x: 2, y: 2, w: 3, h: 3 }, do: [{ t: 'addTiles', x: 0, y: 0, w: 1, h: 1 }], once: true }] };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ px: 1 * TILE, py: 3 * TILE })).length, 0);
  assert.equal(checkTriggers(lv.traps, s, ctx({ px: 3 * TILE, py: 3 * TILE })).length, 1);
});

test('idleFor 在站著不動夠久之後觸發', () => {
  const lv = { traps: [{ when: { t: 'idleFor', s: 1.2 }, do: [{ t: 'crumbleFromLeft', y: 14 }] }] };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 1.0 })).length, 0);
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 1.3 })).length, 1);
});

test('every 讓陷阱按固定間隔重複觸發', () => {
  const lv = {
    traps: [{ when: { t: 'idleFor', s: 1 }, do: [{ t: 'crumbleFromLeft', y: 14 }], every: 0.4 }],
  };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 2, time: 1.0 })).length, 1, '第一次應該觸發');
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 2, time: 1.2 })).length, 0, '冷卻中不該再觸發');
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 2, time: 1.5 })).length, 1, '冷卻完應該再觸發');
});

test('條件不成立時 every 也不會觸發', () => {
  const lv = {
    traps: [{ when: { t: 'idleFor', s: 1 }, do: [{ t: 'crumbleFromLeft', y: 14 }], every: 0.4 }],
  };
  const s = createTrapState(lv.traps);
  assert.equal(checkTriggers(lv.traps, s, ctx({ idle: 0, time: 5 })).length, 0);
});

test('crumbleFromLeft 每次吃掉最左邊還活著的一整column', () => {
  const world = { map: ['#####', '#####'], door: { x: 0, y: 0 } };
  applyAction(world, { t: 'crumbleFromLeft', y: 0 });
  assert.deepEqual(world.map, ['#.###', '#.###'], '牆壁那格要跳過，吃第 1 格');
  applyAction(world, { t: 'crumbleFromLeft', y: 0 });
  assert.deepEqual(world.map, ['#..##', '#..##']);
});

test('noteRoute 依玩家高度判斷走的是上路還是下路', () => {
  const high = { map: ['....'], door: { x: 0, y: 0 }, profile: { routes: [], lastRoute: null }, player: { y: 4 * TILE, h: 14 } };
  applyAction(high, { t: 'noteRoute', y: 8 });
  assert.equal(high.profile.lastRoute, 'high');

  const low = { map: ['....'], door: { x: 0, y: 0 }, profile: { routes: [], lastRoute: null }, player: { y: 12 * TILE, h: 14 } };
  applyAction(low, { t: 'noteRoute', y: 8 });
  assert.equal(low.profile.lastRoute, 'low');
});

test('未知的觸發器型別會直接爆掉，不會靜靜失效', () => {
  const lv = { traps: [{ when: { t: '打錯字' }, do: [], once: true }] };
  const s = createTrapState(lv.traps);
  assert.throws(() => checkTriggers(lv.traps, s, ctx()), /未知的觸發器型別/);
});

test('removeTiles 把地板挖成空氣', () => {
  const world = { map: ['####', '####'], door: { x: 0, y: 0 } };
  applyAction(world, { t: 'removeTiles', x: 1, y: 1, w: 2, h: 1 });
  assert.deepEqual(world.map, ['####', '#..#']);
});

test('addTiles 把空氣填成實心', () => {
  const world = { map: ['....', '....'], door: { x: 0, y: 0 } };
  applyAction(world, { t: 'addTiles', x: 0, y: 1, w: 3, h: 1 });
  assert.deepEqual(world.map, ['....', '###.']);
});

// 邊界改成看實際地圖尺寸(BOSS 關 90 格寬),所以測試地圖要用真實大小
const STD_MAP = Array(17).fill('..............................');

test('moveDoor 位移門的位置', () => {
  const world = { map: STD_MAP.slice(), door: { x: 5, y: 5 } };
  applyAction(world, { t: 'moveDoor', x: 2, y: -1 });
  assert.deepEqual(world.door, { x: 7, y: 4 });
});

test('門逃到底就停在牆邊，不會跑出地圖', () => {
  const world = { map: STD_MAP.slice(), door: { x: 26, y: 5 } };
  applyAction(world, { t: 'moveDoor', x: 10, y: 0 });
  assert.equal(world.door.x, 27, '門是兩格寬，最右只能到第 27 格');
});

test('BOSS 關的寬地圖,門可以逃得更遠', () => {
  const world = { map: Array(17).fill('.'.repeat(90)), door: { x: 80, y: 5 } };
  applyAction(world, { t: 'moveDoor', x: 20, y: 0 });
  assert.equal(world.door.x, 87, '90 格寬的地圖,門最右到第 87 格');
});

test('門搬走後原地塌成洞', () => {
  const floor = '##############################';
  const world = { map: [...Array(14).fill('..............................'), floor, floor, floor], door: { x: 10, y: 12 } };
  applyAction(world, { t: 'moveDoor', x: 4, y: 0, leaveHole: true });
  assert.equal(world.door.x, 14);
  assert.equal(world.map[14][10], '.', '門原本站的地方應該塌了');
  assert.equal(world.map[14][11], '.');
  assert.equal(world.map[16][10], '.', '要塌到底，不是只塌一層');
  assert.equal(world.map[14][14], '#', '門新位置的落腳處不能挖');
  assert.equal(world.map[14][15], '#');
});

test('門只挪一格時，不會把自己的新落腳處挖掉', () => {
  const floor = '##############################';
  const world = { map: [...Array(14).fill('..............................'), floor, floor, floor], door: { x: 10, y: 12 } };
  applyAction(world, { t: 'moveDoor', x: 1, y: 0, leaveHole: true });
  assert.equal(world.map[14][10], '.', '空出來的那一格塌掉');
  assert.equal(world.map[14][11], '#', '門還站在這格上，不能塌');
  assert.equal(world.map[14][12], '#');
});

test('門往上跳走時，它原本站的整塊地板都會塌', () => {
  const floor = '##############################';
  const world = { map: [...Array(14).fill('..............................'), floor, floor, floor], door: { x: 10, y: 12 } };
  applyAction(world, { t: 'moveDoor', x: 0, y: -2, leaveHole: true });
  assert.equal(world.door.y, 10);
  assert.equal(world.map[14][10], '.');
  assert.equal(world.map[14][11], '.');
});

test('revealFake 把假的變成真的，而且不碰空氣', () => {
  const world = { map: ['.,/#'] };
  applyAction(world, { t: 'revealFake', x: 0, y: 0, w: 4, h: 1 });
  assert.equal(world.map[0], '.#^#', '假地板要變實心、假刺要變真刺、空氣不動');
});

test('fakeTiles 把真的變成假的，而且不碰空氣與倒刺', () => {
  const world = { map: ['.#^v'] };
  applyAction(world, { t: 'fakeTiles', x: 0, y: 0, w: 4, h: 1 });
  assert.equal(world.map[0], '.,/v', '倒刺不在對照表裡，維持原樣');
});

test('revealFake 超出地圖範圍不會爆炸', () => {
  const world = { map: [',,'] };
  applyAction(world, { t: 'revealFake', x: -2, y: -2, w: 9, h: 9 });
  assert.equal(world.map[0], '##');
});
