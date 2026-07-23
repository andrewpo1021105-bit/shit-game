import { MAP_W } from '../constants.js';

// 洞只有兩格寬——隨便跳都過得去。
// 這一關的難處不在跳，在於它每次都把洞搬到你上次落地的位置。
const GAP_W = 2;
const GAP_MIN = 10;       // 不能太靠近出生點：跳過第 6 格的刺之後還要有助跑空間
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

  // 陷阱在 adapt() 裡生成，因為位置要跟著洞走
  traps: [],

  // 洞移到你上次的落點。你跳幾次它移幾次。
  // 反制永遠有效：它預測的是「你會重複上一次」，任何刻意的改變都打得破。
  adapt(tiles, profile) {
    // 洞中心對準上次落點
    const raw = profile.lastLandTile === null
      ? GAP_DEFAULT
      : profile.lastLandTile - Math.floor(GAP_W / 2);
    const start = Math.min(GAP_MAX, Math.max(GAP_MIN, raw));

    // 剛跳過洞、腳一落地，正前方就長出一根刺。位置跟著洞走。
    const spikeX = Math.min(21, start + GAP_W + 2);

    return {
      tiles: digGap(tiles, start),
      // 走廊中間先擺一扇假門。你老遠就看到「出口」，走過去就死。
      decoys: [[17, 12]],
      traps: [
        {
          when: { t: 'crossX', x: start + GAP_W },
          do: [{ t: 'spawnSpikes', x: spikeX, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 快到門了，右邊掃來一根刺
        {
          when: { t: 'crossX', x: 21 },
          do: [{ t: 'sweepSpike', x: 28, y: 13, vx: -85 }],
          once: true,
        },
        // 門前最後一格，腳下的地板消失
        {
          when: { t: 'standOn', x: 23, y: 14 },
          do: [{ t: 'removeTiles', x: 23, y: 14, w: 1, h: 3 }],
          once: true,
        },
        // 死了三次之後，門旁邊再多一扇假門——背下來的路線從這裡開始失效
        {
          when: { t: 'deathCount', n: 3 },
          do: [{ t: 'spawnDecoy', x: 21, y: 12 }],
          once: true,
        },
      ],
    };
  },
};
