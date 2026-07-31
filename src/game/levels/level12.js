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

  // 通過上一關後,轉場黑幕上的劇情
  story: '「最後一關。」它說。門會變多,售後服務不包含這件事。',

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

    // 五、洞的前面那兩格地板，從來就不是地板。
    //     你整場遊戲都在學「看得見的東西會騙你」，
    //     而最後一關把這件事放在你的必經之路上。
    traps.push({
      when: { t: 'afterDelay', s: 0.15 },
      do: [{ t: 'fakeTiles', x: 8, y: 14, w: 2, h: 1 }],
      once: true,
    });

    // 六、洞的對岸再過兩格，落腳處是假的——位置由你整場的速度決定，
    //     所以每個人踩空的地方都不一樣。
    //     跟洞刻意隔一格實地：連在一起會變成三格洞，
    //     配上跳過洞之後就換掉的手感，那是技巧考試不是整人。
    traps.push({
      when: { t: 'crossX', x: start - 1 },
      do: [{ t: 'fakeTiles', x: start + GAP_W + 2, y: 14, w: 1, h: 1 }],
      once: true,
    });

    // 七、門前最後一段——遊戲當了 0.9 秒，錯誤訊息蓋滿畫面。
    //     它沒有當。畫面回來的時候，半空中的門多了三扇。
    traps.push({
      when: { t: 'standOn', x: 22, y: 14 },
      do: [
        { t: 'glitch', kind: 'crash', s: 0.9 },
        { t: 'spawnDecoy', x: 21, y: 10 },
        { t: 'spawnDecoy', x: 27, y: 10 },
        { t: 'spawnDecoy', x: 23, y: 6 },
      ],
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
      // 八、整場遊戲的最後一個謊：你走到那扇一直都在的門，伸手碰到它——
      //     CLEAR! 跳出來了，音樂響了，你贏了。然後畫面收回去，
      //     而你站的地方是一扇假門。
      //     只騙這一次。死過之後這個陷阱就消失，門是真的了——
      //     因為重複同一個謊就只是刁難，不是欺騙。
      //     （fakeWin 演完自己會跟假門交換身分，所以這裡不能再放 swapDoor，
      //     兩個一起等於同一幀換兩次，互相抵消。）
      traps.push({
        when: { t: 'touchDoor' },
        do: [{ t: 'fakeWin', s: 1.2 }],
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
