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
        // 六、洞的正上方吊著倒刺，其中一半是假的。
        //     你會為了閃它而跳得比需要的更保守，然後掉進洞裡。
        {
          when: { t: 'crossX', x: 11 },
          do: [
            { t: 'spawnSpikes', x: 13, y: 10, w: 4, h: 1, down: true },
            { t: 'fakeTiles', x: 13, y: 10, w: 2, h: 1 },
          ],
          once: true,
        },
        // 七、跳過洞、落地站穩——畫面演了一次死亡。
        //     這一關整場都在罰你停下來，而假死會讓你鬆手停住。
        //     地板還在從左邊崩過來。這是全遊戲最惡毒的一次梗疊梗。
        {
          when: { t: 'crossX', x: 17 },
          do: [{ t: 'fakeDeath', s: 0.6 }],
          once: true,
        },
        // 這一關整場都在罰你站著不動——然後門鎖住 1.4 秒，逼你站著不動。
        // 地板還在從左邊崩過來。這是全遊戲最壞的一個梗，
        // 而它的解法只有一個：忍住不要跑。
        {
          when: { t: 'touchDoor' },
          do: [
            { t: 'lockDoor', s: 1.4 },
            { t: 'addTiles', x: 26, y: 11, w: 1, h: 3 },
          ],
          once: true,
        },
        // 八、崩塌加速。門鎖上之後，地板每 0.25 秒就少一格。
        //     解法還是「不要跑」——只是這次代價看得見。
        {
          when: { t: 'touchDoor' },
          do: [{ t: 'crumbleFromLeft', y: 14 }],
          every: 0.25,
        },
        // 死了四次之後，路中間多一扇假門。你已經背熟路線了，
        // 所以你會直直走過去。
        {
          when: { t: 'deathCount', n: 4 },
          do: [{ t: 'spawnDecoy', x: 18, y: 8 }],
          once: true,
        },
      ],
    };
  },
};
