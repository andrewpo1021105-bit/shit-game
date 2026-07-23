const DIVIDER_Y = 12;    // 高於這條線算上路，低於算下路
const GATE_X = 16;       // 走到這裡才判定你走的是哪條

// 封下路：用一道牆把地面走廊塞死，只剩上面的平台能走
function sealLow(tiles) {
  const out = tiles.slice();
  for (const y of [11, 12, 13]) {
    const cells = out[y].split('');
    cells[16] = '#';
    cells[17] = '#';
    out[y] = cells.join('');
  }
  return out;
}

// 封上路：在平台上鋪一段刺，寬到跳不過去（滿力跳只有 75 px，這裡是 80 px）
function sealHigh(tiles) {
  const out = tiles.slice();
  const cells = out[10].split('');
  for (let x = 12; x <= 16; x++) cells[x] = '^';
  out[10] = cells.join('');
  return out;
}

export default {
  id: 7,
  name: '你老是走那邊',

  // 第 10 列是上路的平台，第 12 列第 6~7 格是墊腳石。
  // 兩條路都通到右邊，門在地面上。
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
    '#.......####^########........#',
    '#............................#',
    '#.....##.....................#',
    '#............................#',
    '############^#################',
    '##############################',
    '##############################',
  ],
  spawn: [3, 13],
  door: [24, 12],

  // 走到 GATE_X 時記下你人在上面還是下面；
  // 另外不管你選哪條，前方都會突然冒出一根刺。
  traps: [
    { when: { t: 'crossX', x: GATE_X }, do: [{ t: 'noteRoute', y: DIVIDER_Y }], once: true },
    {
      when: { t: 'enterRect', x: 14, y: 8, w: 3, h: 3 },
      do: [{ t: 'spawnSpikes', x: 18, y: 10, w: 1, h: 1 }],
      once: true,
    },
    {
      when: { t: 'enterRect', x: 14, y: 12, w: 3, h: 2 },
      do: [{ t: 'spawnSpikes', x: 19, y: 14, w: 1, h: 1 }],
      once: true,
    },
    // 兩條路匯合之後，門前落下一面跳不過去的牆。慢了就被關在外面。
    {
      when: { t: 'crossX', x: 18 },
      do: [{ t: 'dropBlock', x: 22, y: 1, rows: 5, seals: true, gravity: 400 }],
      once: true,
    },
  ],

  // 你上次走哪條，這次那條就封死。
  // 永遠只封一條，另一條必定是通的。
  adapt(tiles, profile) {
    if (profile.lastRoute === 'low') return { tiles: sealLow(tiles) };
    if (profile.lastRoute === 'high') return { tiles: sealHigh(tiles) };
    return { tiles: tiles.slice() };
  },
};
