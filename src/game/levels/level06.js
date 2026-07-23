import { median } from '../profile.js';

const IDLE_MIN = 0.6;    // 忍耐上限：再怎麼樣也給你 0.6 秒
const IDLE_MAX = 2.0;
const CRUMBLE_EVERY = 0.4;

export default {
  id: 6,
  name: '不要停',

  // 中間一個兩格的洞，逼你在洞前面猶豫——而猶豫正是這關要罰的事。
  // 洞的上方掛著倒刺，所以連跳過去都不能跳滿。
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
    '##############..##############',
    '##############..##############',
    '##############..##############',
  ],
  spawn: [3, 13],
  door: [24, 12],

  // 站著不動超過門檻，地板就從最左邊開始一格一格崩，往你逼近。
  // 已經崩掉的不會回來——猶豫是有代價的。
  // 這份是預設值；adapt() 會依側寫把猶豫門檻換掉
  traps: [
    {
      when: { t: 'idleFor', s: IDLE_MAX },
      do: [{ t: 'crumbleFromLeft', y: 14 }],
      every: CRUMBLE_EVERY,
    },
    {
      when: { t: 'crossX', x: 12 },
      do: [{ t: 'spawnSpikes', x: 16, y: 14, w: 1, h: 1 }],
      once: true,
    },
  ],

  // 上一關教你「等三秒」。這一關把那個習慣拿來對付你：
  // 你越習慣等，地板越等不了你。
  adapt(tiles, profile) {
    const delay = median(profile.restartDelays);
    const threshold = delay === null
      ? IDLE_MAX
      : Math.min(IDLE_MAX, Math.max(IDLE_MIN, 2.2 - delay));

    // 回傳新的陣列，不要改寫關卡本身
    return {
      tiles: tiles.slice(),
      traps: [
        {
          when: { t: 'idleFor', s: threshold },
          do: [{ t: 'crumbleFromLeft', y: 14 }],
          every: CRUMBLE_EVERY,
        },
        // 你正要起跳過洞的時候，對面的落點長出一根刺
        // 跳過洞、落地站穩的瞬間，前面長出一根刺
        {
          when: { t: 'crossX', x: 16 },
          do: [{ t: 'spawnSpikes', x: 19, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 門前最後一格，方塊砸下來
        {
          when: { t: 'standOn', x: 22, y: 14 },
          do: [{ t: 'dropBlock', x: 22, y: 6 }],
          once: true,
        },
        // 真的碰到門了——門往上跳走
        {
          when: { t: 'touchDoor' },
          do: [{ t: 'moveDoor', x: 0, y: -3, leaveHole: true }],
          once: true,
        },
      ],
    };
  },
};
