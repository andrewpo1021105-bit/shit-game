import { median } from '../profile.js';
import { TILE } from '../constants.js';

const FIELD_X0 = 10;   // 刺陣的範圍
const FIELD_X1 = 21;
const AIRTIME = 0.67;  // 滿力跳的滯空秒數
// 刺是成對的（兩格寬），每一跳都得是真的跳，不能用走的蹭過去。
// 間距下限訂在 4，成對之後才留得下兩格落腳處。
const SPIKE_PAIR = 2;
const STEP_MIN = 4;
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

  traps: [
    // 你一踏進刺陣，右邊就有一根刺橫著掃過來。
    // 於是你不能慢慢挑落腳點——得在它掃到之前把整片穿過去，或者跳過它。
    {
      when: { t: 'crossX', x: 8 },
      do: [{ t: 'sweepSpike', x: 27, y: 13, vx: -70 }],
      once: true,
    },
    // 中段再冒一根。第 16 格在兩種間距下都是落腳處，所以這一根一定踩得到。
    {
      when: { t: 'crossX', x: 14 },
      do: [{ t: 'spawnSpikes', x: 16, y: 14, w: 1, h: 1 }],
      once: true,
    },
  ],

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
    for (let x = FIELD_X0; x <= FIELD_X1; x += step) {
      for (let i = 0; i < SPIKE_PAIR && x + i <= FIELD_X1; i++) cells[x + i] = '^';
    }
    out[14] = cells.join('');

    return { tiles: out };
  },
};
