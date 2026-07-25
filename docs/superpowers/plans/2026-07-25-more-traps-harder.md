# 更難、陷阱更多、更出奇不意 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 12 關的陷阱密度從每關 3～5 個梗提高到 6～8 個，並加入三類新的欺騙詞彙（假地磚、假死／假通關、假當機）。

**Architecture:** 新機制一律做成可重用的 trap action 與地磚字元，跟現有的 `spawnSpikes`、`moveDoor` 平起平坐，不各自占掉一關。關卡資料格式完全不變。命內狀態一律由 `applyBuild` 在重生時歸零。

**Tech Stack:** 純 ES modules、手寫 Canvas 2D、`node --test`。零 npm 執行期依賴、零建置工具。

**規格文件：** `docs/superpowers/specs/2026-07-25-more-traps-harder-design.md`

## Global Constraints

- 測試指令固定為 `npm test`（＝ `node --test "test/*.test.js"`）。**每一個 task 結束時全部測試必須綠**，不得留下已知失敗。
- 地圖永遠是 30 欄 × 17 列。所有 `tiles` 字串長度必須是 30，陣列長度必須是 17。
- 純邏輯模組（`physics.js`、`player.js`、`traps.js`、`profile.js`、`world.js`、`session.js`、`levels/*`）**不得 import 任何瀏覽器 API**。
- 註解用繁體中文，語氣比照既有程式碼：說明「為什麼」而不是「做什麼」，可以帶刺。
- 不得修改關卡資料格式（`id / name / tiles / spawn / door / traps / decoys / adapt`）。
- 不得引入隨機。同樣的輸入永遠得到同樣的結果。
- 這個 repo 沒有設定 git identity。所有 commit 一律用：
  `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "..."`
- commit message 結尾固定加上：
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B
  ```
- **工作區起點不乾淨**：有一批未 commit 的改動（`git status` 有 16 個 M）。Task 1 會處理其中壞掉的部分，其餘保留。

## 檔案結構

| 檔案 | 這一輪的責任 |
|---|---|
| `src/game/physics.js` | 新增 `FAKE_FLOOR` / `FAKE_SPIKE` 兩個字元常數，修改 `isSolid` 語意 |
| `src/game/traps.js` | 新增 `revealFake` / `fakeTiles` / `fakeDeath` / `fakeWin` / `glitch` 五個 action |
| `src/game/world.js` | `faking` phase、`glitch` 狀態與物理凍結、`applyBuild` 歸零 |
| `src/engine/render.js` | 假字元畫法、假死／假通關演出、glitch 三種畫法 |
| `src/engine/audio.js` | `glitch` 音效 |
| `src/main.js` | `glitch` 事件的震動強度 |
| `src/game/levels/level01..12.js` | 每關的新梗 |
| `test/playable.test.js` | 笨機器人改成會被假地磚騙；策略集合擴充 |
| `test/physics.test.js` `test/traps.test.js` `test/world.test.js` `test/session.test.js` `test/levels.test.js` | 對應的新測試 |

---

### Task 1: 修好第 7 關（重新設計路線分岔）

工作區目前 `npm test` 是 **169 pass / 1 fail**，失敗的是 `playable.test.js` 的第 7 關。這個 task 讓它回到全綠，之後所有 task 都在全綠的基礎上疊。

**診斷（已經查證，不要重查）：**

- HEAD 時第 7 關 18 個策略只有 1 個（`hold=0.2, lookahead=3`）過得去。工作區的 `swapDoor` 門前梗把那唯一一條活路也堵死了。
- 根因是地形，不是那個 trap：`row 10` 的平台橫跨 `x=8~20`。平台底下（`row 11~13`）淨高只有 48 px，玩家高 14 px，所以站在 `row 11` 的頭會被 `row 10` 壓死——**平台的陰影範圍內不可能有任何往上爬的路**。
- 因此路線分岔必須發生在 `x < 8`，而現在的墊腳石在 `x=6,7`、平台從 `x=8` 開始，兩者黏在一起，機器人爬上去的落點就直接是平台。
- 另外 `row 14` 的地面刺在 `x=12`，正好在平台陰影裡：從下面跳過它，頭會撞到平台，落點剛好踩回刺上。那是「逼玩家用特定跳躍高度」，鐵則 7 明文禁止。

**新地形（分岔左移，平台右移）：**

- 平台改成 `row 10` 的 `x=10~20`（原本 `x=8~20`）。
- 樓梯改在 `x=6`（`row 13`）、`x=7`（`row 12`）、`x=8`（`row 11`）。站在 `row 11` 的 `x=8` 時，正上方 `row 10` 的 `x=8` 是空的，不會被壓死。
- 地面刺從 `x=12` 移到 `x=22`——平台在 `x=20` 就結束，`x=22` 上方是開闊天空，任何跳法都跳得過。
- 上路的刺（`row 10` 的 `x=12`）維持不動：平台上方本來就是開闊天空。

**Files:**
- Modify: `src/game/levels/level07.js`
- Test: `test/playable.test.js`（既有測試，不改內容）

**Interfaces:**
- Consumes: 無
- Produces: 無（純關卡資料修正）

- [ ] **Step 1: 先確認失敗真的存在**

Run: `npm test 2>&1 | tail -20`
Expected: `pass 169` / `fail 1`，失敗訊息是「第 7 關『你老是走那邊』沒有任何簡單策略走得完」。

- [ ] **Step 2: 換掉 `tiles` 與兩個 seal 函式**

把 `src/game/levels/level07.js` 開頭到 `door` 為止換成：

```js
const DIVIDER_Y = 12;    // 高於這條線算上路，低於算下路
const GATE_X = 16;       // 走到這裡才判定你走的是哪條

// 封下路：把地面走廊在樓梯口的右邊塞死，逼你走樓梯。
// 牆蓋在 x=9，也就是樓梯頂端（x=8）的正右邊——被擋下來的人不必走回頭路，
// 抬頭就看得到唯一的出路。
function sealLow(tiles) {
  const out = tiles.slice();
  for (const y of [11, 12, 13]) {
    const cells = out[y].split('');
    cells[9] = '#';
    out[y] = cells.join('');
  }
  return out;
}

// 封上路：直接把樓梯拆掉。爬不上去的人自然留在地面走廊。
// 這裡刻意不用刺——用刺封路會害笨機器人（以及背路線的玩家）
// 一頭撞死在封起來的那條路上，那是刁難不是分岔。
function sealHigh(tiles) {
  const out = tiles.slice();
  for (const [x, y] of [[6, 13], [7, 12], [8, 11]]) {
    const cells = out[y].split('');
    cells[x] = '.';
    out[y] = cells.join('');
  }
  return out;
}

export default {
  id: 7,
  name: '你老是走那邊',

  // 第 10 列是上路的平台，從 x=10 開始——刻意跟樓梯錯開，
  // 因為平台底下淨高只有 48 px，站在平台正下方會被壓死。
  // 樓梯在 x=6,7,8 一階一階往上，爬到頂剛好在平台左緣外面。
  // 地面刺放在 x=22，平台之外的開闊處：任何跳法都跳得過，
  // 不會變成「只有中等力道的跳躍才穿得過去」的手指考試。
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
    '#.........##^########........#',
    '#.......#....................#',
    '#......#.....................#',
    '#.....#......................#',
    '######################^#######',
    '##############################',
    '##############################',
  ],
  spawn: [3, 13],
  door: [24, 12],
```

- [ ] **Step 3: 把門前梗改回「不奪走勝利」的版本**

`adapt()` 的 `doorGag` 目前第一條命用 `swapDoor`，那是第 7 關失敗的直接原因之一，而且第 12 關才是 `swapDoor` 的舞台。改成單純把門往上移：

```js
  // 你上次走哪條，這次那條就封死。
  // 永遠只封一條，另一條必定是通的。
  adapt(tiles, profile) {
    const base = profile.lastRoute === 'low' ? sealLow(tiles)
      : profile.lastRoute === 'high' ? sealHigh(tiles)
        : tiles.slice();

    return {
      tiles: base,
      traps: [
        ...this.traps,
        // 門前那一下：門往上跳三格，得跳起來才搆得到。
        // 這一關的 swapDoor 拿掉了——「碰到門就死」是第 12 關的收尾，
        // 在這裡用會讓分岔關變成純粹的死亡陷阱。
        {
          when: { t: 'touchDoor' },
          do: [{ t: 'moveDoor', x: 0, y: -3 }],
          once: true,
        },
      ],
    };
  },
};
```

`traps` 陣列（`noteRoute` 與兩個 `enterRect` 長刺）維持原樣不動。

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -20`
Expected: `pass 169` / `fail 0`。

若第 7 關仍然失敗，用這個腳本印出每個策略的結果與死亡位置再調整（**不要改測試**）：

```bash
cd "C:/搞人遊戲戲" && cat > ./dbg7.mjs <<'EOF'
import lv from './src/game/levels/level07.js';
import { createWorld, updateWorld } from './src/game/world.js';
import { createProfile } from './src/game/profile.js';
import { isSolid, isDeadly } from './src/game/physics.js';
import { PHYSICS_DT, TILE } from './src/game/constants.js';
function needsJump(w, la) {
  const p = w.player;
  const fr = Math.floor((p.y + p.h) / TILE), col = Math.floor((p.x + p.w / 2) / TILE);
  for (let d = 1; d <= la; d++) {
    const x = col + d;
    if (!isSolid(w.map, x, fr) || isDeadly(w.map, x, fr) || isDeadly(w.map, x, fr - 1)) return true;
  }
  if (isSolid(w.map, col + 1, fr - 1)) return true;
  return w.door.y + 2 < fr && Math.abs(w.door.x - col) <= 2;
}
for (const waitFirst of [false, true]) for (const hold of [0.35, 0.2, 0.12]) for (const la of [1, 2, 3]) {
  const w = createWorld(lv, createProfile());
  let jf = 0, won = false, last = 0, note = [];
  for (let i = 0; i < Math.round(30 / PHYSICS_DT); i++) {
    const idle = waitFirst && w.time < 3.6;
    if (!idle && w.phase === 'play' && w.player.grounded && needsJump(w, la)) jf = Math.round(hold / PHYSICS_DT);
    const go = !idle;
    updateWorld(w, { left: go && w.flipped, right: go && !w.flipped, jump: jf > 0 }, PHYSICS_DT);
    if (jf > 0) jf--;
    if (w.deaths > last) { last = w.deaths; if (note.length < 3) note.push(`死@col${Math.floor((w.player.x+5)/TILE)},row${Math.floor((w.player.y+14)/TILE)},route=${w.profile.lastRoute}`); }
    if (w.phase === 'won') { won = true; break; }
  }
  console.log(`wait=${waitFirst} hold=${hold} look=${la} -> ${won ? 'WIN' : 'fail  ' + note.join(' | ')}`);
}
EOF
node ./dbg7.mjs; rm -f ./dbg7.mjs```

- [ ] **Step 5: Commit**

```bash
git add src/game/levels/level07.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "fix: 第 7 關的分岔點移出平台陰影，恢復可通關

平台底下淨高只有 48 px，站在平台正下方會被壓死，所以往上爬的路
不可能在平台陰影裡。樓梯左移到 x=6,7,8、平台右移到 x=10 起，
地面刺從 x=12（平台正下方）移到 x=22（開闊處）。

封路改成拆樓梯而不是鋪刺——用刺封路會害人一頭撞死在封起來的
那條路上，那是刁難不是分岔。門前的 swapDoor 拿掉，留給第 12 關。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 2: 假地磚字元 `,` 與 `/`

**Files:**
- Modify: `src/game/physics.js`
- Modify: `src/engine/render.js`（`drawTile` 與 `drawWorld` 的地磚迴圈）
- Modify: `test/levels.test.js`（`blockedRuns` 與洞寬量測）
- Test: `test/physics.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `FAKE_FLOOR = ','`、`FAKE_SPIKE = '/'`（`src/game/physics.js` 具名匯出）
  - `isSolid(map, tx, ty)` 對這兩個字元回傳 `false`
  - `isDeadly(map, tx, ty)` 對這兩個字元回傳 `false`

- [ ] **Step 1: 寫失敗的測試**

在 `test/physics.test.js` 檔尾加入：

```js
test('假地板畫得跟實心地板一樣，但物理上不存在', () => {
  const map = ['#,#'];
  assert.equal(isSolid(map, 0, 0), true);
  assert.equal(isSolid(map, 1, 0), false, '假地板不能是實心的');
  assert.equal(isDeadly(map, 1, 0), false, '假地板不會殺人');
});

test('假刺畫得跟刺一樣，但碰到不會死，也擋不住人', () => {
  const map = ['#/#'];
  assert.equal(isDeadly(map, 1, 0), false, '假刺不會殺人');
  assert.equal(isSolid(map, 1, 0), false, '假刺是空氣，站不上去');
});

test('碰撞箱穿得過假地板，也不會被假刺殺死', () => {
  const box = { x: 16, y: 0, w: 10, h: 14 };
  assert.equal(collides([',,,'], box), false, '不該卡在假地板裡');
  assert.equal(touchesDeadly(['///'], box), false, '不該被假刺殺死');
});
```

`test/physics.test.js` 頂端的 import 需要包含 `isSolid, isDeadly, collides, touchesDeadly`；缺哪個就補哪個。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -A3 "假地板"`
Expected: FAIL —「假地板不能是實心的」，因為 `isSolid` 目前只排除 `'.'`。

- [ ] **Step 3: 改 `physics.js`**

把 `src/game/physics.js` 頂端的字元定義與 `isSolid` 換成：

```js
// 地磚字元：'.' 空氣、'#' 實心、'^' 地上的刺、'v' 天花板倒掛的刺
// 兩種刺都是實心的，而且都會殺人
export const AIR = '.';
export const SPIKE = '^';
export const SPIKE_DOWN = 'v';

// 假的：畫得跟真的一模一樣，但物理上不存在。
// ',' 看起來是實心地板，踩上去直接穿過；
// '/' 看起來是刺，碰到卻什麼事都沒有——它的用途不是嚇你，
// 是逼你為了繞過它而走進真的陷阱。
export const FAKE_FLOOR = ',';
export const FAKE_SPIKE = '/';

// 物理上不存在的字元。看得見不代表擋得住。
const PASSABLE = new Set([AIR, FAKE_FLOOR, FAKE_SPIKE]);

export function isSolid(map, tx, ty) {
  return !PASSABLE.has(tileAt(map, tx, ty));
}
```

`isDeadly` 不動——它只認 `^` 與 `v`，所以假刺自動就是無害的。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 讓假字元畫得跟真的一模一樣**

`src/engine/render.js` 的 `drawTile` 目前靠 `map[y - 1][x] !== '#'` 判斷要不要畫頂端亮邊。假地板上面壓一塊真地板時，亮邊會洩漏出來——判斷要改成「看起來像實心」。

在 `render.js` 的 `const clamp01 = ...` 下面加：

```js
// 畫面上「看起來是實心」的字元。假地板必須跟真地板共用同一組畫法，
// 連頂端亮邊的判斷都要一致——看得出來的假地板就不是假地板。
const looksSolid = (ch) => ch === '#' || ch === ',';
```

`drawTile` 內那一行改成：

```js
    if (y === 0 || !looksSolid(map[y - 1][x])) {
```

`drawWorld` 內的地磚繪製迴圈改成：

```js
    const map = world.map;
    for (let y = 0; y < map.length; y++)
      for (let x = 0; x < map[y].length; x++) {
        const ch = map[y][x];
        // 假地板走 '#' 的畫法、假刺走 '^' 的畫法。像素完全相同，不是近似。
        if (ch === '#' || ch === ',') drawTile(map, x, y);
        else if (ch === '^' || ch === '/') drawSpike(x, y, 1);
        else if (ch === 'v') drawSpike(x, y, -1);
      }
```

- [ ] **Step 6: 讓關卡可解性檢查認得假字元**

`test/levels.test.js` 的 `blockedRuns` 目前只把 `.` 與 `^` 當成不能踩。假地板與假刺同樣站不上去：

```js
// 掃出一列裡所有連續的「不能踩」片段，回傳 [起點, 長度]
// 假地板與假刺站不上去（它們是空氣），所以跟洞一樣算不能踩
function blockedRuns(row) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < row.length; x++) {
    const bad = row[x] === '.' || row[x] === '^' || row[x] === ',' || row[x] === '/';
    if (bad && start < 0) start = x;
    if (!bad && start >= 0) { runs.push([start, x - start]); start = -1; }
  }
  if (start >= 0) runs.push([start, row.length - start]);
  return runs;
}
```

而 `adapt` 可解性測試裡量洞寬的那一行，要先把假字元正規化成它們的物理真相。把

```js
      const floor = tiles[lv.spawn[1] + 1];
```

改成

```js
      // 量洞寬要用物理真相，不是畫面：假地板跟假刺都是空氣，跟洞一樣跨不過去
      const floor = tiles[lv.spawn[1] + 1].replace(/[,/]/g, '.');
```

- [ ] **Step 7: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 8: Commit**

```bash
git add src/game/physics.js src/engine/render.js test/physics.test.js test/levels.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 假地板與假刺——看得見不代表擋得住

',' 畫得跟實心地板一模一樣，踩上去直接穿過；'/' 畫得跟刺一模一樣，
碰到卻什麼事都沒有。假刺的用途不是嚇人，是逼你為了繞過它
而走進真的陷阱。

連 drawTile 的頂端亮邊判斷都要一致——看得出來的假地板就不是假地板。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 3: `revealFake` / `fakeTiles` — 假的變真的，真的變假的

**Files:**
- Modify: `src/game/traps.js`
- Test: `test/traps.test.js`

**Interfaces:**
- Consumes: `FAKE_FLOOR` / `FAKE_SPIKE`（Task 2）
- Produces:
  - `{ t: 'revealFake', x, y, w, h }` — `,`→`#`、`/`→`^`
  - `{ t: 'fakeTiles', x, y, w, h }` — `#`→`,`、`^`→`/`
  - 兩者都只換這四種字元，`.` 與 `v` 一律不動

- [ ] **Step 1: 寫失敗的測試**

在 `test/traps.test.js` 檔尾加入：

```js
test('revealFake 把假的變成真的，而且不碰空氣', () => {
  const world = { map: ['.,/#'] };
  applyAction(world, { t: 'revealFake', x: 0, y: 0, w: 4, h: 1 });
  assert.equal(world.map[0], '.#^#', '假地板要變實心、假刺要變真刺、空氣不動');
});

test('fakeTiles 把真的變成假的，而且不碰空氣與倒刺', () => {
  const world = { map: ['.#^v'] };
  applyAction(world, { t: 'fakeTiles', x: 0, y: 0, w: 4, h: 1 });
  assert.equal(world.map[0], '.,/v', '倒刺不在對照表裡，維持原樣');
});

test('revealFake 超出地圖範圍不會爆炸', () => {
  const world = { map: [',,'] };
  applyAction(world, { t: 'revealFake', x: -2, y: -2, w: 9, h: 9 });
  assert.equal(world.map[0], '##');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -B2 -A5 "revealFake"`
Expected: FAIL —「未知的動作型別：revealFake」。

- [ ] **Step 3: 實作**

在 `src/game/traps.js` 的 `paint` 函式下面加：

```js
// 跟 paint 不同：它不是塗掉一整塊，而是照對照表逐格換。
// 沒列在對照表裡的字元一律不動——所以空氣永遠是空氣，
// 不會因為「把這塊變成實心」而把玩家要走的洞填掉。
function repaint(world, x, y, w, h, mapping) {
  for (let ty = y; ty < y + h; ty++) {
    if (ty < 0 || ty >= world.map.length) continue;
    const row = world.map[ty].split('');
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tx >= row.length) continue;
      const to = mapping[row[tx]];
      if (to) row[tx] = to;
    }
    world.map[ty] = row.join('');
  }
}
```

在 `applyAction` 的 switch 裡加兩個 case（放在 `spawnSpikes` 後面）：

```js
    case 'revealFake':
      // 你第一次穿過去的地板，第二次是實的。同一塊地磚，兩種命運。
      repaint(world, action.x, action.y, action.w, action.h, { ',': '#', '/': '^' });
      break;
    case 'fakeTiles':
      // 反過來：你剛剛才踩過的地板，現在只是畫上去的。
      repaint(world, action.x, action.y, action.w, action.h, { '#': ',', '^': '/' });
      break;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: Commit**

```bash
git add src/game/traps.js test/traps.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: revealFake 與 fakeTiles——同一塊地磚，兩種命運

照對照表逐格換，沒列在表裡的字元一律不動，所以空氣永遠是空氣。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 4: `fakeDeath` / `fakeWin` — 你連自己死了沒都不確定

**Files:**
- Modify: `src/game/traps.js`
- Modify: `src/game/world.js`（`applyBuild`、`updateWorld`）
- Modify: `src/engine/render.js`（`drawWorld`、`drawWinOverlay`）
- Test: `test/world.test.js`、`test/session.test.js`

**Interfaces:**
- Consumes: `swapDoor`（既有 action）
- Produces:
  - `{ t: 'fakeDeath', s }`（`s` 預設 `0.6`）、`{ t: 'fakeWin', s }`（`s` 預設 `1.2`）
  - `world.phase === 'faking'`、`world.fakeKind ∈ {'death','win',null}`
  - `world.fakeTimer`（**遞增**，從 0 數到 `world.fakeDuration`）
  - `world.events` 會推 `'death'` 或 `'win'`，跟真的完全一樣

- [ ] **Step 1: 寫失敗的測試**

在 `test/world.test.js` 檔尾加入（這兩個 helper 後面的 Task 5 也會用到）：

```js
// 一條完全空的平路，走到 x=8 就觸發指定的動作
function actionLevel(id, action) {
  return {
    id, name: '測試用',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12],
    decoys: [[20, 8]],
    traps: [{ when: { t: 'crossX', x: 8 }, do: [action], once: true }],
  };
}

function runTo(world, seconds, input = { left: false, right: true, jump: false }) {
  for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) updateWorld(world, input, PHYSICS_DT);
}

test('假死看起來就是死亡，但沒有真的死', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  runTo(world, 1.5);
  assert.equal(world.phase, 'faking', '應該正在演出');
  assert.equal(world.fakeKind, 'death');
  assert.equal(world.deaths, 0, '假死不能算進死亡數');
  assert.equal(world.player.vx, 0, '演出期間人是停住的');
});

test('假死演完就原地繼續，位置不變', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  runTo(world, 1.5);
  const x = world.player.x;
  runTo(world, 0.7);
  assert.equal(world.phase, 'play');
  assert.equal(world.fakeKind, null);
  assert.equal(world.player.x, x, '演完人要在原地，不是回到出生點');
});

test('假通關演完會把真門換成假門', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeWin', s: 1.2 }));
  const before = { x: world.door.x, y: world.door.y };
  runTo(world, 1.5);
  assert.equal(world.fakeKind, 'win');
  runTo(world, 1.3);
  assert.equal(world.phase, 'play');
  assert.notDeepEqual({ x: world.door.x, y: world.door.y }, before,
    '你剛剛「過關」的那扇門現在是假的');
});

test('重生會清掉演出狀態', () => {
  const world = createWorld(actionLevel(99, { t: 'fakeDeath', s: 0.6 }));
  runTo(world, 1.5);
  resetLevel(world);
  assert.equal(world.phase, 'play');
  assert.equal(world.fakeKind, null);
});
```

`test/world.test.js` 頂端的 import 需要有 `createWorld, updateWorld, resetLevel` 與 `PHYSICS_DT`；缺哪個補哪個。

在 `test/session.test.js` 檔尾加入：

```js
test('假通關不會讓 session 進轉場', () => {
  const level = {
    id: 98, name: '假過關',
    tiles: [
      '##############################',
      ...Array(13).fill('#............................#'),
      '##############################',
      '##############################',
      '##############################',
    ],
    spawn: [3, 13], door: [24, 12],
    decoys: [[20, 8]],
    traps: [{ when: { t: 'crossX', x: 8 }, do: [{ t: 'fakeWin', s: 1.2 }], once: true }],
  };
  const session = createSession([level, { ...level, id: 97 }]);
  for (let i = 0; i < Math.round(1.5 / PHYSICS_DT); i++) {
    updateSession(session, { left: false, right: true, jump: false }, PHYSICS_DT);
  }
  assert.equal(session.world.phase, 'faking');
  assert.equal(session.phase, 'play', 'session 只認真的通關');
  assert.equal(session.index, 0, '不能因為演出就換關');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -A4 "假死看起來"`
Expected: FAIL —「未知的動作型別：fakeDeath」。

- [ ] **Step 3: 在 `traps.js` 加兩個 action**

在 `applyAction` 的 switch 裡加（放在 `swapDoor` 後面）：

```js
    case 'fakeDeath':
    case 'fakeWin': {
      // 演一次死亡／過關。震動、音效、CLEAR! 字樣全部跟真的一模一樣，
      // 但你沒死也沒過。它破壞的是玩家最底層的信任：
      // 你連「我剛剛是不是死了」都不確定。
      if (world.phase !== 'play') break;
      world.phase = 'faking';
      world.fakeKind = action.t === 'fakeWin' ? 'win' : 'death';
      world.fakeTimer = 0;
      world.fakeDuration = action.s ?? (action.t === 'fakeWin' ? 1.2 : 0.6);
      // 停住。真的死亡是不會繼續往前滑的。
      world.player.vx = 0;
      world.player.vy = 0;
      break;
    }
```

- [ ] **Step 4: 在 `world.js` 加演出狀態**

`applyBuild` 內，`world.phase = 'play';` 那一行前面加：

```js
  // 假死／假通關的演出狀態。跟其他命內狀態一樣，重生歸零。
  world.fakeKind = null;
  world.fakeTimer = 0;
  world.fakeDuration = 0;
```

`updateWorld` 內，`if (world.phase === 'won') { world.phaseTimer += dt; return; }` 那一行**後面**加：

```js
  // 演出期間輸入完全無效——它要看起來就是一次真的死亡／過關。
  if (world.phase === 'faking') {
    world.fakeTimer += dt;
    if (world.fakeTimer >= world.fakeDuration) {
      // 假通關演完，真門跟第 0 扇假門交換身分：
      // 你剛剛「走進去」的那扇，現在是會殺你的那扇。
      // 沒有假門就不換——單純演完恢復。
      if (world.fakeKind === 'win' && world.decoys.length > 0) {
        applyAction(world, { t: 'swapDoor', decoy: 0 });
      }
      world.fakeKind = null;
      world.phase = 'play';
    }
    return;
  }
```

在跑完 `applyAction` 的那個 for 迴圈裡，跟 `spike` / `flip` / `lock` 並列加上：

```js
    // 假的也要有聲音與震動，否則它就不像真的了
    if (a.t === 'fakeDeath') world.events.push('death');
    if (a.t === 'fakeWin') world.events.push('win');
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 6: 讓演出畫得跟真的一模一樣**

`src/engine/render.js` 的 `drawWorld` 裡，把門的發光那一段換成：

```js
    // 假通關必須跟真通關畫得一模一樣，所以兩者共用同一條時間軸。
    // 差別只在真通關用 phaseTimer，假通關用 fakeTimer。
    const winLike = world.phase === 'won'
      || (world.phase === 'faking' && world.fakeKind === 'win');
    const winT = world.phase === 'won' ? world.phaseTimer : world.fakeTimer;
    const glow = winLike ? Math.max(0, 1 - winT / 0.45) : 0;
```

同一個函式尾端的 `if (world.phase === 'won') drawWinOverlay(world);` 改成：

```js
    if (winLike) drawWinOverlay(world, winT);
```

`drawWinOverlay` 的簽章改成吃時間參數：

```js
  function drawWinOverlay(world, t) {
```

並把該函式第一行的 `const t = world.phaseTimer;` 刪掉。

玩家的繪製條件（`if (world.phase === 'play')`）不用改——假死時人一樣會消失，那正是它要的效果。

- [ ] **Step 7: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 8: Commit**

```bash
git add src/game/traps.js src/game/world.js src/engine/render.js test/world.test.js test/session.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 假死與假通關——你連自己死了沒都不確定

震動、音效、CLEAR! 字樣全部跟真的一模一樣，但你沒死也沒過。
假通關演完會把真門跟假門交換：你剛剛「走進去」的那扇是會殺你的。

session 只認 world.phase === 'won'，所以演出不會換關。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 5: `glitch` — 假當機與 HUD 說謊

**Files:**
- Modify: `src/game/traps.js`
- Modify: `src/game/world.js`
- Modify: `src/engine/render.js`
- Modify: `src/engine/audio.js`
- Modify: `src/main.js`
- Test: `test/world.test.js`

**Interfaces:**
- Consumes: Task 4 的 `actionLevel` / `runTo` 兩個測試 helper
- Produces:
  - `{ t: 'glitch', kind: 'freeze', s }`、`{ t: 'glitch', kind: 'crash', s }`、`{ t: 'glitch', kind: 'label', text }`
  - `world.glitch === null | { kind, text, timer }`
  - `freeze` 與 `crash` 期間 `updateWorld` 完全不推進物理；`label` 的 `timer` 是 `0`，所以在這條命之內不會自己消失
  - `world.events` 會推 `'glitch'`

- [ ] **Step 1: 寫失敗的測試**

在 `test/world.test.js` 檔尾加入：

```js
test('freeze 期間物理完全不前進', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'freeze', s: 0.8 }));
  runTo(world, 1.5);
  assert.equal(world.glitch.kind, 'freeze');
  const x = world.player.x;
  runTo(world, 0.3);
  assert.equal(world.player.x, x, '凍住了就不能再往前滑——這是它不吃手速的保證');
});

test('freeze 時間到就解凍', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'freeze', s: 0.8 }));
  runTo(world, 1.5);
  runTo(world, 1.0);
  assert.equal(world.glitch, null);
  const x = world.player.x;
  runTo(world, 0.2);
  assert.ok(world.player.x > x, '解凍後要能繼續走');
});

test('label 在這條命之內不會自己消失', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'label', text: 'LEVEL 13' }));
  runTo(world, 1.5);
  assert.equal(world.glitch.text, 'LEVEL 13');
  runTo(world, 5.0);
  assert.equal(world.glitch.text, 'LEVEL 13', '沒有 s 就不會過期');
});

test('重生清掉 glitch', () => {
  const world = createWorld(actionLevel(96, { t: 'glitch', kind: 'label', text: 'LEVEL 13' }));
  runTo(world, 1.5);
  resetLevel(world);
  assert.equal(world.glitch, null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -A4 "freeze 期間"`
Expected: FAIL —「未知的動作型別：glitch」。

- [ ] **Step 3: 實作 action**

在 `src/game/traps.js` 的 `applyAction` switch 裡加：

```js
    case 'glitch':
      // 假當機。freeze 與 crash 連物理一起凍住——只凍畫面、物理照跑
      // 會變成「你看到的是 0.8 秒前的自己」，那是純考手指，而且踩到
      // 「跟時間賽跑」的紅線。凍結解除時場上已經不一樣了，一樣嚇人。
      //
      // label 沒有 s，所以 timer 是 0，這條命之內不會自己恢復——
      // 關卡編號亂掉之後就一路錯下去，玩家會持續懷疑自己漏了什麼。
      world.glitch = {
        kind: action.kind,
        text: action.text ?? null,
        timer: action.s ?? 0,
      };
      break;
```

- [ ] **Step 4: 在 `world.js` 加狀態與凍結**

`applyBuild` 內，`world.phase = 'play';` 前面加：

```js
  // 假當機也是命內狀態，重生歸零
  world.glitch = null;
```

`updateWorld` 內，`world.events = [];` 的**下一行**加：

```js
  // 假當機的凍結：畫面與物理一起停住。停的期間陷阱不跑、玩家不動，
  // 所以它嚇人但不吃手速。label 的 timer 是 0，不會走進這裡。
  if (world.glitch && world.glitch.timer > 0) {
    world.glitch.timer -= dt;
    if (world.glitch.timer <= 0) world.glitch = null;
    return;
  }
```

跑完 `applyAction` 的 for 迴圈裡加：

```js
    if (a.t === 'glitch') world.events.push('glitch');
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 6: 畫出來**

`src/engine/render.js` 的 `drawWorld` 裡，HUD 那一段目前寫死 `` `LEVEL ${world.level.id}` ``。在那一段開頭先算出要顯示什麼：

```js
    // HUD 也會說謊。label glitch 一旦發動，關卡編號就一路錯下去。
    const levelText = world.glitch?.kind === 'label' && world.glitch.text
      ? world.glitch.text
      : `LEVEL ${world.level.id}`;
```

然後把那一段裡三處 `` `LEVEL ${world.level.id}` `` 全部換成 `levelText`（鏡像分支的 `measureText` 那一處也要換）。

`drawWorld` 的最後（`if (winLike) drawWinOverlay(...)` 之後）加：

```js
    if (world.glitch?.kind === 'crash') drawCrash();
```

在 `drawWinOverlay` 後面加這個函式：

```js
  // 假當機。它蓋掉整個畫面，看起來就是遊戲真的爆了。
  // 物理同時是凍住的，所以你不會在看不見的時候被偷走進度。
  function drawCrash() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'left';
    ctx.font = '8px Consolas, monospace';
    const lines = [
      'Uncaught TypeError: Cannot read properties of null',
      '    at updateWorld (world.js:214:19)',
      '    at step (main.js:32:3)',
      '    at frame (loop.js:18:7)',
      '',
      'The game has stopped responding.',
    ];
    lines.forEach((line, i) => {
      ctx.fillStyle = i >= 4 ? C.ui : C.uiHot;
      ctx.fillText(line, 12, 40 + i * 12);
    });
  }
```

- [ ] **Step 7: 聲音與震動**

`src/engine/audio.js`，在 `'lock'` 那一行後面加：

```js
      // 當機聲：一段爆裂的雜訊加一個低到不像音效的悶音
      else if (name === 'glitch') { noise(0.18, 0.10); tone(90, 70, 0.22, 'square', 0.06); }
```

`src/main.js` 的事件迴圈裡加：

```js
    if (e === 'glitch') shake = 7;
```

- [ ] **Step 8: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 9: Commit**

```bash
git add src/game/traps.js src/game/world.js src/engine/render.js src/engine/audio.js src/main.js test/world.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 假當機與 HUD 說謊

freeze 與 crash 連物理一起凍——只凍畫面會變成純考手指，
而且踩到「跟時間賽跑」的紅線。凍結解除時場上已經不一樣了。

label 沒有 s，所以這條命之內不會自己恢復：關卡編號亂掉之後
就一路錯下去，玩家會持續懷疑自己漏了什麼。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 6: 笨機器人必須跟玩家一樣被騙

沒有這一步，後面所有加了假地磚的關卡都會「通過」測試——因為機器人讀的是 `isSolid`，它會自動繞過玩家根本看不出來的陷阱。**這個 task 必須在任何關卡改造之前完成。**

**Files:**
- Modify: `test/playable.test.js`

**Interfaces:**
- Consumes: `FAKE_FLOOR` / `FAKE_SPIKE`（Task 2）、`tileAt`（`physics.js` 既有匯出）
- Produces: 無（純測試強化）

- [ ] **Step 1: 改寫機器人的視野**

把 `test/playable.test.js` 的 physics import 改成：

```js
import { isSolid, isDeadly, tileAt } from '../src/game/physics.js';
```

在 `needsJump` 上面加：

```js
// 假地板與假刺畫得跟真的一模一樣，所以機器人也必須照「畫面上的樣子」
// 判斷——否則它會自動繞過玩家根本看不出來的陷阱，這條測試就守不住玩家了。
//
// known 記的是「我親身穿過／踩進去過的那一格」。經歷過之後就改讀真相，
// 因為玩家也是這樣：假地板穿過去的那一瞬間就看見了。
// 這剛好是鐵則 4 的實作保證——每個騙局都必須「死一次就學得會」。
const key = (x, y) => `${x},${y}`;

function apparentSolid(map, tx, ty, known) {
  if (known.has(key(tx, ty))) return isSolid(map, tx, ty);
  return tileAt(map, tx, ty) !== '.';    // 畫面上除了空氣，看起來都是實體
}

function apparentDeadly(map, tx, ty, known) {
  if (known.has(key(tx, ty))) return isDeadly(map, tx, ty);
  const ch = tileAt(map, tx, ty);
  return ch === '^' || ch === 'v' || ch === '/';
}

// 腳正在穿過一格「看起來是實心／看起來是刺」但其實不是的地磚——
// 這一瞬間玩家也看得到，所以機器人當場學會。
function noticeFakes(world, known) {
  const p = world.player;
  const y = Math.floor((p.y + p.h) / TILE);
  for (let x = Math.floor(p.x / TILE); x <= Math.floor((p.x + p.w - 1) / TILE); x++) {
    const ch = tileAt(world.map, x, y);
    if (ch === ',' || ch === '/') known.add(key(x, y));
  }
}
```

- [ ] **Step 2: 讓 `needsJump` 與 `play` 用新視野**

`needsJump` 改成吃 `known`：

```js
function needsJump(world, lookahead, known) {
  const p = world.player;
  const footRow = Math.floor((p.y + p.h) / TILE);
  const col = Math.floor((p.x + p.w / 2) / TILE);

  for (let d = 1; d <= lookahead; d++) {
    const x = col + d;
    if (!apparentSolid(world.map, x, footRow, known)) return true;        // 前面看起來是洞
    if (apparentDeadly(world.map, x, footRow, known)) return true;        // 前面看起來是刺
    if (apparentDeadly(world.map, x, footRow - 1, known)) return true;    // 前面看起來有倒刺
  }
  if (apparentSolid(world.map, col + 1, footRow - 1, known)) return true; // 前面有牆或落下的方塊

  // 門吊在半空中而且就在附近——跳上去搆它
  return world.door.y + 2 < footRow && Math.abs(world.door.x - col) <= 2;
}
```

`play` 內建立 `known` 並每幀更新：

```js
function play(level, { waitFirst, hold, lookahead }) {
  const world = createWorld(level, createProfile());
  let jumpFrames = 0;
  // 被騙過的格子。跨死亡保留（同一個坑不會被騙第二次），
  // 但不跨 play() 呼叫——每個策略都從零開始被騙。
  const known = new Set();

  for (let i = 0; i < Math.round(30 / PHYSICS_DT); i++) {
    noticeFakes(world, known);
    // 「等一下」要用這條命的時間，死了之後要重新等
    const idle = waitFirst && world.time < 3.6;
    if (!idle && world.phase === 'play' && world.player.grounded
        && needsJump(world, lookahead, known)) {
      jumpFrames = Math.round(hold / PHYSICS_DT);
    }
    // 它想去的方向永遠是右邊；反轉時要按的鍵才是左邊
    const goRight = !idle;
    const input = {
      left: goRight && world.flipped,
      right: goRight && !world.flipped,
      jump: jumpFrames > 0,
    };
    if (jumpFrames > 0) jumpFrames--;

    updateWorld(world, input, PHYSICS_DT);
    if (world.phase === 'won') return true;
  }
  return false;
}
```

- [ ] **Step 3: 擴充策略集合**

第 9～12 關的鐵則 7 放開了，允許窄平台。策略集合跟著放寬（**不是**寫一個更聰明的機器人——聰明機器人守不住任何有意義的命題）：

```js
const STRATEGIES = [];
for (const waitFirst of [false, true]) {
  for (const hold of [0.45, 0.35, 0.28, 0.2, 0.15, 0.12]) {
    for (const lookahead of [1, 2, 3, 4]) STRATEGIES.push({ waitFirst, hold, lookahead });
  }
}
```

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。此時還沒有任何關卡用到假地磚，所以行為不該改變，只是策略變多、跑得久一點（約 0.5 秒）。

- [ ] **Step 5: Commit**

```bash
git add test/playable.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "test: 笨機器人必須跟玩家一樣被假地磚騙

機器人原本讀 isSolid，會自動繞過玩家根本看不出來的陷阱——
那樣這條測試就守不住玩家了。改成照「畫面上的樣子」判斷，
親身穿過去之後才改讀真相。

這剛好是鐵則 4 的實作保證：每個騙局都必須「死一次就學得會」。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

## 關卡改造的共同規則（Task 7～10 都適用）

- 每一關的最後一個梗**必須**掛在 `touchDoor` 上（鐵則 6）。
- 新加的梗盡量往後推。出生點附近只放「越死越壞」（`deathCount`）的梗。
- 第 1～8 關：把 `traps` 全部清空之後，那一關必須是一條走得完的平路。
- 改完每一關就跑一次 `npm test`。**不准為了讓測試過而改測試。**
- 若 `playable.test.js` 抓到某關走不完，用 Task 1 Step 4 的除錯腳本（把 `level07` 換成對應的關卡檔）印出死亡位置再調整關卡。
- **同一幀多個 `touchDoor` 觸發器依陣列順序執行**。新增 `touchDoor` 梗時要檢查陣列裡還有沒有別的 `touchDoor`，並確認順序正確。

---

### Task 7: 第 1～3 關

**Files:**
- Modify: `src/game/levels/level01.js`、`level02.js`、`level03.js`

**Interfaces:**
- Consumes: `fakeWin`（Task 4）、`fakeTiles`（Task 3）、`,` `/`（Task 2）
- Produces: 無

- [ ] **Step 1: 第 1 關 — 3 個梗變 6 個**

`fakeWin` 需要一扇假門才有東西可以交換。在 `level01.js` 的 `door` 下面加：

```js
  // 半空中吊一扇假門。第一條命它只是礙眼，直到你「過關」的那一刻——
  // 那一刻它跟真門交換身分，而你正站在原本是真門的地方。
  decoys: [[19, 7]],
```

原本第三個梗跟新的第六個梗都掛在 `touchDoor` 上，兩個會在同一幀跑掉。把原本那個改成 `standOn`，讓門先滑開：

把
```js
    {
      when: { t: 'touchDoor' },
      do: [{ t: 'moveDoor', x: 2, y: 0, leaveHole: true }],
      once: true,
    },
```
改成
```js
    {
      when: { t: 'standOn', x: 23, y: 14 },
      do: [{ t: 'moveDoor', x: 2, y: 0, leaveHole: true }],
      once: true,
    },
```

然後在 `traps` 陣列尾端加三個：

```js
    // 四、你追上滑開的門、站到它前面——它鎖住 0.9 秒，同時頭頂砸下一塊方塊。
    //     解法是往旁邊走一步，不是站著發呆。但你剛剛才學到「碰到門就過關」。
    {
      when: { t: 'standOn', x: 26, y: 14 },
      do: [
        { t: 'lockDoor', s: 0.9 },
        { t: 'dropBlock', x: 26, y: 5 },
      ],
      once: true,
    },
    // 五、死了兩次之後，出生點正前方三格的地板變成假的。
    //     你已經背熟路線了，所以你會直直衝出去，然後穿過地板。
    {
      when: { t: 'deathCount', n: 2 },
      do: [{ t: 'fakeTiles', x: 6, y: 14, w: 3, h: 1 }],
      once: true,
    },
    // 六、全遊戲的第一個謊，也是最大的一個：你真的碰到門了，
    //     CLEAR! 跳出來、勝利音樂響了、畫面暗下去——然後它收回去，
    //     而你剛剛走進的那扇門，現在是會殺你的那扇。
    //     第一關就講清楚這個遊戲的規則：連通關都可能是假的。
    {
      when: { t: 'touchDoor' },
      do: [{ t: 'fakeWin', s: 1.2 }],
      once: true,
    },
```

- [ ] **Step 2: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

第五個梗會在出生點前方挖出 3 格寬的洞（`fakeTiles` 讓那三格變成空氣）。`MAX_JUMPABLE_GAP` 是 4，所以跳得過去，但機器人得先被騙掉一條命才會知道。若 `playable.test.js` 走不完，把 `w` 從 `3` 降到 `2`。

- [ ] **Step 3: 第 2 關 — 4 個梗變 7 個**

`level02.js` 的 `adapt()` 回傳的 `traps` 陣列裡，在 `touchDoor` 那個**之前**加三個：

```js
        // 出生點右邊那一小段，其中兩格從來就不是地板。
        // 這一關教的是「洞會追你」，而這兩格告訴你：有些洞你看不見。
        {
          when: { t: 'deathCount', n: 1 },
          do: [{ t: 'fakeTiles', x: 7, y: 14, w: 2, h: 1 }],
          once: true,
        },
        // 你跳過洞、正要落地——對岸的落腳處在你落下的途中變成假的。
        // 這是全遊戲最壞的一種時機：陷阱在你確定自己安全的那一刻觸發。
        {
          when: { t: 'jumpCount', n: 2 },
          do: [{ t: 'fakeTiles', x: 18, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 門鎖著、牆把你關在門口，這時頭頂砸下一塊方塊。
        // 往旁邊站一步就躲得掉——但你正在等鎖開，你不想動。
        {
          when: { t: 'standOn', x: 24, y: 14 },
          do: [{ t: 'dropBlock', x: 24, y: 5 }],
          once: true,
        },
```

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 第 3 關 — 3 個梗變 6 個**

`level03.js` 的 `adapt()` 回傳的 `traps` 陣列加三個。**第四個必須排在第一個（`jumpCount: 1` 的 `spawnSpikes`）後面**——`checkTriggers` 依陣列順序執行，刺要先長出來，才有東西可以變假：

```js
        // 四、天花板長出來的那排倒刺裡，有五根是假的。
        //     問題不是你敢不敢賭——是你根本分不出來，所以你會繞。
        //     而繞路的代價是你得在小坑前面停下來重新起跳。
        {
          when: { t: 'jumpCount', n: 1 },
          do: [{ t: 'fakeTiles', x: SPAN_X0 + 3, y: row, w: 5, h: 1 }],
          once: true,
        },
        // 五、跳過小坑，對岸的落腳處是假的
        {
          when: { t: 'crossX', x: 13 },
          do: [{ t: 'fakeTiles', x: 17, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 六、碰到門了——門鎖住 1.1 秒，而門那一側的地板從最右邊往回崩。
        //     你站在原地等，看著自己的立足點一格一格變少。
        {
          when: { t: 'touchDoor' },
          do: [
            { t: 'lockDoor', s: 1.1 },
            { t: 'crumbleFromRight', y: 14, from: 28 },
          ],
          once: true,
        },
```

- [ ] **Step 6: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 7: Commit**

```bash
git add src/game/levels/level01.js src/game/levels/level02.js src/game/levels/level03.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 第 1-3 關加密度，並在第一關就打碎「通關」這個概念

第 1 關的門前梗換成假通關：CLEAR! 跳出來、音樂響了，然後收回去，
而你剛剛走進的那扇門現在是會殺你的。第一關就講清楚遊戲的規則。

第 2、3 關引進假地板與假刺——有些洞你看不見，有些刺不用繞。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 8: 第 4～6 關

**Files:**
- Modify: `src/game/levels/level04.js`、`level05.js`、`level06.js`

**Interfaces:**
- Consumes: `fakeDeath`（Task 4）、`fakeTiles`（Task 3）
- Produces: 無

- [ ] **Step 1: 第 4 關 — 3 個梗變 6 個**

`level04.js` 的 `adapt()` 回傳的 `traps` 加三個。既有的 `touchDoor` 梗要移到這三個**後面**，讓假死先演、門再跳走：

```js
        // 四、你追門追到一半，地面長出一排刺，正上方卻多了一塊平台。
        //     刺是假的——但你不會為了驗證這件事把命賭下去，你會跳上去繞。
        //     而平台上方吊著真的倒刺。假刺不是拿來嚇你的，是拿來趕你的。
        {
          when: { t: 'crossX', x: 12 },
          do: [
            { t: 'spawnSpikes', x: 14, y: 14, w: 4, h: 1 },
            { t: 'fakeTiles', x: 14, y: 14, w: 4, h: 1 },
            { t: 'addTiles', x: 14, y: 11, w: 4, h: 1 },
            { t: 'spawnSpikes', x: 15, y: 9, w: 2, h: 1, down: true },
          ],
          once: true,
        },
        // 五、門逃跑留下的坑，邊緣那一格是畫上去的。
        //     你追著門跳過坑，落點卻比你以為的少一格。
        {
          when: { t: 'crossX', x: 21 },
          do: [{ t: 'fakeTiles', x: 23, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 六、你把門逼到牆角、伸手碰到它——畫面演了一次死亡。
        //     你沒有死。但你一定會鬆手。
        {
          when: { t: 'touchDoor' },
          do: [{ t: 'fakeDeath', s: 0.6 }],
          once: true,
        },
```

**注意**：第四個梗把 `x=14~17` 的地板變成 4 格寬的假地板（實際上是洞）。`MAX_JUMPABLE_GAP` 是 4，剛好在上限，而且門逃跑時還會在別處挖洞。若 `playable.test.js` 走不完，把 `spawnSpikes` / `fakeTiles` 的 `w` 從 `4` 降到 `3`，`addTiles` 的 `w` 一併降到 `3`。

- [ ] **Step 2: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 3: 第 5 關 — 4 個梗變 7 個**

`level05.js` 的 `traps` 陣列加三個（加在既有四個之後，`touchDoor` 那個仍留在它原本的位置）：

```js
    // 五、擋住你的那排刺，右邊兩根其實是假的。
    //     你等了三秒才發現本來可以直接走過去——這一關罰的是急，
    //     但它也罰你太守規矩。
    {
      when: { t: 'afterDelay', s: 1.2 },
      do: [{ t: 'fakeTiles', x: FIELD_X0 + 4, y: 14, w: 2, h: 1 }],
      once: true,
    },
    // 六、刺收起來了，你開始走——半空中那扇假門滑到門口旁邊。
    //     兩扇門並排，而你剛剛忍了三秒，不想再忍第二次。
    {
      when: { t: 'crossX', x: 18 },
      do: [{ t: 'moveDecoy', decoy: 0, x: 9, y: 3 }],
      once: true,
    },
    // 七、門鎖著、你站在門口等——頭頂砸下一塊方塊。
    {
      when: { t: 'standOn', x: 27, y: 14 },
      do: [{ t: 'dropBlock', x: 27, y: 5 }],
      once: true,
    },
```

**注意**：第五個梗的 `afterDelay: 1.2` 必須早於 `RETRACT_AT`（3 秒），這樣「有兩根是假的」在刺收起來之前就成立。`adapt()` 生成的刺陣寬度可能只有 `NARROW`（2），此時 `FIELD_X0 + 4` 那兩格本來就不是刺，`fakeTiles` 找不到 `^` 就什麼都不做——那是 `repaint` 的對照表語意，不會出錯。

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 第 6 關 — 5 個梗變 8 個**

`level06.js` 的 `adapt()` 回傳的 `traps` 加三個。假死那一個要排在既有的 `touchDoor` 梗**之前**：

```js
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
        // 八、崩塌加速。門鎖上之後，地板每 0.25 秒就少一格。
        //     解法還是「不要跑」——只是這次代價看得見。
        {
          when: { t: 'touchDoor' },
          do: [{ t: 'crumbleFromLeft', y: 14 }],
          every: 0.25,
        },
```

- [ ] **Step 6: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

第八個梗用的是 `every` 而不是 `once`，而既有的 `touchDoor` 梗（`lockDoor` + `addTiles`）是 `once`。兩者共存沒問題——`checkTriggers` 對兩種語意分別處理。

- [ ] **Step 7: Commit**

```bash
git add src/game/levels/level04.js src/game/levels/level05.js src/game/levels/level06.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 第 4-6 關加密度，假死在第 6 關達到最惡毒的形態

第 4 關示範假刺的正確用法：不是嚇你，是趕你——地面一排假刺逼你
跳上平台繞路，而平台上方吊著真的倒刺。

第 6 關整場都在罰你停下來，所以那裡演一次假死：你一定會鬆手停住，
而地板還在從左邊崩過來。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 9: 第 7～9 關

**Files:**
- Modify: `src/game/levels/level07.js`、`level08.js`、`level09.js`

**Interfaces:**
- Consumes: `glitch freeze`（Task 5）、`fakeDeath`（Task 4）、`fakeTiles`（Task 3）
- Produces: 無

- [ ] **Step 1: 第 7 關 — 4 個梗變 7 個**

Task 1 已經把第 7 關的地形重新設計過。在 `adapt()` 回傳的 `traps` 裡，於 `touchDoor` 那個**之前**加三個：

```js
        // 上路的平台，中段有兩格是畫上去的。你在上面走得好好的。
        {
          when: { t: 'crossX', x: 13 },
          do: [{ t: 'fakeTiles', x: 16, y: 10, w: 2, h: 1 }],
          once: true,
        },
        // 下路的走廊，樓梯口過去那一格也是畫上去的
        {
          when: { t: 'crossX', x: 11 },
          do: [{ t: 'fakeTiles', x: 15, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 被封起來的那條路，路口旁邊長出一根刺——是假的。
        // 它讓「這條路被封死了」看起來更像真的，於是你連試都不會試。
        // 這一關教的就是這件事：你老是走那邊，因為你從來沒看過另一邊。
        //
        // 刺刻意長在 x=5（樓梯第一階 x=6 的左邊），不長在樓梯本身上——
        // spawnSpikes 把 '#' 蓋成 '^'、fakeTiles 再蓋成 '/'（空氣），
        // 長在樓梯上等於把樓梯拆掉。
        {
          when: { t: 'crossX', x: 4 },
          do: [
            { t: 'spawnSpikes', x: 5, y: 13, w: 1, h: 1 },
            { t: 'fakeTiles', x: 5, y: 13, w: 1, h: 1 },
          ],
          once: true,
        },
```

- [ ] **Step 2: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

第 7 關特別脆弱（見 Task 1 的診斷）。若失敗，用除錯腳本確認是哪條路斷了，優先懷疑上路平台那兩格假地板（`x=16,17` 於 `row 10`）把上路切斷了——那兩格若讓上路變成 2 格洞，配合平台高度可能跳不過去。真是那樣就把 `w` 降到 `1`。

- [ ] **Step 3: 第 8 關 — 4 個梗變 7 個**

`level08.js` 的 `adapt()` 回傳的 `traps` 裡，於 `touchDoor` 那個**之前**加三個：

```js
        // 五、你正要按下跳躍鍵的那一刻，遊戲當掉了 0.8 秒。
        //     它沒有當——凍結解除的時候，洞的右緣已經多了一格。
        //     這一關量的是你的起跳提前量，而它剛剛把你的參考點抽走了。
        {
          when: { t: 'crossX', x: Math.max(2, flipAt - 1) },
          do: [
            { t: 'glitch', kind: 'freeze', s: 0.8 },
            { t: 'removeTiles', x: start + GAP_W, y: 14, w: 1, h: 3 },
          ],
          once: true,
        },
        // 六、洞的右緣再過去一格是畫上去的。你跳得夠遠，但落點不存在。
        {
          when: { t: 'crossX', x: Math.max(3, start - 3) },
          do: [{ t: 'fakeTiles', x: start + GAP_W + 1, y: 14, w: 1, h: 1 }],
          once: true,
        },
        // 七、門前長出一根刺，是假的。你會跳，而重力已經變重了。
        {
          when: { t: 'standOn', x: 21, y: 14 },
          do: [
            { t: 'spawnSpikes', x: 22, y: 14, w: 1, h: 1 },
            { t: 'fakeTiles', x: 22, y: 14, w: 1, h: 1 },
          ],
          once: true,
        },
```

**注意**：原本的洞是 `GAP_W = 2` 格，第五個梗再挖 1 格、第六個梗再把下一格變假，總共 4 格連續空洞——正好等於 `MAX_JUMPABLE_GAP`，而且重力在這時已經被調重了。若 `playable.test.js` 走不完，先拿掉第六個梗的 `fakeTiles`（改成把 `x` 往右挪兩格，讓它跟洞不連續）。

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 第 9 關 — 4 個梗變 7 個，並收窄平台**

第 9 關是第一次動用「鐵則 7 放開」的額度。把 `level09.js` 的 `tiles` 第 12 列（index 12，目前是 `'#............................#'`）改成一段一格寬的窄平台：

```js
    '#..................#.#.#.....#',
```

`traps` 陣列在 `touchDoor` 那個**之前**加三個：

```js
    // 五、你正盯著面板上的數字看——畫面演了一次死亡。
    //     你會抬頭確認自己還在不在。而那正是它要的：
    //     這一關的壓力來自被注視，假死只是把注視變成互動。
    {
      when: { t: 'standOn', x: 18, y: 14 },
      do: [{ t: 'fakeDeath', s: 0.6 }],
      once: true,
    },
    // 六、跳過洞的落腳處是假的
    {
      when: { t: 'crossX', x: 13 },
      do: [{ t: 'fakeTiles', x: 17, y: 14, w: 1, h: 1 }],
      once: true,
    },
    // 七、面板旁邊那排窄平台，中間一格是畫上去的。
    //     你的眼睛在數字上，不在腳下。
    {
      when: { t: 'crossX', x: 17 },
      do: [{ t: 'fakeTiles', x: 21, y: 12, w: 1, h: 1 }],
      once: true,
    },
```

- [ ] **Step 6: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

窄平台是選配的高路，地面走廊仍然是通的。若 `playable.test.js` 抓到問題，代表窄平台意外擋住了地面路線——把 `row 12` 改回全空並把第七個梗改掛在 `row 14` 的 `x=21`。

- [ ] **Step 7: Commit**

```bash
git add src/game/levels/level07.js src/game/levels/level08.js src/game/levels/level09.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 第 7-9 關加密度，假當機在第 8 關抽走你的參考點

第 8 關量的是起跳提前量，所以它在你要按跳的那一刻凍結 0.8 秒，
解凍時洞已經變寬。它沒有當，只是把你的參考點抽走了。

第 9 關開始動用「鐵則 7 放開」的額度：面板旁邊多一段窄平台。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 10: 第 10～12 關

**Files:**
- Modify: `src/game/levels/level10.js`、`level11.js`、`level12.js`

**Interfaces:**
- Consumes: `glitch label` / `glitch crash`（Task 5）、`fakeWin`（Task 4）、`fakeTiles`（Task 3）
- Produces: 無

- [ ] **Step 1: 第 10 關 — 4 個梗變 7 個**

`level10.js` 的 `traps` 在 `touchDoor` 那個**之前**加三個：

```js
    // 五、它說它停止分析了。然後 HUD 上的關卡編號變成 LEVEL 13，
    //     而且再也不改回來。你會開始懷疑自己漏了兩關。
    //     這是這一關唯一的謊——它確實沒有在分析你，它只是在騙你。
    //     用 afterDelay 而不是別的觸發器，是因為 glitch 是命內狀態、
    //     重生會被清掉；每條命重新觸發一次，玩家從頭到尾看到的才都是錯的。
    {
      when: { t: 'afterDelay', s: 0.1 },
      do: [{ t: 'glitch', kind: 'label', text: 'LEVEL 13' }],
      once: true,
    },
    // 六、你正在適應反著按——腳下那一格變成畫上去的。
    //     左右反轉加上腳下落空，是這一關唯一一次真的兩件事同時發生。
    {
      when: { t: 'crossX', x: 14 },
      do: [{ t: 'fakeTiles', x: 18, y: 14, w: 1, h: 1 }],
      once: true,
    },
    // 七、門前那一段，控制翻回正常。你剛剛才練熟反著按。
    {
      when: { t: 'standOn', x: 22, y: 14 },
      do: [{ t: 'flipControls', on: false }],
      once: true,
    },
```

既有的 `touchDoor` 梗裡有 `{ t: 'flipControls', on: false }`，但第七個梗已經翻回正常了，所以門前這一下要改成再翻一次：

```js
    {
      when: { t: 'touchDoor' },
      do: [
        { t: 'flipControls', on: true },
        { t: 'moveDoor', x: 0, y: -3 },
      ],
      once: true,
    },
```

- [ ] **Step 2: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。笨機器人讀得到 `world.flipped` 並自己反向，所以連續翻兩次不會讓它走不完。

- [ ] **Step 3: 第 11 關 — 4 個梗變 7 個**

`level11.js` 的 `adapt()` 裡，在既有的 `touchDoor` push 之前加三段。三個新梗全部掛在死亡數條件下，「越死越簡單」的語意才維持不變：

```js
    // 四、洞的對岸落腳處是假的。死幾次之後它就不會出現了——
    //     這一關會放水，但它要你知道它放了水。
    if (deaths < EASE_1) {
      traps.push({
        when: { t: 'crossX', x: 11 },
        do: [{ t: 'fakeTiles', x: 15, y: 14, w: 1, h: 1 }],
        once: true,
      });
    }

    // 五、起點附近一排刺，全是假的。你會繞，而繞路要爬上去。
    if (deaths < EASE_1) {
      traps.push({
        when: { t: 'crossX', x: 5 },
        do: [
          { t: 'spawnSpikes', x: 8, y: 14, w: 3, h: 1 },
          { t: 'fakeTiles', x: 8, y: 14, w: 3, h: 1 },
        ],
        once: true,
      });
    }

    // 六、門鎖住 1.0 秒，頭頂砸下方塊。死到第二階段就撤掉。
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
      // 死到第二階段之後，它連假地板都幫你補成真的——
      // 這是全遊戲唯一一次 revealFake 往「對玩家有利」的方向用。
      // 它在示範它有多不在乎：連放水都放得這麼明顯。
      traps.push({
        when: { t: 'afterDelay', s: 0.1 },
        do: [{ t: 'revealFake', x: 1, y: 14, w: 28, h: 1 }],
        once: true,
      });
    }
```

- [ ] **Step 4: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

第五個梗會把 `x=8~10` 變成 3 格空洞。若 `playable.test.js` 走不完，把 `w` 從 `3` 降到 `2`。

- [ ] **Step 5: 第 12 關 — 4 個梗變 8 個**

`level12.js` 的 `adapt()`：先把 `deaths === 0` 分支裡的 `swapDoor` 換成 `fakeWin`。**兩個不能並存**——`fakeWin` 本身就含門的互換，一起放會在同一幀互換兩次而互相抵消：

```js
    if (deaths === 0) {
      // 八、整場遊戲的最後一個謊：你走到那扇一直都在的門，伸手碰到它——
      //     CLEAR! 跳出來了，音樂響了，你贏了。然後畫面收回去，
      //     而你站的地方是一扇假門。
      //     跟第 1 關一模一樣的招式。它從頭到尾只騙你這兩次。
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
```

再在那段 `if` **之前**加三個：

```js
    // 五、洞的前面一排刺，是假的。你整場遊戲都在學「刺會殺你」，
    //     而最後一關要你把那件事忘掉。
    traps.push({
      when: { t: 'crossX', x: Math.max(3, start - 5) },
      do: [
        { t: 'spawnSpikes', x: start - 3, y: 14, w: 2, h: 1 },
        { t: 'fakeTiles', x: start - 3, y: 14, w: 2, h: 1 },
      ],
      once: true,
    });

    // 六、洞的對岸，落腳處是假的——位置由你整場的速度決定，
    //     所以每個人踩空的地方都不一樣。
    traps.push({
      when: { t: 'crossX', x: start - 1 },
      do: [{ t: 'fakeTiles', x: start + GAP_W, y: 14, w: 1, h: 1 }],
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
```

- [ ] **Step 6: 跑測試**

Run: `npm test 2>&1 | tail -8`
Expected: `fail 0`。

兩個要注意的地方：
- 第五個梗把 `start-3` 起兩格變成空洞，離真正的洞（`start`）只隔 1 格。那是「洞、地、洞」的連續跳，接近技巧考試。若 `playable.test.js` 走不完，把 `x` 改成 `start - 5`、`w` 改成 `2`，拉開距離。
- `spawnDecoy` 的位置要避開玩家跳起來會碰到的高度。門在 `(24,12)`、玩家走 `row 14`，`y=10` 的假門佔 `row 10~11`，跳滿只會到 `row 11` 附近——若 `playable.test.js` 抓到「跳起來就撞到假門」，把 `y: 10` 那兩扇改成 `y: 9`。

- [ ] **Step 7: Commit**

```bash
git add src/game/levels/level10.js src/game/levels/level11.js src/game/levels/level12.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: 第 10-12 關加密度，最後一關用第 1 關的招式收尾

第 10 關宣布已停止分析，然後 HUD 變成 LEVEL 13 而且再也不改回來。
它確實沒有在分析你，它只是在騙你。

第 12 關的門前梗從 swapDoor 換成 fakeWin——跟第 1 關一模一樣的招式，
整場遊戲只用這兩次。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

### Task 11: 全域驗收

**Files:**
- Modify: `test/levels.test.js`
- Test: 全部

**Interfaces:**
- Consumes: Task 1～10 的全部產出
- Produces: 無

- [ ] **Step 1: 加一條「密度不得回落」的測試**

在 `test/levels.test.js` 檔尾加：

```js
// 鐵則 6：要晚，而且要多。每關至少六個梗，而且門前一定要有一個。
// 這條測試守的是密度本身——它防止日後有人為了讓某關「好過一點」
// 而偷偷把梗拔掉。
test('每一關至少六個梗，而且門前一定有一個', () => {
  for (const lv of LEVELS) {
    const traps = lv.adapt
      ? (lv.adapt(lv.tiles, createProfile(), { deaths: 0 }).traps ?? lv.traps)
      : lv.traps;
    assert.ok(traps.length >= 6,
      `第 ${lv.id} 關只有 ${traps.length} 個梗，密度不足`);
    assert.ok(traps.some((t) => t.when.t === 'touchDoor'),
      `第 ${lv.id} 關的門前沒有梗——鐵則 6 要求最後一下必須在玩家伸手碰到門的那一刻`);
  }
});
```

- [ ] **Step 2: 跑測試**

Run: `npm test 2>&1 | tail -12`
Expected: `fail 0`。

若某關梗數不足，回到對應的 Task 補足——**不要調低這條測試的門檻**。第 11 關在 `deaths: 0` 時梗最多，所以這條測試用 `deaths: 0` 是對的。

- [ ] **Step 3: 確認單檔打包仍然可用**

Run: `npm run build && npm test 2>&1 | tail -8`
Expected: `dist/` 更新，`bundle.test.js` 通過。

- [ ] **Step 4: 人工試玩一輪**

Run: `npm run dev`，瀏覽器開 `http://localhost:8080`。

確認以下幾件事**用眼睛看得到**：
- 假地板與真地板在畫面上**完全分不出來**。這是硬性要求——看得出差別就回 Task 2 Step 5。
- 第 1 關死兩次之後，出生點前的地板穿得過去。
- 第 1 關碰到門會演一次假通關，收回去之後門變成假的。
- 第 8 關的凍結期間畫面完全靜止，解凍時洞變寬了。
- 第 10 關的 HUD 顯示 `LEVEL 13`，重生之後仍然是 13。
- 第 12 關門前會跳出假的錯誤訊息。

- [ ] **Step 5: Commit**

```bash
git add test/levels.test.js dist
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "test: 密度不得回落——每關至少六個梗，門前一定有一個

這條測試防的是日後有人為了讓某關「好過一點」而偷偷把梗拔掉。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015kE8EWHFTJCL1y2YHi3e8B"
```

---

## 風險與已知脆弱點

1. **第 7 關**（Task 1、Task 9）。它的路線分岔跟笨機器人的「只會往右走」本質上衝突，Task 1 的重新設計是第一次讓它有結構性的活路，而不是靠運氣（HEAD 時 18 個策略只有 1 個過得去）。這一關的任何改動都要重跑 `playable.test.js`。

2. **`fakeTiles` 會把地板變成洞**。`,` 在物理上是空氣，所以每一次對地板用 `fakeTiles` 都等於挖洞，可能把某個缺口加寬到跳不過去。`levels.test.js` 的可解性檢查只看 `adapt()` 產生的**初始**地形，抓不到 trap 執行後的狀態——**只有 `playable.test.js` 抓得到**。每加一個 `fakeTiles` 都要跑全測試。

3. **`spawnSpikes` + `fakeTiles` 的組合會拆地形**。`spawnSpikes` 把 `#` 蓋成 `^`，`fakeTiles` 再把 `^` 蓋成 `/`（空氣）——所以這個組合用在地板上等於挖洞。用在天花板（倒刺）最安全；用在地板時要確認那一段的寬度仍然跳得過去。

4. **同一幀多個 `touchDoor` 觸發器的順序**。`checkTriggers` 依陣列順序執行，`applyAction` 依序套用。`fakeWin` 與 `swapDoor` 都會交換門，兩個一起放會互相抵消（第 12 關已處理）。新增 `touchDoor` 梗時要檢查陣列裡還有沒有別的。

5. **`fakeWin` 需要至少一扇假門**。沒有假門就只是演完恢復，梗會消失但不會出錯。第 1 關為此新增了 `decoys`。

6. **`glitch label` 是命內狀態**。它靠 `afterDelay` 每條命重新觸發來製造「一路錯下去」的錯覺。若把觸發器換成 `deathCount` 之類的東西，效果會在重生後消失。
