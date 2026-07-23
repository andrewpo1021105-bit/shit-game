import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { createProfile } from '../src/game/profile.js';
import { MAP_W, MAP_H } from '../src/game/constants.js';
import { isSolid, isDeadly } from '../src/game/physics.js';

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

// 玩家全速滯空約 0.67 秒 × 112 px/s ≈ 4.7 格，留一格安全邊際
const MAX_JUMPABLE_GAP = 4;

// 掃出某一列裡最長的連續片段（ch 為要找的字元）
function longestRun(row, ch) {
  let worst = 0, run = 0;
  for (const c of row) {
    run = c === ch ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  return worst;
}

// 造出一份把所有指標都推到極端的側寫
function extremeProfile(v) {
  return {
    attempts: 99,
    lastLandTile: v,
    landings: [v, v],
    lastApex: v,
    apexes: [v, v],
    lastSpeed: v,
    speeds: [v, v],
    lastRestartDelay: v,
    restartDelays: [v, v],
    lastRoute: v > 0 ? 'high' : 'low',
    routes: ['high', 'low'],
  };
}

// 鐵則 4：反制永遠有效。adapt() 在任何側寫輸入下都不能生出走不完的關卡。
test('adapt 在任意側寫輸入下產生的地形都可通關', () => {
  const values = [-99, -1, 0, 1, 7, 12, 16, 20, 28, 29, 30, 999];
  const profiles = [createProfile(), ...values.map(extremeProfile)];
  for (const lv of LEVELS) {
    if (!lv.adapt) continue;
    for (const profile of profiles) {
      const { tiles } = lv.adapt(lv.tiles, profile);
      const where = `第 ${lv.id} 關 profile=${profile.lastLandTile}`;

      assert.equal(tiles.length, MAP_H, `${where}：列數跑掉`);
      for (const row of tiles) assert.equal(row.length, MAP_W, `${where}：行數跑掉`);

      assert.equal(isSolid(tiles, lv.spawn[0], lv.spawn[1]), false, `${where}：出生點卡在牆裡`);
      assert.equal(isSolid(tiles, lv.spawn[0], lv.spawn[1] + 1), true, `${where}：出生點懸空`);

      assert.equal(isSolid(tiles, lv.door[0], lv.door[1]), false, `${where}：門卡在牆裡`);
      assert.equal(isSolid(tiles, lv.door[0], lv.door[1] + 2), true, `${where}：門下面沒有地板`);

      const floor = tiles[lv.spawn[1] + 1];

      const gap = longestRun(floor, '.');
      assert.ok(gap <= MAX_JUMPABLE_GAP, `${where}：出現 ${gap} 格寬的洞，跳不過去`);

      // 一整排刺跟一個大洞一樣是死路——除非關卡明講這排刺會自己收起來
      if (!lv.spikesRetract) {
        const spikes = longestRun(floor, '^');
        assert.ok(spikes <= MAX_JUMPABLE_GAP, `${where}：出現 ${spikes} 格寬的刺，跳不過去`);
      }

      // 出生點與門的周圍不可以是刺——否則一重生就死，成了無限死亡迴圈
      for (const [x, y] of [[lv.spawn[0], lv.spawn[1] + 1], [lv.door[0], lv.door[1] + 2]]) {
        assert.equal(isDeadly(tiles, x, y), false, `${where}：(${x},${y}) 是刺，玩家沒有安全立足點`);
      }
    }
  }
});

test('第 7 關永遠只封一條路，另一條必定是通的', () => {
  const lv = LEVELS.find((l) => l.id === 7);
  const low = lv.adapt(lv.tiles, { ...createProfile(), lastRoute: 'low' });
  assert.equal(isSolid(low.tiles, 16, 13), true, '下路應該被牆塞死');
  assert.equal(isDeadly(low.tiles, 14, 10), false, '上路必須還能走');

  const high = lv.adapt(lv.tiles, { ...createProfile(), lastRoute: 'high' });
  assert.equal(isDeadly(high.tiles, 14, 10), true, '上路應該鋪上刺');
  assert.equal(isSolid(high.tiles, 16, 13), false, '下路必須還能走');
});

test('第 5 關的刺一定留得下三秒後的活路', () => {
  const lv = LEVELS.find((l) => l.id === 5);
  for (const delay of [0, 0.1, 1, 5, 99]) {
    const { tiles } = lv.adapt(lv.tiles, { ...createProfile(), restartDelays: [delay, delay] });
    // 刺陣結束後到門之間必須有連續的落腳處
    for (let x = 13; x <= 25; x++) {
      assert.equal(isDeadly(tiles, x, 14), false, `delay=${delay} 時第 ${x} 格不該有刺`);
    }
  }
});

test('第 2 關的洞會搬到你上次的落點', () => {
  const lv = LEVELS[1];
  const { tiles, taunt } = lv.adapt(lv.tiles, { lastLandTile: 17, attempts: 1, landings: [17] });
  assert.equal(isSolid(tiles, 17, 14), false, '你上次站的那一格應該變成洞');
  assert.ok(taunt.includes('17'), `應該當面講出它學到什麼，實際：${taunt}`);
});

test('第 2 關第一條命還沒有側寫，洞在預設位置且不出聲', () => {
  const lv = LEVELS[1];
  const { tiles, taunt } = lv.adapt(lv.tiles, { lastLandTile: null, attempts: 0, landings: [] });
  assert.equal(isSolid(tiles, 12, 14), false);
  assert.equal(taunt, null, '第一次不該有話說——它還沒學到東西');
});

test('第 1 關在陷阱不觸發的前提下是一條直路', () => {
  const lv = LEVELS[0];
  const row = lv.spawn[1] + 1;
  for (let x = lv.spawn[0]; x <= lv.door[0]; x++) {
    assert.equal(isSolid(lv.tiles, x, row), true, `x=${x} 的地板破了，第 1 關不該一開始就有洞`);
  }
});
