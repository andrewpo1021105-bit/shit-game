// 死得越多，關卡越簡單。這不是仁慈——
// 通關畫面會把這個數字留在那裡，而那才是這一關真正的計分板。
const EASE_1 = 3;   // 死這麼多次之後，掃過來的刺不見了
const EASE_2 = 6;   // 再死下去，連洞都幫你填起來

function fillGap(tiles) {
  const out = tiles.slice();
  for (let y = 14; y <= 16; y++) out[y] = '##############################';
  return out;
}

export default {
  id: 11,
  name: '算了，讓你過',

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
    '#############..###############',
    '#############..###############',
    '#############..###############',
  ],
  spawn: [3, 13],
  door: [24, 12],
  traps: [],

  // 難度是死亡數的遞減函數。玩家很快會發現「撞牆就會變簡單」，
  // 然後發現自己不想用那個方法——這一關賭的是自尊心。
  adapt(tiles, profile, ctx = {}) {
    const deaths = ctx.deaths ?? 0;
    const traps = [];

    // 一、跳過洞、落地站穩的瞬間，前方的地板自己塌掉一格。
    //     這一關會慢慢放棄——連陷阱都懶得長出來了，直接讓地板消失。
    if (deaths < EASE_2) {
      traps.push({
        when: { t: 'crossX', x: 16 },
        do: [{ t: 'crumbleFromRight', y: 14, from: 19 }],
        once: true,
      });
    }

    // 二、你以為只剩平路了——頭頂砸下一塊方塊。
    //     這裡刻意不用橫掃的刺：那種東西是在跟你搶時間，
    //     而這個遊戲不考時機，只考你有沒有被騙。
    if (deaths < EASE_1) {
      traps.push({
        when: { t: 'standOn', x: 20, y: 14 },
        do: [{ t: 'dropBlock', x: 20, y: 5 }],
        once: true,
      });
    }

    // 三、門前最後一格，腳下的地板消失
    if (deaths < EASE_2) {
      traps.push({
        when: { t: 'standOn', x: 22, y: 14 },
        do: [{ t: 'removeTiles', x: 23, y: 14, w: 1, h: 3 }],
        once: true,
      });
    }

    // 四、洞的對岸落腳處是假的。死幾次之後它就不會出現了——
    //     這一關會放水，但它要你知道它放了水。
    if (deaths < EASE_1) {
      traps.push({
        when: { t: 'crossX', x: 11 },
        do: [{ t: 'fakeTiles', x: 15, y: 14, w: 1, h: 1 }],
        once: true,
      });
    }

    // 五、出生點右邊那兩格地板，從來就不是地板。
    //     你已經走過它們十幾次了——在前面十一關裡。這一關的地圖
    //     長得跟第 9、10 關幾乎一樣，而你的腳記得路。腳是會背叛你的。
    if (deaths < EASE_1) {
      traps.push({
        when: { t: 'afterDelay', s: 0.1 },
        do: [{ t: 'fakeTiles', x: 8, y: 14, w: 2, h: 1 }],
        once: true,
      });
    }

    // 六、門鎖住 1.0 秒，頭頂砸下方塊。死到第二階段就撤掉，
    //     而且它連假地板都幫你補成真的——這是全遊戲唯一一次
    //     revealFake 往「對玩家有利」的方向用。
    //     它在示範它有多不在乎：連放水都放得這麼明顯。
    if (deaths < EASE_2) {
      traps.push({
        when: { t: 'standOn', x: 23, y: 14 },
        do: [
          { t: 'lockDoor', s: 1.0 },
          { t: 'dropBlock', x: 23, y: 5 },
        ],
        once: true,
      });
    } else {
      traps.push({
        when: { t: 'afterDelay', s: 0.1 },
        do: [{ t: 'revealFake', x: 1, y: 14, w: 28, h: 1 }],
        once: true,
      });
    }

    // 七、門往上跳，順手把那扇假門拉到真門旁邊。
    //     這一個永遠都在——它可以放水，但不會不出手。
    traps.push({
      when: { t: 'touchDoor' },
      do: [
        { t: 'moveDecoy', decoy: 0, x: 4, y: 0 },
        { t: 'moveDoor', x: 0, y: deaths >= EASE_1 ? -2 : -3 },
      ],
      once: true,
    });

    return {
      tiles: deaths >= EASE_2 ? fillGap(tiles) : tiles.slice(),
      // 死到第二階段就連假門都撤掉
      decoys: deaths >= EASE_1 ? [] : [[17, 8]],
      traps,
    };
  },
};
