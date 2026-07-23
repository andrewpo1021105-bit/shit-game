import { MAP_W } from '../constants.js';

const GAP_W = 3;          // 洞永遠三格寬，玩家全速助跑跳得過
const GAP_MIN = 8;        // 不能太靠近出生點，玩家要有助跑空間
const GAP_MAX = 20;       // 不能擋住門前的落腳處
const GAP_DEFAULT = 12;   // 還沒有側寫時（第一條命）的位置

// 把洞挖在 [start, start+GAP_W) 這幾格
function digGap(tiles, start) {
  const out = tiles.slice();
  for (let y = 14; y <= 16; y++) {
    const row = out[y].split('');
    for (let x = start; x < start + GAP_W; x++) {
      if (x >= 0 && x < MAP_W) row[x] = '.';
    }
    out[y] = row.join('');
  }
  return out;
}

export default {
  id: 2,
  name: '你這樣跳幾次了',

  // 基礎地形是一條完整的走廊。洞完全由 adapt() 挖出來，
  // 所以「洞在哪」永遠是側寫的函數，而不是寫死的。
  tiles: [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
    '##############################',
    '##############################',
  ],
  spawn: [3, 13],
  door: [24, 12],
  traps: [],

  // 洞移到你上次的落點。你跳幾次它移幾次。
  // 反制永遠有效：它預測的是「你會重複上一次」，任何刻意的改變都打得破。
  adapt(tiles, profile) {
    if (profile.lastLandTile === null) {
      return { tiles: digGap(tiles, GAP_DEFAULT), taunt: null };
    }
    // 洞中心對準上次落點
    const raw = profile.lastLandTile - Math.floor(GAP_W / 2);
    const start = Math.min(GAP_MAX, Math.max(GAP_MIN, raw));
    const taunt = start === raw
      ? `你上次落在第 ${profile.lastLandTile} 格。洞搬過去了。`
      : `你上次落在第 ${profile.lastLandTile} 格。洞搬到搬得到的最近位置。`;
    return { tiles: digGap(tiles, start), taunt };
  },
};
