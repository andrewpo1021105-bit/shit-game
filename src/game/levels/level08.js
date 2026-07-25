import { median } from '../profile.js';
import { MAP_W } from '../constants.js';

// 洞永遠只有兩格寬——跳得過去不是問題，問題是你何時起跳。
const GAP_W = 2;
const GAP_MIN = 11;
const GAP_MAX = 18;
const GAP_DEFAULT = 14;

// 沒有樣本時假設一個中庸的起跳提前量（約一格）
const LEAD_DEFAULT = 16;

// 重力翻臉的下限：不能早於出生點六格，否則等於預告
const EARLIEST_TRIGGER = 9;

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
  id: 8,
  name: '你每次都在同一個地方起跳',

  // 基礎地形是一條完整的走廊。洞由 adapt() 挖，位置永遠是側寫的函數。
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

  // 它量的是你「離坑多遠就按跳」。這個提前量每個人都很穩定，
  // 穩定到可以拿來當觸發器：重力就在你慣性起跳的那一格變重。
  //
  // 反制永遠有效——換一個地方起跳，重力還沒翻臉你就已經在空中了；
  // 或者乾脆等它翻完再跳，反正變重的重力仍然跨得過兩格的洞。
  adapt(tiles, profile) {
    const lead = median(profile.jumpLeads) ?? LEAD_DEFAULT;
    const leadTiles = Math.max(0, Math.min(4, Math.round(lead / 16)));

    // 洞也跟著你的習慣移動，免得你把「第幾格起跳」背下來
    const start = Math.min(GAP_MAX, Math.max(GAP_MIN, GAP_DEFAULT + leadTiles));

    // 重力變重的那一格，就是你平常按下跳躍鍵的那一格
    const flipAt = Math.max(EARLIEST_TRIGGER, start - leadTiles - 1);

    return {
      tiles: digGap(tiles, start),
      decoys: [[18, 8]],
      traps: [
        // 一、你伸手要按跳的那一刻，下墜重力加重一倍。
        //     跳得出去，但落點比你以為的近——這一跳你會摔進洞裡。
        {
          when: { t: 'crossX', x: flipAt },
          do: [{ t: 'setTune', tune: { gravityDown: 3400 } }],
          once: true,
        },
        // 二、跳過洞、腳一落地，正前方長出一根刺
        {
          when: { t: 'crossX', x: start + GAP_W },
          do: [{ t: 'spawnSpikes', x: Math.min(21, start + GAP_W + 3), y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 三、門前最後一格，腳下的地板消失。重力已經變重了，這一跳更難搆。
        {
          when: { t: 'standOn', x: 22, y: 14 },
          do: [{ t: 'removeTiles', x: 23, y: 14, w: 1, h: 3 }],
          once: true,
        },
        // 四、碰到門的瞬間，門往上跳三格——而且重力在同一幀變回正常。
        //     你剛剛才適應完變重的手感，最後這一跳又換回來了。
        {
          when: { t: 'touchDoor' },
          do: [
            { t: 'setTune', tune: { gravityDown: 1620, jumpSpeed: 304 } },
            { t: 'moveDoor', x: 0, y: -3 },
          ],
          once: true,
        },
      ],
    };
  },
};
