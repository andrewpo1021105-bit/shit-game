import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { createProfile } from '../src/game/profile.js';
import { applyAction } from '../src/game/traps.js';
import { MAP_W, MAP_H, TILE } from '../src/game/constants.js';
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

// 依實際物理算出「頭頂被壓到只能升 rise 像素」時，一跳能飛多遠
function jumpDistance(rise) {
  if (rise <= 0) return 0;
  const up = Math.sqrt(2 * 900 * rise) / 900;      // 上升重力 900
  const down = Math.sqrt((2 * rise) / 1620);       // 下墜重力 1620
  return (up + down) * 112;                        // 最高水平速度
}

// 掃出一列裡所有連續的「不能踩」片段，回傳 [起點, 長度]
function blockedRuns(row) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < row.length; x++) {
    const bad = row[x] === '.' || row[x] === '^';
    if (bad && start < 0) start = x;
    if (!bad && start >= 0) { runs.push([start, x - start]); start = -1; }
  }
  if (start >= 0) runs.push([start, row.length - start]);
  return runs;
}

// 這段缺口正上方最低的障礙物在第幾列（沒有就回傳 null）
function lowestCeiling(tiles, x0, x1, floorRow) {
  let lowest = null;
  for (let y = 1; y < floorRow - 1; y++) {
    for (let x = Math.max(1, x0); x <= Math.min(tiles[y].length - 2, x1); x++) {
      if (tiles[y][x] !== '.') { lowest = y; break; }
    }
  }
  return lowest;
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

// 天花板上的倒刺會壓低跳躍高度，跳低了就飛不遠。
// 這條測試把兩者一起算：每個缺口都要在「它正上方的天花板允許的高度」下跳得過。
test('每個缺口在該處天花板允許的跳躍高度下都跳得過去', () => {
  for (const lv of LEVELS) {
    const built = lv.adapt ? lv.adapt(lv.tiles, createProfile()) : { tiles: lv.tiles.slice() };
    const world = {
      map: built.tiles.slice(),
      door: { x: lv.door[0], y: lv.door[1] },
      profile: createProfile(),
      player: { y: lv.spawn[1] * TILE, h: 14 },
      hazards: [],
    };
    for (const trap of built.traps ?? lv.traps ?? []) {
      if (trap.do.some((a) => a.t === 'crumbleFromLeft')) continue;
      for (const action of trap.do) applyAction(world, action);
    }

    const floorRow = lv.spawn[1] + 1;
    const standY = lv.spawn[1] * TILE + (TILE - 14);
    for (const [start, len] of blockedRuns(world.map[floorRow])) {
      if (start === 0 || start + len >= MAP_W) continue;   // 邊界牆不算缺口
      if (lv.spikesRetract && world.map[floorRow][start] === '^') continue;

      const ceil = lowestCeiling(world.map, start - 1, start + len, floorRow);
      // 頭頂必須留在障礙物下緣以下，能升的高度就只剩這麼多
      const rise = ceil === null ? 51 : standY - (ceil + 1) * TILE;
      const reach = jumpDistance(Math.min(51, rise));
      const needed = len * TILE + 10;   // 起跳格右緣到落地格左緣

      assert.ok(reach >= needed,
        `第 ${lv.id} 關第 ${start} 格起的 ${len} 格缺口：天花板只讓你跳 ${Math.round(rise)}px，`
        + `飛得了 ${Math.round(reach)}px，但需要 ${needed}px`);
    }
  }
});

// 鐵則 5：出其不意優先於技術難度。
// 檢查方式——把陷阱全部關掉，每一關的地面都應該無聊得像教學關：
// 頂多一個小跳，沒有連續跳、沒有密集刺陣。玩家的死因必須來自被騙，不是手滑。
test('關掉陷阱之後，每一關都應該無聊到像教學關', () => {
  const MAX_HOPS = 1;         // 最多一個缺口要跳
  const MAX_HOP_WIDTH = 2;    // 而且窄到隨便跳都過得去

  for (const lv of LEVELS) {
    const tiles = lv.adapt ? lv.adapt(lv.tiles, createProfile()).tiles : lv.tiles;
    const floorRow = lv.spawn[1] + 1;

    const hops = blockedRuns(tiles[floorRow])
      .filter(([start, len]) => start !== 0 && start + len < MAP_W)
      // 會自己收起來的刺是用等的，不是用跳的，不算在跳躍次數裡
      .filter(([start]) => !(lv.spikesRetract && tiles[floorRow][start] === '^'));

    assert.ok(hops.length <= MAX_HOPS,
      `第 ${lv.id} 關光是地形就要跳 ${hops.length} 次，這是技巧考試不是整人：${tiles[floorRow]}`);
    for (const [start, len] of hops) {
      assert.ok(len <= MAX_HOP_WIDTH,
        `第 ${lv.id} 關第 ${start} 格起有 ${len} 格寬的缺口，太需要精準度了`);
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
  const { tiles } = lv.adapt(lv.tiles, { ...createProfile(), lastLandTile: 17 });
  assert.equal(isSolid(tiles, 17, 14), false, '你上次站的那一格應該變成洞');
});

test('第 2 關第一條命還沒有側寫，洞在預設位置', () => {
  const lv = LEVELS[1];
  const { tiles } = lv.adapt(lv.tiles, createProfile());
  assert.equal(isSolid(tiles, 12, 14), false);
});

test('遊戲不對玩家解釋任何事：關卡不得回傳提示文字', () => {
  for (const lv of LEVELS) {
    if (!lv.adapt) continue;
    const out = lv.adapt(lv.tiles, createProfile());
    assert.equal(out.taunt, undefined, `第 ${lv.id} 關還在吐提示文字`);
  }
});

// 命內的機關可以隨時翻臉，但翻完之後路還是要走得通
test('就算所有陷阱同時爆發，關卡仍然可通關', () => {
  for (const lv of LEVELS) {
    const built = lv.adapt ? lv.adapt(lv.tiles, createProfile()) : { tiles: lv.tiles.slice() };
    const world = {
      map: built.tiles.slice(),
      door: { x: lv.door[0], y: lv.door[1] },
      profile: createProfile(),
      player: { y: lv.spawn[1] * TILE, h: 14 },
      hazards: [],
    };
    for (const trap of built.traps ?? lv.traps ?? []) {
      // 崩塌是設計上就會無限吃地板的懲罰，不列入這項檢查
      if (trap.do.some((a) => a.t === 'crumbleFromLeft')) continue;
      for (const action of trap.do) applyAction(world, action);
    }

    const floor = world.map[lv.spawn[1] + 1];
    assert.ok(longestRun(floor, '.') <= MAX_JUMPABLE_GAP,
      `第 ${lv.id} 關陷阱全開後出現跳不過的洞：${floor}`);
    if (!lv.spikesRetract) {
      assert.ok(longestRun(floor, '^') <= MAX_JUMPABLE_GAP,
        `第 ${lv.id} 關陷阱全開後出現跳不過的刺牆：${floor}`);
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
