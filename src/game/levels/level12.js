import { median } from '../profile.js';
import { MAP_W, MAX_SPEED } from '../constants.js';

const GAP_W = 2;
// 洞必須留在關卡中段。再往右就會跟門前那一串機關擠在一起，
// 變成「洞、刺、洞」的連續跳——那是技巧考試，不是整人。
const GAP_MIN = 11;
const GAP_MAX = 15;

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
  id: 12,
  name: '你這個人',

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

  // 最後一關的地形由整場遊戲的側寫生成，所以每個人的第 12 關都不一樣。
  // 但無論側寫長什麼樣，洞永遠只有兩格、位置永遠夾在可解的範圍內——
  // 「每個人的關卡不同」不能變成「有些人的關卡過不去」。
  adapt(tiles, profile, ctx = {}) {
    const deaths = ctx.deaths ?? 0;

    // 洞的位置由「你整場玩得多快」決定。
    // 這裡刻意不用落點——洞如果追著落點跑，你每次落在哪它就搬到哪，
    // 那是第 2 關的梗，而且在最後一關會變成永遠追不完的迴圈。
    // 速度是一個穩定的量：它描述你這個人，不會因為洞搬家就改變。
    const speed = median(profile.speeds);
    const fast = speed === null ? 0.5 : Math.min(1, Math.max(0, speed / MAX_SPEED));
    const start = GAP_MIN + Math.round(fast * (GAP_MAX - GAP_MIN));

    // 刺長在你跳過洞、落地站穩的前方。中間隔兩格，
    // 讓它是「另一個梗」而不是同一跳的延伸。
    const spikeX = Math.min(20, start + GAP_W + 2);

    const traps = [];

    // 一、跳過洞的瞬間，手感整個換掉——依你整場的跳法反向調整。
    //     最後一關不再對你長刺，它改成把你的身體換掉。
    const apex = median(profile.apexes);
    const heavy = apex === null || apex >= 45;
    traps.push({
      when: { t: 'crossX', x: start + GAP_W },
      do: [{
        t: 'setTune',
        tune: heavy
          ? { gravityDown: 2600, jumpSpeed: 250 }   // 你老是跳滿 → 跳不高了
          : { gravityDown: 1100, jumpSpeed: 360 },  // 你老是點跳 → 一按就飛
      }],
      once: true,
    });

    // 二、你以為只剩最後一段——半空中那排門裡，又多一扇
    traps.push({
      when: { t: 'crossX', x: 20 },
      do: [{ t: 'spawnDecoy', x: 22, y: 8 }],
      once: true,
    });

    // 三、半空中那排門，在你走過它們底下的時候一起往門口滑過來
    traps.push({
      when: { t: 'crossX', x: 17 },
      do: [
        { t: 'moveDecoy', decoy: 1, x: 4, y: 0 },
        { t: 'moveDecoy', decoy: 2, x: 2, y: 0 },
      ],
      once: true,
    });

    if (deaths === 0) {
      // 四、整場遊戲的最後一個謊：你走到了那扇一直都在的門，伸手碰到它——
      //     它跟半空中那些假門交換了身分。你摸到的是假的。
      //     只騙這一次。死過之後這個陷阱就消失，門是真的了——
      //     因為重複同一個謊就只是刁難，不是欺騙。
      traps.push({
        when: { t: 'touchDoor' },
        do: [{ t: 'swapDoor', decoy: 0 }],
        once: true,
      });
    } else {
      traps.push({
        when: { t: 'touchDoor' },
        do: [{ t: 'moveDoor', x: 0, y: -3 }],
        once: true,
      });
    }

    return {
      tiles: digGap(tiles, start),
      // 半空中一排一模一樣的門。你走過它們底下的時候只覺得礙眼。
      decoys: [[9, 8], [15, 8], [20, 8]],
      traps,
    };
  },
};
