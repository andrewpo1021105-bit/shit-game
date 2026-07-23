import { median } from '../profile.js';
import { TILE } from '../constants.js';

const FIELD_X0 = 10;   // 刺陣的範圍
const FIELD_X1 = 21;
const AIRTIME = 0.67;  // 滿力跳的滯空秒數
const STEP_MIN = 2;    // 間距下限：至少要留得下落腳處
const STEP_MAX = 5;

export default {
  id: 4,
  name: '你的步伐我量過了',

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

  // 刺按「你習慣速度下的一跳距離」等距擺放，
  // 於是你每照平常跳一次，就正好落在下一根刺上。
  // 反制：改用小碎步跳過單根刺，別再照平常那樣一躍而過。
  adapt(tiles, profile) {
    const speed = median(profile.speeds);
    const step = speed === null
      ? 4
      : Math.min(STEP_MAX, Math.max(STEP_MIN, Math.round((speed * AIRTIME) / TILE)));

    const out = tiles.slice();
    const cells = out[14].split('');
    for (let x = FIELD_X0; x <= FIELD_X1; x += step) cells[x] = '^';
    out[14] = cells.join('');

    const taunt = profile.speeds.length >= 2
      ? `你習慣一跳 ${step} 格。刺就擺在每 ${step} 格。`
      : null;
    return { tiles: out, taunt };
  },
};
