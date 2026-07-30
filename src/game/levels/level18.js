// BOSS 關。地圖 90 格寬,是一般關卡的三倍——人物與地磚不縮小,
// 鏡頭跟著你走。這裡沒有新把戲:每一個機關你都在前面 17 關見過,
// 牠只是把它們全部排在同一條路上。你學過的一切,輪流回來找你。
const W = 90;

const wall = '#'.repeat(W);
const air = `#${'.'.repeat(W - 2)}#`;

function rowWith(marks) {
  const cells = air.split('');
  for (const [x, ch] of marks) cells[x] = ch;
  return cells.join('');
}

// 第 12 列(頭頂上方一格)埋一根假刺:走路的人穿不到它,安全;
// 愛跳的人會跳進去。前面的關卡教過你「/ 是假的可以穿」——
// 這一關中途把它變成真的,從此那裡禁止跳躍,而它不會告訴你。
const headRow = rowWith([[31, '/']]);

// 地板:x=20~23 一排會自己收起來的刺(第 5 關的梗,放大版)
const floor = (() => {
  const cells = wall.split('');
  for (const x of [20, 21, 22, 23]) cells[x] = '^';
  return cells.join('');
})();

export default {
  id: 18,
  name: '總復習',

  // BOSS 只見死得夠少的人:總死亡必須少於 20。
  // 超過就在第 17 關打完直接結算,門檻寫在你臉上。
  boss: true,
  maxDeaths: 19,

  announce: '牠醒了',

  // 刺陣會自己收——這面旗子是講給關卡驗證測試聽的,別把它當死路
  spikesRetract: true,

  tiles: [
    wall,
    ...Array(11).fill(air),
    headRow,
    air,
    floor,
    wall,
    wall,
  ],
  spawn: [3, 13],
  door: [86, 12],

  decoys: [[48, 7]],

  // 三種敵人同台駐守,各管一段路。
  // 巡邏獸的地盤刻意躲開假刺區(31,32):兩個死亡判定疊在同一段路,
  // 會變成「跳過獸就落在刺上」的無解夾擊——那是處刑,不是整人。
  enemies: [
    { kind: 'walker', x: 40, y: 13, min: 38, max: 42, speed: 30 },
    { kind: 'spitter', x: 57, y: 13, dir: -1, range: 11 },
    { kind: 'charger', x: 70, y: 13, min: 66, max: 74, speed: 30, sight: 7 },
  ],

  traps: [
    // 一、出發沒多久,腳下兩格從來就不是地板(第 11 關)
    {
      when: { t: 'crossX', x: 10 },
      do: [{ t: 'fakeTiles', x: 12, y: 14, w: 2, h: 1 }],
      once: true,
    },
    // 二、HUD 從此說謊(第 10 關)
    {
      when: { t: 'crossX', x: 16 },
      do: [{ t: 'glitch', kind: 'label', text: 'LEVEL ∞' }],
      once: true,
    },
    // 三、刺陣三秒後自己收(第 5 關)。急的人跳,忍的人走。
    {
      when: { t: 'afterDelay', s: 3 },
      do: [{ t: 'addTiles', x: 20, y: 14, w: 4, h: 1 }],
      once: true,
    },
    // 四、那根你以為是假的刺,變成真的(revealFake 的初次登台)。
    //     前面的關卡教你「/ 可以穿」——這一關把那個知識變成凶器:
    //     走路沒事,跳進去就死,而它看起來跟剛才一模一樣。
    {
      when: { t: 'crossX', x: 27 },
      do: [{ t: 'revealFake', x: 28, y: 12, w: 6, h: 1 }],
      once: true,
    },
    // 五、方塊砸在你身後,封掉退路(第 13 關的反向)。
    //     刻意放在巡邏獸的地盤右邊——同一段路不疊兩種死法。
    {
      when: { t: 'standOn', x: 48, y: 14 },
      do: [{ t: 'dropBlock', x: 46, y: 5 }],
      once: true,
    },
    // 六、左右反轉(第 10 關)
    {
      when: { t: 'crossX', x: 44 },
      do: [{ t: 'flipControls', on: true }],
      once: true,
    },
    // 七、橫掃的刺從你背後追過來(全遊戲唯一一次 sweepSpike)。
    //     它比你慢,一直往前走就永遠追不上——它罰的是停下來
    //     和走回頭路的人,不是手速。
    {
      when: { t: 'crossX', x: 60 },
      do: [{ t: 'sweepSpike', x: 40, y: 13, vx: 70 }],
      once: true,
    },
    // 八、反轉解除,腳前長出一根刺(第 10 關的雙重翻臉)
    {
      when: { t: 'standOn', x: 52, y: 14 },
      do: [
        { t: 'flipControls', on: false },
        { t: 'spawnSpikes', x: 54, y: 14, w: 1, h: 1 },
      ],
      once: true,
    },
    // 九、重力變重,前面破一格(第 8 關)
    {
      when: { t: 'crossX', x: 58 },
      do: [
        { t: 'setTune', tune: { gravityDown: 2600 } },
        { t: 'removeTiles', x: 62, y: 14, w: 1, h: 3 },
      ],
      once: true,
    },
    // 十、演一次假死(第 6、9、14 關)
    {
      when: { t: 'crossX', x: 64 },
      do: [{ t: 'fakeDeath', s: 0.6 }],
      once: true,
    },
    // 十一、去路塌一格(第 10、11、14 關)
    {
      when: { t: 'crossX', x: 68 },
      do: [{ t: 'crumbleFromRight', y: 14, from: 71 }],
      once: true,
    },
    // 十二、站著不動太久,地板從最左邊開始吃過來(第 6 關,BOSS 版沒有上限)
    {
      when: { t: 'idleFor', s: 4.2 },
      do: [{ t: 'crumbleFromLeft', y: 14 }],
      every: 0.6,
    },
    // 十三、死了三次,半空多一扇假門(第 2、6、9 關)
    {
      when: { t: 'deathCount', n: 3 },
      do: [{ t: 'spawnDecoy', x: 45, y: 7 }],
      once: true,
    },
    // 十四、假門滑到門口附近陪跑(第 2、14、16 關)
    {
      when: { t: 'crossX', x: 74 },
      do: [{ t: 'moveDecoy', decoy: 0, x: 30, y: 0 }],
      once: true,
    },
    // 十五、一隻巡邏獸出現在你剛走過的路上,把退路關起來(第 13 關)。
    //     牠的地盤在你身後——只有想回頭的人才會見到牠。
    {
      when: { t: 'crossX', x: 78 },
      do: [{ t: 'spawnEnemy', kind: 'walker', x: 76, y: 13, min: 74, max: 79, speed: 30 }],
      once: true,
    },
    // 十六、門前最後一段假當機,畫面回來多一扇門(第 12、16 關)
    {
      when: { t: 'crossX', x: 82 },
      do: [
        { t: 'glitch', kind: 'crash', s: 0.8 },
        { t: 'spawnDecoy', x: 82, y: 6 },
      ],
      once: true,
    },
    // 門前那一下由 adapt() 決定——要看你這一關死過幾次
  ],

  // 零死走完 BOSS 的人,最後吃一次 fakeWin(第 1、12、17 關的祖傳謊話);
  // 死過的人,門跳走加鎖——老老實實再追一次。
  adapt(tiles, profile, ctx = {}) {
    const deaths = ctx.deaths ?? 0;
    return {
      tiles: tiles.slice(),
      traps: [
        ...this.traps,
        deaths === 0
          ? {
            when: { t: 'touchDoor' },
            do: [{ t: 'fakeWin', s: 1.2 }],
            once: true,
          }
          : {
            // 門往右上角跳——貼在牆角的人跳起來也搆得到,
            // 這一下是「再追一次」,不是「追不到」。
            when: { t: 'touchDoor' },
            do: [
              { t: 'moveDoor', x: 1, y: -3 },
              { t: 'lockDoor', s: 1.0 },
            ],
            once: true,
          },
      ],
    };
  },
};
