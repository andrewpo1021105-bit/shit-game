import { median } from '../profile.js';

const IDLE_MIN = 0.6;    // 忍耐上限：再怎麼樣也給你 0.6 秒
const IDLE_MAX = 2.0;
const CRUMBLE_EVERY = 0.4;

export default {
  id: 6,
  name: '不要停',

  // 中間一個三格的洞，逼你在洞前面猶豫——而猶豫正是這關要罰的事。
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
    '##############...#############',
    '##############...#############',
    '##############...#############',
  ],
  spawn: [3, 13],
  door: [24, 12],

  // 站著不動超過門檻，地板就從最左邊開始一格一格崩，往你逼近。
  // 已經崩掉的不會回來——猶豫是有代價的。
  traps: [
    {
      when: { t: 'idleFor', s: IDLE_MAX },
      do: [{ t: 'crumbleFromLeft', y: 14 }],
      every: CRUMBLE_EVERY,
    },
  ],

  // 上一關教你「等三秒」。這一關把那個習慣拿來對付你：
  // 你越習慣等，地板越等不了你。
  adapt(tiles, profile) {
    const delay = median(profile.restartDelays);
    const threshold = delay === null
      ? IDLE_MAX
      : Math.min(IDLE_MAX, Math.max(IDLE_MIN, 2.2 - delay));

    const taunt = profile.restartDelays.length >= 2
      ? `你上次等了 ${delay} 秒才動。地板等你 ${threshold.toFixed(1)} 秒。`
      : null;

    // 回傳新的陣列，不要改寫關卡本身
    return {
      tiles: tiles.slice(),
      taunt,
      traps: [{
        when: { t: 'idleFor', s: threshold },
        do: [{ t: 'crumbleFromLeft', y: 14 }],
        every: CRUMBLE_EVERY,
      }],
    };
  },
};
