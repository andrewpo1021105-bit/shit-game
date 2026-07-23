# 引擎核心 + 第 1 關 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出可在瀏覽器實際遊玩的第 1 關——走向門、地板無聲塌陷、死亡、0.3 秒重生、第二次跳過去過關。

**Architecture:** 手寫 Canvas 2D。純邏輯（物理、玩家狀態機、陷阱觸發器）寫成無 DOM 依賴的純模組，用 `node --test` 測試；渲染、輸入、音效為薄薄的 I/O 層。固定 120Hz 物理步 + 渲染插值。

**Tech Stack:** 原生 ES modules、Canvas 2D、WebAudio、Node 內建測試執行器。零 npm 依賴、零建置工具。

## Global Constraints

- 磁磚邊長 `TILE = 16`；地圖固定 30×17 格；邏輯解析度 480×270。
- 不得引入任何 npm 執行期依賴。`package.json` 只設 `"type": "module"` 與 test script。
- 不得引入任何外部圖檔或音檔。像素圖以字串陣列定義，音效以 WebAudio 合成。
- 物理步固定 `1/120` 秒。所有手感常數集中在 `src/game/constants.js`，不得散落。
- 純邏輯模組（`physics.js`、`player.js`、`traps.js`、`constants.js`、`levels/*.js`）**不得** import 任何瀏覽器 API（`document`、`window`、`Audio`），否則 node 測試會爆。
- 手感數值（初版）：最高水平速度 112 px/s、加速 1400 px/s²、煞車 1867 px/s²、跳躍初速 304 px/s、上升重力 900 px/s²、下墜重力 1620 px/s²、土狼時間 0.10 s、跳躍緩衝 0.12 s、玩家碰撞箱 10×14 px。
- 死亡到重生 0.30 秒。
- 每個 task 結束時 `node --test` 必須全綠才能 commit。

---

## 檔案結構

| 檔案 | 職責 |
|---|---|
| `package.json` | `type: module` + test script |
| `index.html` | canvas 外殼與樣式 |
| `src/game/constants.js` | 所有手感／尺寸常數 |
| `src/game/physics.js` | 純函式：磁磚查詢、AABB 移動解算 |
| `src/game/player.js` | 純函式：玩家狀態更新（土狼、緩衝、可變跳躍） |
| `src/game/traps.js` | 純函式：觸發器判定、動作套用 |
| `src/game/world.js` | 關卡執行期狀態（可變地圖、門、玩家、死亡計數） |
| `src/game/levels/level01.js` | 第 1 關資料 |
| `src/engine/loop.js` | 固定時間步 accumulator |
| `src/engine/input.js` | 鍵盤 → `{left,right,jump}` |
| `src/engine/sprites.js` | 像素字串陣列 → offscreen canvas |
| `src/engine/render.js` | 像素完美縮放與繪製 |
| `src/engine/audio.js` | WebAudio 合成音效 |
| `src/main.js` | 組裝：迴圈、場景、死亡重生 |
| `test/*.test.js` | 單元測試 |

---

### Task 1: 專案骨架與測試基礎設施

**Files:**
- Create: `package.json`, `index.html`, `src/game/constants.js`, `test/constants.test.js`

**Interfaces:**
- Produces: `TILE`, `MAP_W`, `MAP_H`, `VIEW_W`, `VIEW_H`, `PHYSICS_DT`, `PLAYER_W`, `PLAYER_H`, `MAX_SPEED`, `ACCEL`, `FRICTION`, `JUMP_SPEED`, `GRAVITY_UP`, `GRAVITY_DOWN`, `JUMP_CUT`, `COYOTE_TIME`, `JUMP_BUFFER`, `RESPAWN_DELAY`（皆為 `src/game/constants.js` 具名匯出的 number）

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "troll-platformer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "dev": "python -m http.server 8080"
  }
}
```

- [ ] **Step 2: 寫失敗的測試 `test/constants.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/game/constants.js';

test('地圖與畫面尺寸互相吻合', () => {
  assert.equal(C.TILE, 16);
  assert.equal(C.MAP_W * C.TILE, C.VIEW_W);
  assert.equal(C.MAP_H * C.TILE, C.VIEW_H);
});

test('下墜重力比上升重力重，跳躍才不會飄', () => {
  assert.ok(C.GRAVITY_DOWN > C.GRAVITY_UP);
});

test('玩家碰撞箱小於一格寬，才鑽得進單格縫隙', () => {
  assert.ok(C.PLAYER_W < C.TILE);
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test test/`
Expected: FAIL — `Cannot find module '../src/game/constants.js'`

- [ ] **Step 4: 建立 `src/game/constants.js`**

```js
export const TILE = 16;
export const MAP_W = 30;
export const MAP_H = 17;
export const VIEW_W = MAP_W * TILE;   // 480
export const VIEW_H = MAP_H * TILE;   // 270

export const PHYSICS_DT = 1 / 120;

export const PLAYER_W = 10;
export const PLAYER_H = 14;

export const MAX_SPEED = 112;      // px/s ＝ 每秒 7 格
export const ACCEL = 1400;         // px/s²，0.08 秒到全速
export const FRICTION = 1867;      // px/s²，0.06 秒煞停
export const JUMP_SPEED = 304;     // px/s，約 3.2 格高
export const GRAVITY_UP = 900;
export const GRAVITY_DOWN = 1620;  // 上升的 1.8 倍
export const JUMP_CUT = 0.4;       // 放開跳躍鍵時上升速度乘以此值
export const COYOTE_TIME = 0.10;
export const JUMP_BUFFER = 0.12;
export const RESPAWN_DELAY = 0.30;
```

- [ ] **Step 5: 建立 `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>搞人遊戲</title>
<style>
  html, body { margin: 0; height: 100%; background: #05060a; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { image-rendering: pixelated; display: block; }
</style>
</head>
<body>
<canvas id="game" width="480" height="270"></canvas>
<script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: 執行測試確認通過**

Run: `node --test test/`
Expected: PASS，3 tests。

- [ ] **Step 7: Commit**

```bash
git add package.json index.html src/game/constants.js test/constants.test.js
git commit -m "feat: 專案骨架與手感常數"
```

---

### Task 2: 磁磚碰撞（physics.js）

**Files:**
- Create: `src/game/physics.js`, `test/physics.test.js`

**Interfaces:**
- Consumes: `TILE` from `constants.js`
- Produces:
  - `isSolid(map, tx, ty) -> boolean`（`map` 為字串陣列，`'#'` 為實心；超出邊界視為實心）
  - `collides(map, box) -> boolean`（`box` 為 `{x,y,w,h}` 像素）
  - `moveAndCollide(map, box, dx, dy) -> { x, y, hitX, hitY }`（`hitX`/`hitY` 為 -1/0/1，表示撞到的方向）
  - `onGround(map, box) -> boolean`

- [ ] **Step 1: 寫失敗的測試 `test/physics.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSolid, collides, moveAndCollide, onGround } from '../src/game/physics.js';

// 10 格寬、5 格高的小地圖，最底下一排是地板
const MAP = [
  '..........',
  '..........',
  '..........',
  '.....#....',
  '##########',
];

test('超出邊界視為實心，玩家不會飛出地圖', () => {
  assert.equal(isSolid(MAP, -1, 0), true);
  assert.equal(isSolid(MAP, 0, -1), true);
  assert.equal(isSolid(MAP, 10, 0), true);
  assert.equal(isSolid(MAP, 0, 0), false);
  assert.equal(isSolid(MAP, 5, 3), true);
});

test('碰撞箱重疊實心格時回報碰撞', () => {
  assert.equal(collides(MAP, { x: 0, y: 0, w: 10, h: 14 }), false);
  assert.equal(collides(MAP, { x: 80, y: 40, w: 10, h: 14 }), true);
});

test('往下移動會停在地板上，不會穿透', () => {
  // 地板在第 4 列，頂端 y = 64。玩家高 14，應停在 y = 50
  const r = moveAndCollide(MAP, { x: 16, y: 48, w: 10, h: 14 }, 0, 10);
  assert.equal(r.y, 50);
  assert.equal(r.hitY, 1);
});

test('往右撞牆會停在牆邊', () => {
  // 牆在第 5 行，左緣 x = 80。玩家寬 10，應停在 x = 70
  const r = moveAndCollide(MAP, { x: 64, y: 48, w: 10, h: 14 }, 12, 0);
  assert.equal(r.x, 70);
  assert.equal(r.hitX, 1);
});

test('往左撞牆會停在牆右緣', () => {
  // 牆右緣 x = 96
  const r = moveAndCollide(MAP, { x: 100, y: 48, w: 10, h: 14 }, -12, 0);
  assert.equal(r.x, 96);
  assert.equal(r.hitX, -1);
});

test('沒撞到東西時原樣移動', () => {
  const r = moveAndCollide(MAP, { x: 16, y: 0, w: 10, h: 14 }, 3, 4);
  assert.equal(r.x, 19);
  assert.equal(r.y, 4);
  assert.equal(r.hitX, 0);
  assert.equal(r.hitY, 0);
});

test('同時撞到牆與地板時兩軸都要解算', () => {
  const r = moveAndCollide(MAP, { x: 64, y: 48, w: 10, h: 14 }, 12, 10);
  assert.equal(r.x, 70);
  assert.equal(r.y, 50);
});

test('onGround 只在腳下一像素有實心時為真', () => {
  assert.equal(onGround(MAP, { x: 16, y: 50, w: 10, h: 14 }), true);
  assert.equal(onGround(MAP, { x: 16, y: 20, w: 10, h: 14 }), false);
});

test('腳下的地板被挖掉後 onGround 立刻變假', () => {
  // 洞挖在第 7 行（避開第 5 行那面牆），玩家正站在洞的正上方
  const holed = MAP.slice();
  holed[4] = '#######.##';
  assert.equal(onGround(holed, { x: 114, y: 50, w: 10, h: 14 }), false);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/physics.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 實作 `src/game/physics.js`**

```js
import { TILE } from './constants.js';

export function isSolid(map, tx, ty) {
  if (ty < 0 || ty >= map.length) return true;
  const row = map[ty];
  if (tx < 0 || tx >= row.length) return true;
  return row[tx] === '#';
}

export function collides(map, box) {
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.floor((box.x + box.w - 1) / TILE);
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.floor((box.y + box.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(map, tx, ty)) return true;
  return false;
}

export function moveAndCollide(map, box, dx, dy) {
  let { x, y } = box;
  const { w, h } = box;
  let hitX = 0, hitY = 0;

  x += dx;
  if (collides(map, { x, y, w, h })) {
    if (dx > 0) { x = Math.floor((x + w) / TILE) * TILE - w; hitX = 1; }
    else if (dx < 0) { x = (Math.floor(x / TILE) + 1) * TILE; hitX = -1; }
  }

  y += dy;
  if (collides(map, { x, y, w, h })) {
    if (dy > 0) { y = Math.floor((y + h) / TILE) * TILE - h; hitY = 1; }
    else if (dy < 0) { y = (Math.floor(y / TILE) + 1) * TILE; hitY = -1; }
  }

  return { x, y, hitX, hitY };
}

export function onGround(map, box) {
  return collides(map, { x: box.x, y: box.y + 1, w: box.w, h: box.h });
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/physics.test.js`
Expected: PASS，9 tests。

- [ ] **Step 5: Commit**

```bash
git add src/game/physics.js test/physics.test.js
git commit -m "feat: AABB 磁磚碰撞"
```

---

### Task 3: 玩家手感（player.js）

**Files:**
- Create: `src/game/player.js`, `test/player.test.js`

**Interfaces:**
- Consumes: `moveAndCollide`, `onGround` from `physics.js`；常數 from `constants.js`
- Produces:
  - `createPlayer(tx, ty) -> player`，player 形狀為
    `{ x, y, w, h, vx, vy, grounded, coyote, buffer, jumpHeld, facing }`
  - `updatePlayer(player, map, input, dt) -> void`（就地修改 player）
    `input` 形狀為 `{ left: boolean, right: boolean, jump: boolean }`

- [ ] **Step 1: 寫失敗的測試 `test/player.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/game/player.js';
import { PHYSICS_DT, MAX_SPEED, TILE } from '../src/game/constants.js';

const FLAT = [
  '..........',
  '..........',
  '..........',
  '..........',
  '##########',
];
const NONE = { left: false, right: false, jump: false };
const RIGHT = { left: false, right: true, jump: false };
const JUMP = { left: false, right: false, jump: true };

function step(p, map, input, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updatePlayer(p, map, input, PHYSICS_DT);
}

test('出生時落在指定格上並貼著地板', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.5);
  assert.equal(p.grounded, true);
  assert.equal(p.y + p.h, 4 * TILE);
});

test('按右鍵會加速到最高速並封頂', () => {
  const p = createPlayer(1, 3);
  step(p, FLAT, RIGHT, 0.5);
  assert.ok(Math.abs(p.vx - MAX_SPEED) < 1);
});

test('放開方向鍵會煞停', () => {
  const p = createPlayer(1, 3);
  step(p, FLAT, RIGHT, 0.3);
  step(p, FLAT, NONE, 0.2);
  assert.equal(p.vx, 0);
});

test('在地面按跳會離地', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  const y0 = p.y;
  step(p, FLAT, JUMP, 0.2);
  assert.ok(p.y < y0 - TILE, `應該跳起來，實際 y 從 ${y0} 變 ${p.y}`);
});

test('跳躍高度約 3 格', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  const y0 = p.y;
  let peak = y0;
  for (let i = 0; i < Math.round(1.0 / PHYSICS_DT); i++) {
    updatePlayer(p, FLAT, JUMP, PHYSICS_DT);
    peak = Math.min(peak, p.y);
  }
  const tiles = (y0 - peak) / TILE;
  assert.ok(tiles > 2.7 && tiles < 3.7, `跳躍高度 ${tiles} 格，應在 2.7~3.7`);
});

test('中途放開跳躍鍵會跳得比較矮', () => {
  const high = createPlayer(2, 3);
  const low = createPlayer(2, 3);
  step(high, FLAT, NONE, 0.2);
  step(low, FLAT, NONE, 0.2);
  const y0 = high.y;
  let hPeak = y0, lPeak = y0;
  for (let i = 0; i < Math.round(1.0 / PHYSICS_DT); i++) {
    updatePlayer(high, FLAT, JUMP, PHYSICS_DT);
    updatePlayer(low, FLAT, i < 10 ? JUMP : NONE, PHYSICS_DT);
    hPeak = Math.min(hPeak, high.y);
    lPeak = Math.min(lPeak, low.y);
  }
  assert.ok(lPeak > hPeak, '短按應該跳得比長按矮');
});

// 平台只到第 2 格，右邊是深不見底的空洞。下方必須留足夠空間，
// 否則玩家掉一下就撞到地圖底部（越界視為實心）又變成著地。
const LEDGE = [
  '..........', '..........', '..........', '..........', '###.......',
  '..........', '..........', '..........', '..........', '..........',
];

// 往右走到腳完全離開平台為止。不能用固定秒數——腳還有一半踩在地上時仍算著地。
function walkOffLedge(p) {
  step(p, LEDGE, NONE, 0.2);
  p.vx = MAX_SPEED;
  let t = 0;
  while (p.grounded && t < 1) {
    updatePlayer(p, LEDGE, RIGHT, PHYSICS_DT);
    t += PHYSICS_DT;
  }
  assert.equal(p.grounded, false, '應該已經走出平台邊緣');
}

test('土狼時間：離開平台邊緣 0.05 秒內仍可跳', () => {
  const p = createPlayer(2, 3);
  walkOffLedge(p);
  step(p, LEDGE, RIGHT, 0.05);
  updatePlayer(p, LEDGE, { left: false, right: true, jump: true }, PHYSICS_DT);
  assert.ok(p.vy < 0, `土狼時間內應該還能跳，vy=${p.vy}`);
});

test('土狼時間過期後不能再跳', () => {
  const p = createPlayer(2, 3);
  walkOffLedge(p);
  step(p, LEDGE, RIGHT, 0.15);          // 超過 0.10 秒的土狼時間
  updatePlayer(p, LEDGE, { left: false, right: true, jump: true }, PHYSICS_DT);
  assert.ok(p.vy > 0, `早就該過期了，應該還在往下掉，vy=${p.vy}`);
});

test('跳躍緩衝：落地前按跳，一落地就自動起跳', () => {
  const p = createPlayer(2, 0);
  step(p, FLAT, NONE, 0.15);            // 空中下墜
  assert.equal(p.grounded, false);
  step(p, FLAT, JUMP, 0.5);             // 一路按著跳
  assert.ok(p.y < 4 * TILE - p.h - TILE, '應該已經彈起來了');
});

test('按住跳躍鍵不會在空中連跳', () => {
  const p = createPlayer(2, 3);
  step(p, FLAT, NONE, 0.2);
  step(p, FLAT, JUMP, 2.0);             // 全程按住
  assert.equal(p.grounded, true, '落地後不該因為按住而再跳');
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/player.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 實作 `src/game/player.js`**

```js
import { moveAndCollide, onGround } from './physics.js';
import {
  TILE, PLAYER_W, PLAYER_H, MAX_SPEED, ACCEL, FRICTION,
  JUMP_SPEED, GRAVITY_UP, GRAVITY_DOWN, JUMP_CUT,
  COYOTE_TIME, JUMP_BUFFER,
} from './constants.js';

export function createPlayer(tx, ty) {
  return {
    x: tx * TILE + (TILE - PLAYER_W) / 2,
    y: ty * TILE + (TILE - PLAYER_H),
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
    facing: 1,
  };
}

export function updatePlayer(p, map, input, dt) {
  // 水平：有輸入就加速，沒輸入就煞車
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    p.facing = dir;
    p.vx += dir * ACCEL * dt;
    if (p.vx > MAX_SPEED) p.vx = MAX_SPEED;
    if (p.vx < -MAX_SPEED) p.vx = -MAX_SPEED;
  } else if (p.vx !== 0) {
    const drop = FRICTION * dt;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - drop) : Math.min(0, p.vx + drop);
  }

  // 跳躍緩衝：只在按下的那一幀記錄
  if (input.jump && !p.jumpHeld) p.buffer = JUMP_BUFFER;
  p.buffer = Math.max(0, p.buffer - dt);

  // 土狼時間
  if (p.grounded) p.coyote = COYOTE_TIME;
  else p.coyote = Math.max(0, p.coyote - dt);

  // 起跳
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_SPEED;
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
  }

  // 可變跳躍高度：上升中放開就切斷
  if (!input.jump && p.jumpHeld && p.vy < 0) p.vy *= JUMP_CUT;
  p.jumpHeld = input.jump;

  // 重力
  p.vy += (p.vy < 0 ? GRAVITY_UP : GRAVITY_DOWN) * dt;

  // 移動與碰撞
  const r = moveAndCollide(map, p, p.vx * dt, p.vy * dt);
  if (r.hitX !== 0) p.vx = 0;
  if (r.hitY !== 0) p.vy = 0;
  p.x = r.x;
  p.y = r.y;
  p.grounded = onGround(map, p);
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/player.test.js`
Expected: PASS，10 tests。若「跳躍高度約 3 格」失敗，調整 `JUMP_SPEED` 而非放寬測試。

- [ ] **Step 5: Commit**

```bash
git add src/game/player.js test/player.test.js
git commit -m "feat: 玩家移動與跳躍手感"
```

---

### Task 4: 陷阱系統（traps.js）

**Files:**
- Create: `src/game/traps.js`, `test/traps.test.js`

**Interfaces:**
- Consumes: `TILE` from `constants.js`
- Produces:
  - `createTrapState(level) -> { fired: boolean[] }`
  - `checkTriggers(level, state, ctx) -> action[]`
    `ctx` 形狀為 `{ px, py, prevX, prevY, time, deaths, jumps, atDoor }`（`px`/`prevX` 為玩家碰撞箱中心的像素座標）
  - `applyAction(world, action) -> void`（`world` 需具備 `map: string[]` 與 `door: {x, y}`）

  觸發器型別：`crossX`（由左往右越線）、`crossY`（由上往下越線）、`enterRect`、`afterDelay`、`deathCount`、`touchDoor`
  動作型別：`removeTiles`、`addTiles`、`moveDoor`

- [ ] **Step 1: 寫失敗的測試 `test/traps.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrapState, checkTriggers, applyAction } from '../src/game/traps.js';
import { TILE } from '../src/game/constants.js';

const LEVEL = {
  traps: [
    { when: { t: 'crossX', x: 5 }, do: [{ t: 'removeTiles', x: 6, y: 4, w: 2, h: 1 }], once: true },
  ],
};

function ctx(over = {}) {
  return { px: 0, py: 0, prevX: 0, prevY: 0, time: 0, deaths: 0, jumps: 0, atDoor: false, ...over };
}

test('crossX 在越線的那一幀觸發', () => {
  const s = createTrapState(LEVEL);
  const before = checkTriggers(LEVEL, s, ctx({ prevX: 4 * TILE, px: 4.5 * TILE }));
  assert.equal(before.length, 0);
  const on = checkTriggers(LEVEL, s, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  assert.equal(on.length, 1);
  assert.deepEqual(on[0], { t: 'removeTiles', x: 6, y: 4, w: 2, h: 1 });
});

test('once 的陷阱不會觸發第二次', () => {
  const s = createTrapState(LEVEL);
  checkTriggers(LEVEL, s, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  const again = checkTriggers(LEVEL, s, ctx({ prevX: 5.2 * TILE, px: 6 * TILE }));
  assert.equal(again.length, 0);
});

test('往回走不會觸發 crossX', () => {
  const s = createTrapState(LEVEL);
  const out = checkTriggers(LEVEL, s, ctx({ prevX: 6 * TILE, px: 4 * TILE }));
  assert.equal(out.length, 0);
});

test('重生時重建狀態，陷阱可以再次觸發', () => {
  const s1 = createTrapState(LEVEL);
  checkTriggers(LEVEL, s1, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  const s2 = createTrapState(LEVEL);
  const out = checkTriggers(LEVEL, s2, ctx({ prevX: 4.9 * TILE, px: 5.2 * TILE }));
  assert.equal(out.length, 1);
});

test('afterDelay 在時間到之後觸發', () => {
  const lv = { traps: [{ when: { t: 'afterDelay', s: 1.5 }, do: [{ t: 'removeTiles', x: 0, y: 0, w: 1, h: 1 }], once: true }] };
  const s = createTrapState(lv);
  assert.equal(checkTriggers(lv, s, ctx({ time: 1.4 })).length, 0);
  assert.equal(checkTriggers(lv, s, ctx({ time: 1.6 })).length, 1);
});

test('deathCount 只在死夠次數後觸發', () => {
  const lv = { traps: [{ when: { t: 'deathCount', n: 3 }, do: [{ t: 'moveDoor', x: 1, y: 1 }], once: true }] };
  const s = createTrapState(lv);
  assert.equal(checkTriggers(lv, s, ctx({ deaths: 2 })).length, 0);
  assert.equal(checkTriggers(lv, s, ctx({ deaths: 3 })).length, 1);
});

test('enterRect 在玩家進入區域時觸發', () => {
  const lv = { traps: [{ when: { t: 'enterRect', x: 2, y: 2, w: 3, h: 3 }, do: [{ t: 'addTiles', x: 0, y: 0, w: 1, h: 1 }], once: true }] };
  const s = createTrapState(lv);
  assert.equal(checkTriggers(lv, s, ctx({ px: 1 * TILE, py: 3 * TILE })).length, 0);
  assert.equal(checkTriggers(lv, s, ctx({ px: 3 * TILE, py: 3 * TILE })).length, 1);
});

test('removeTiles 把地板挖成空氣', () => {
  const world = { map: ['####', '####'], door: { x: 0, y: 0 } };
  applyAction(world, { t: 'removeTiles', x: 1, y: 1, w: 2, h: 1 });
  assert.deepEqual(world.map, ['####', '#..#']);
});

test('addTiles 把空氣填成實心', () => {
  const world = { map: ['....', '....'], door: { x: 0, y: 0 } };
  applyAction(world, { t: 'addTiles', x: 0, y: 1, w: 3, h: 1 });
  assert.deepEqual(world.map, ['....', '###.']);
});

test('moveDoor 位移門的位置', () => {
  const world = { map: ['....'], door: { x: 5, y: 5 } };
  applyAction(world, { t: 'moveDoor', x: 2, y: -1 });
  assert.deepEqual(world.door, { x: 7, y: 4 });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/traps.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 實作 `src/game/traps.js`**

```js
import { TILE } from './constants.js';

export function createTrapState(level) {
  return { fired: new Array(level.traps ? level.traps.length : 0).fill(false) };
}

function triggered(when, ctx) {
  switch (when.t) {
    case 'crossX':
      return ctx.prevX < when.x * TILE && ctx.px >= when.x * TILE;
    case 'crossY':
      return ctx.prevY < when.y * TILE && ctx.py >= when.y * TILE;
    case 'enterRect': {
      const x0 = when.x * TILE, x1 = (when.x + when.w) * TILE;
      const y0 = when.y * TILE, y1 = (when.y + when.h) * TILE;
      return ctx.px >= x0 && ctx.px < x1 && ctx.py >= y0 && ctx.py < y1;
    }
    case 'afterDelay':
      return ctx.time >= when.s;
    case 'deathCount':
      return ctx.deaths >= when.n;
    case 'jumpCount':
      return ctx.jumps >= when.n;
    case 'touchDoor':
      return ctx.atDoor === true;
    default:
      throw new Error(`未知的觸發器型別：${when.t}`);
  }
}

export function checkTriggers(level, state, ctx) {
  const out = [];
  const traps = level.traps || [];
  for (let i = 0; i < traps.length; i++) {
    const trap = traps[i];
    if (trap.once && state.fired[i]) continue;
    if (!triggered(trap.when, ctx)) continue;
    state.fired[i] = true;
    for (const action of trap.do) out.push(action);
  }
  return out;
}

function paint(world, x, y, w, h, ch) {
  for (let ty = y; ty < y + h; ty++) {
    if (ty < 0 || ty >= world.map.length) continue;
    const row = world.map[ty].split('');
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tx >= row.length) continue;
      row[tx] = ch;
    }
    world.map[ty] = row.join('');
  }
}

export function applyAction(world, action) {
  switch (action.t) {
    case 'removeTiles':
      paint(world, action.x, action.y, action.w, action.h, '.');
      break;
    case 'addTiles':
      paint(world, action.x, action.y, action.w, action.h, '#');
      break;
    case 'moveDoor':
      world.door.x += action.x;
      world.door.y += action.y;
      break;
    default:
      throw new Error(`未知的動作型別：${action.t}`);
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/traps.test.js`
Expected: PASS，10 tests。

- [ ] **Step 5: Commit**

```bash
git add src/game/traps.js test/traps.test.js
git commit -m "feat: 陷阱觸發器與動作系統"
```

---

### Task 5: 第 1 關資料與關卡驗證

**Files:**
- Create: `src/game/levels/level01.js`, `src/game/levels/index.js`, `test/levels.test.js`

**Interfaces:**
- Produces:
  - `level01` 預設匯出：`{ id, name, tiles: string[], spawn: [tx,ty], door: [tx,ty], traps: [] }`
  - `src/game/levels/index.js` 具名匯出 `LEVELS: level[]`

- [ ] **Step 1: 寫失敗的測試 `test/levels.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels/index.js';
import { MAP_W, MAP_H, TILE } from '../src/game/constants.js';
import { isSolid } from '../src/game/physics.js';

test('每關的地圖尺寸都正確', () => {
  for (const lv of LEVELS) {
    assert.equal(lv.tiles.length, MAP_H, `第 ${lv.id} 關列數錯誤`);
    for (const row of lv.tiles) assert.equal(row.length, MAP_W, `第 ${lv.id} 關行數錯誤`);
  }
});

test('出生點與門都不在牆裡', () => {
  for (const lv of LEVELS) {
    assert.equal(isSolid(lv.tiles, lv.spawn[0], lv.spawn[1]), false, `第 ${lv.id} 關出生點卡在牆裡`);
    assert.equal(isSolid(lv.tiles, lv.door[0], lv.door[1]), false, `第 ${lv.id} 關門卡在牆裡`);
  }
});

test('出生點腳下有地板，玩家不會一出生就掉下去', () => {
  for (const lv of LEVELS) {
    assert.equal(isSolid(lv.tiles, lv.spawn[0], lv.spawn[1] + 1), true, `第 ${lv.id} 關出生點懸空`);
  }
});

test('陷阱座標都在地圖範圍內', () => {
  for (const lv of LEVELS) {
    for (const trap of lv.traps) {
      for (const a of trap.do) {
        if (a.w === undefined) continue;
        assert.ok(a.x >= 0 && a.x + a.w <= MAP_W, `第 ${lv.id} 關動作超出左右邊界`);
        assert.ok(a.y >= 0 && a.y + a.h <= MAP_H, `第 ${lv.id} 關動作超出上下邊界`);
      }
    }
  }
});

test('第 1 關在陷阱不觸發的前提下是一條直路', () => {
  const lv = LEVELS[0];
  const row = lv.spawn[1] + 1;
  for (let x = lv.spawn[0]; x <= lv.door[0]; x++) {
    assert.equal(isSolid(lv.tiles, x, row), true, `x=${x} 的地板破了，第 1 關不該一開始就有洞`);
  }
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/levels.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 建立 `src/game/levels/level01.js`**

地圖為 17 列 × 30 行。第 0 列天花板、第 14~16 列地板、左右兩側牆。

```js
export default {
  id: 1,
  name: '這什麼幼稚園關卡',
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
  traps: [
    // 走到門前，腳下三格地板無聲消失。不出聲、不預警。
    {
      when: { t: 'crossX', x: 16 },
      do: [{ t: 'removeTiles', x: 17, y: 14, w: 3, h: 3 }],
      once: true,
    },
  ],
};
```

- [ ] **Step 4: 建立 `src/game/levels/index.js`**

```js
import level01 from './level01.js';

export const LEVELS = [level01];
```

- [ ] **Step 5: 執行測試確認通過**

Run: `node --test test/levels.test.js`
Expected: PASS，5 tests。

- [ ] **Step 6: Commit**

```bash
git add src/game/levels/ test/levels.test.js
git commit -m "feat: 第 1 關資料與關卡驗證測試"
```

---

### Task 6: 關卡執行期狀態（world.js）

**Files:**
- Create: `src/game/world.js`, `test/world.test.js`

**Interfaces:**
- Consumes: `createPlayer`/`updatePlayer`、`createTrapState`/`checkTriggers`/`applyAction`、`TILE`、`RESPAWN_DELAY`
- Produces:
  - `createWorld(level) -> world`
    world 形狀：`{ level, map, door: {x,y}, player, trapState, time, deaths, jumps, phase, phaseTimer, events }`
    `phase` 為 `'play' | 'dying' | 'won'`
  - `updateWorld(world, input, dt) -> void`
  - `resetLevel(world) -> void`（重生：復原地圖與陷阱狀態，**保留** `deaths`）

  `world.events` 為本次 update 產生的事件字串陣列（`'jump'`、`'death'`、`'win'`），供音效與畫面特效取用，每次 update 開頭清空。

- [ ] **Step 1: 寫失敗的測試 `test/world.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld, resetLevel } from '../src/game/world.js';
import { LEVELS } from '../src/game/levels/index.js';
import { PHYSICS_DT, TILE, RESPAWN_DELAY } from '../src/game/constants.js';

const NONE = { left: false, right: false, jump: false };
const RIGHT = { left: false, right: true, jump: false };

function run(w, input, seconds) {
  const n = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < n; i++) updateWorld(w, input, PHYSICS_DT);
}

test('世界會複製關卡地圖，不會污染原始資料', () => {
  const w = createWorld(LEVELS[0]);
  w.map[14] = '..............................';
  assert.equal(LEVELS[0].tiles[14], '##############################');
});

test('一直往右走會踩中陷阱，地板消失並掉進洞裡摔死', () => {
  const w = createWorld(LEVELS[0]);
  run(w, RIGHT, 4);
  assert.ok(w.deaths >= 1, `應該死掉，實際 deaths=${w.deaths}`);
});

test('死亡後經過重生延遲會回到出生點，死亡計數保留', () => {
  const w = createWorld(LEVELS[0]);
  run(w, RIGHT, 4);
  const deaths = w.deaths;
  run(w, NONE, RESPAWN_DELAY + 0.1);
  assert.equal(w.phase, 'play');
  assert.equal(w.deaths, deaths);
  assert.ok(Math.abs(w.player.x - (LEVELS[0].spawn[0] * TILE + 3)) < TILE);
});

test('重生會復原被挖掉的地板', () => {
  const w = createWorld(LEVELS[0]);
  run(w, RIGHT, 4);
  resetLevel(w);
  assert.equal(w.map[14], '##############################');
});

test('掉出畫面下緣算死亡', () => {
  const w = createWorld(LEVELS[0]);
  w.map[14] = '#...........................#';
  w.map[15] = '#...........................#';
  w.map[16] = '#...........................#';
  run(w, NONE, 2);
  assert.ok(w.deaths >= 1);
});

test('碰到門就過關', () => {
  const w = createWorld(LEVELS[0]);
  const [dx, dy] = LEVELS[0].door;
  w.player.x = dx * TILE + 4;
  w.player.y = dy * TILE + 2;
  updateWorld(w, NONE, PHYSICS_DT);
  assert.equal(w.phase, 'won');
});

test('死亡事件會出現在 events 裡', () => {
  const w = createWorld(LEVELS[0]);
  let sawDeath = false;
  for (let i = 0; i < Math.round(4 / PHYSICS_DT); i++) {
    updateWorld(w, RIGHT, PHYSICS_DT);
    if (w.events.includes('death')) sawDeath = true;
  }
  assert.equal(sawDeath, true);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/world.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 實作 `src/game/world.js`**

```js
import { createPlayer, updatePlayer } from './player.js';
import { createTrapState, checkTriggers, applyAction } from './traps.js';
import { TILE, VIEW_H, RESPAWN_DELAY } from './constants.js';

export function createWorld(level) {
  const world = {
    level,
    map: level.tiles.slice(),
    door: { x: level.door[0], y: level.door[1] },
    player: createPlayer(level.spawn[0], level.spawn[1]),
    trapState: createTrapState(level),
    time: 0,
    deaths: 0,
    jumps: 0,
    phase: 'play',
    phaseTimer: 0,
    events: [],
  };
  return world;
}

export function resetLevel(world) {
  world.map = world.level.tiles.slice();
  world.door = { x: world.level.door[0], y: world.level.door[1] };
  world.player = createPlayer(world.level.spawn[0], world.level.spawn[1]);
  world.trapState = createTrapState(world.level);
  world.time = 0;
  world.jumps = 0;
  world.phase = 'play';
  world.phaseTimer = 0;
}

function touchingDoor(world) {
  const p = world.player;
  const dx = world.door.x * TILE, dy = world.door.y * TILE;
  return p.x + p.w > dx && p.x < dx + TILE * 2 && p.y + p.h > dy && p.y < dy + TILE * 2;
}

function kill(world) {
  if (world.phase !== 'play') return;
  world.phase = 'dying';
  world.phaseTimer = RESPAWN_DELAY;
  world.deaths += 1;
  world.events.push('death');
}

export function updateWorld(world, input, dt) {
  world.events = [];

  if (world.phase === 'dying') {
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      const deaths = world.deaths;
      resetLevel(world);
      world.deaths = deaths;
    }
    return;
  }
  if (world.phase === 'won') return;

  const p = world.player;
  const prevX = p.x + p.w / 2;
  const prevY = p.y + p.h / 2;
  const wasGrounded = p.grounded;

  world.time += dt;
  updatePlayer(p, world.map, input, dt);

  if (wasGrounded && p.vy < 0) {
    world.jumps += 1;
    world.events.push('jump');
  }

  const actions = checkTriggers(world.level, world.trapState, {
    px: p.x + p.w / 2,
    py: p.y + p.h / 2,
    prevX,
    prevY,
    time: world.time,
    deaths: world.deaths,
    jumps: world.jumps,
    atDoor: touchingDoor(world),
  });
  for (const a of actions) applyAction(world, a);

  if (p.y > VIEW_H + TILE) { kill(world); return; }

  if (touchingDoor(world) && world.phase === 'play') {
    world.phase = 'won';
    world.events.push('win');
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/world.test.js`
Expected: PASS，7 tests。

- [ ] **Step 5: Commit**

```bash
git add src/game/world.js test/world.test.js
git commit -m "feat: 關卡執行期狀態與死亡重生循環"
```

---

### Task 7: 輸入與主迴圈

**Files:**
- Create: `src/engine/input.js`, `src/engine/loop.js`, `test/loop.test.js`

**Interfaces:**
- Produces:
  - `createInput(target) -> { state: {left,right,jump}, restart: boolean, consumeRestart(), destroy() }`
  - `stepAccumulator(acc, frameTime, dt) -> { steps, rest }`（純函式，可測試）
  - `startLoop(onStep, onRender) -> stop()`（瀏覽器端，用 `requestAnimationFrame`）

- [ ] **Step 1: 寫失敗的測試 `test/loop.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepAccumulator } from '../src/engine/loop.js';

test('累積不足一步時不推進', () => {
  const r = stepAccumulator(0, 0.005, 1 / 120);
  assert.equal(r.steps, 0);
  assert.ok(Math.abs(r.rest - 0.005) < 1e-9);
});

test('一幀 60fps 推進兩步 120Hz 物理', () => {
  const r = stepAccumulator(0, 1 / 60, 1 / 120);
  assert.equal(r.steps, 2);
});

test('卡頓時限制最多推進 8 步，避免死亡螺旋', () => {
  const r = stepAccumulator(0, 5, 1 / 120);
  assert.equal(r.steps, 8);
  assert.equal(r.rest, 0);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/loop.test.js`
Expected: FAIL — 找不到模組。

- [ ] **Step 3: 實作 `src/engine/loop.js`**

```js
const MAX_STEPS = 8;

export function stepAccumulator(acc, frameTime, dt) {
  let rest = acc + frameTime;
  let steps = 0;
  while (rest >= dt && steps < MAX_STEPS) {
    rest -= dt;
    steps++;
  }
  if (steps === MAX_STEPS) rest = 0;
  return { steps, rest };
}

export function startLoop(onStep, onRender, dt) {
  let acc = 0;
  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    const frameTime = Math.min((now - last) / 1000, 0.25);
    last = now;
    const r = stepAccumulator(acc, frameTime, dt);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) onStep(dt);
    onRender(acc / dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return () => { running = false; };
}
```

- [ ] **Step 4: 實作 `src/engine/input.js`**

```js
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
};

export function createInput(target = window) {
  const state = { left: false, right: false, jump: false };
  const api = { state, restart: false, consumeRestart, destroy };

  function onKey(down) {
    return (e) => {
      if (e.code === 'KeyR') { if (down) api.restart = true; return; }
      const action = KEYS[e.code];
      if (!action) return;
      e.preventDefault();
      state[action] = down;
    };
  }
  const kd = onKey(true), ku = onKey(false);
  const blur = () => { state.left = state.right = state.jump = false; };

  target.addEventListener('keydown', kd);
  target.addEventListener('keyup', ku);
  target.addEventListener('blur', blur);

  function consumeRestart() {
    const r = api.restart;
    api.restart = false;
    return r;
  }
  function destroy() {
    target.removeEventListener('keydown', kd);
    target.removeEventListener('keyup', ku);
    target.removeEventListener('blur', blur);
  }
  return api;
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `node --test test/`
Expected: PASS，全部測試綠燈。

- [ ] **Step 6: Commit**

```bash
git add src/engine/loop.js src/engine/input.js test/loop.test.js
git commit -m "feat: 固定時間步主迴圈與鍵盤輸入"
```

---

### Task 8: 像素圖與渲染

**Files:**
- Create: `src/engine/sprites.js`, `src/engine/render.js`

**Interfaces:**
- Consumes: `constants.js`
- Produces:
  - `bakeSprite(rows, palette) -> HTMLCanvasElement`
  - `SPRITES` 具名匯出：`{ player, door }`（延遲初始化，呼叫 `initSprites()` 後可用）
  - `createRenderer(canvas) -> { resize(), draw(world, alpha, shake) }`

- [ ] **Step 1: 實作 `src/engine/sprites.js`**

```js
export function bakeSprite(rows, palette) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const PLAYER_ROWS = [
  '..1111..',
  '.111111.',
  '.131131.',
  '.111111.',
  '..1111..',
  '2.2222.2',
  '22222222',
  '.222222.',
  '.222222.',
  '.44..44.',
  '.44..44.',
  '333..333',
];
const PLAYER_PAL = { 1: '#f2f2f7', 2: '#e04b4b', 3: '#14161f', 4: '#3a6ea5' };

export const SPRITES = {};

export function initSprites() {
  SPRITES.player = bakeSprite(PLAYER_ROWS, PLAYER_PAL);
}
```

> 門不做成 sprite——它之後要會移動、開闔、變成假門，用幾何繪製（見 render.js）比較好改。

- [ ] **Step 2: 實作 `src/engine/render.js`**

```js
import { TILE, VIEW_W, VIEW_H } from '../game/constants.js';
import { SPRITES } from './sprites.js';

const C = {
  bg: '#12141f',
  grid: '#181b28',
  void: '#05060a',
  tile: '#39406b',
  tileTop: '#5f6ea8',
  tileDot: '#2c3157',
  ui: '#6f779b',
  uiHot: '#e04b4b',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function resize() {
    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth / VIEW_W,
      window.innerHeight / VIEW_H,
    )));
    canvas.style.width = `${VIEW_W * scale}px`;
    canvas.style.height = `${VIEW_H * scale}px`;
  }

  function drawTile(map, x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = C.tile;
    ctx.fillRect(px, py, TILE, TILE);
    if (y === 0 || map[y - 1][x] !== '#') {
      ctx.fillStyle = C.tileTop;
      ctx.fillRect(px, py, TILE, 3);
    }
    ctx.fillStyle = C.tileDot;
    ctx.fillRect(px + 3, py + 8, 2, 2);
    ctx.fillRect(px + 10, py + 12, 2, 2);
  }

  function drawDoor(dx, dy) {
    const px = dx * TILE, py = dy * TILE;
    ctx.fillStyle = 'rgba(120,220,140,0.10)';
    ctx.fillRect(px - 6, py - 6, 44, 40);
    ctx.fillStyle = '#241608';
    ctx.fillRect(px, py, 32, 32);
    ctx.fillStyle = '#7a4b26';
    ctx.fillRect(px + 2, py + 3, 28, 29);
    ctx.fillStyle = '#9c6033';
    ctx.fillRect(px + 5, py + 7, 9, 10);
    ctx.fillRect(px + 18, py + 7, 9, 10);
    ctx.fillRect(px + 5, py + 20, 9, 8);
    ctx.fillRect(px + 18, py + 20, 9, 8);
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(px + 24, py + 18, 3, 3);
  }

  function draw(world, alpha, shake) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (shake > 0) {
      ctx.translate(
        Math.round((Math.random() - 0.5) * shake),
        Math.round((Math.random() - 0.5) * shake),
      );
    }

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = C.grid;
    for (let y = 1; y < 14; y++)
      for (let x = 1; x < 29; x++)
        if ((x + y) % 2 === 0) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

    const map = world.map;
    for (let y = 0; y < map.length; y++)
      for (let x = 0; x < map[y].length; x++)
        if (map[y][x] === '#') drawTile(map, x, y);

    drawDoor(world.door.x, world.door.y);

    if (world.phase !== 'dying') {
      const p = world.player;
      ctx.drawImage(SPRITES.player, Math.round(p.x - 1), Math.round(p.y - 2));
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ui;
    ctx.fillText(`LEVEL ${world.level.id}`, 8, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = world.deaths > 0 ? C.uiHot : C.ui;
    ctx.fillText(`DEATHS ${world.deaths}`, VIEW_W - 8, 12);
    ctx.textAlign = 'left';
  }

  resize();
  window.addEventListener('resize', resize);
  return { resize, draw };
}
```

- [ ] **Step 3: 執行既有測試確認沒被弄壞**

Run: `node --test test/`
Expected: PASS，全綠（渲染層無單元測試，靠 Task 9 的手動驗收）。

- [ ] **Step 4: Commit**

```bash
git add src/engine/sprites.js src/engine/render.js
git commit -m "feat: 像素 sprite 烘焙與渲染層"
```

---

### Task 9: 組裝、音效與手動驗收

**Files:**
- Create: `src/engine/audio.js`, `src/main.js`

**Interfaces:**
- Consumes: 前面所有模組
- Produces: `createAudio() -> { play(name) }`，`name` 為 `'jump' | 'death' | 'win'`

- [ ] **Step 1: 實作 `src/engine/audio.js`**

```js
export function createAudio() {
  let ac = null;

  function ensure() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, endFreq, dur, type, gain) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function noise(dur, gain) {
    const c = ensure();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(c.destination);
    src.start();
  }

  function play(name) {
    try {
      if (name === 'jump') tone(320, 620, 0.10, 'square', 0.06);
      else if (name === 'death') { noise(0.25, 0.12); tone(300, 60, 0.30, 'sawtooth', 0.07); }
      else if (name === 'win') {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'square', 0.07), i * 90));
      }
    } catch { /* 音效失敗不該讓遊戲停下來 */ }
  }

  return { play };
}
```

- [ ] **Step 2: 實作 `src/main.js`**

```js
import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createWorld, updateWorld, resetLevel } from './game/world.js';
import { createInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { initSprites } from './engine/sprites.js';
import { createRenderer } from './engine/render.js';
import { createAudio } from './engine/audio.js';

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

initSprites();
const renderer = createRenderer(canvas);
const input = createInput(window);
const audio = createAudio();

let world = createWorld(LEVELS[0]);
let shake = 0;

function step(dt) {
  if (input.consumeRestart()) {
    const deaths = world.deaths;
    resetLevel(world);
    world.deaths = deaths;
  }
  updateWorld(world, input.state, dt);
  for (const e of world.events) {
    audio.play(e);
    if (e === 'death') shake = 5;
  }
  shake = Math.max(0, shake - dt * 20);
}

function render(alpha) {
  renderer.draw(world, alpha, shake);
}

startLoop(step, render, PHYSICS_DT);
```

- [ ] **Step 3: 開伺服器手動驗收**

Run: `python -m http.server 8080`，瀏覽器開 `http://localhost:8080`。

依序確認：
1. 畫面出現一條走廊、左邊小人、右邊木門，右上角 `DEATHS 0`。
2. 按住 → 一路往右走，走到門前地板**無聲**消失，小人掉下去。
3. 掉出畫面後約 0.3 秒回到起點，`DEATHS 1`，地板已復原。
4. 這次走到洞前按空白鍵跳過去，能碰到門，播放勝利音效，畫面停住（過關）。
5. 按 R 可隨時重來。
6. 跳躍手感確認：短按跳得矮、長按跳得高；從平台邊緣走出去後極短時間內仍跳得起來。

若第 4 點跳不過洞，把 `level01.js` 的陷阱寬度從 `w: 3` 調小，或提高 `JUMP_SPEED`——**不要**縮小洞到玩家可以直接走過去。

- [ ] **Step 4: 執行全部測試**

Run: `node --test test/`
Expected: PASS，全綠。

- [ ] **Step 5: Commit**

```bash
git add src/engine/audio.js src/main.js
git commit -m "feat: 組裝主程式與合成音效，第 1 關可玩"
```

---

## 完成定義

- `node --test test/` 全綠。
- 瀏覽器開啟後，第 1 關可以完整經歷「被騙 → 死亡 → 重生 → 學會 → 過關」。
- 沒有任何 npm 依賴、外部圖檔或音檔。

## 不在本計畫範圍

- 觸控輸入、標題畫面、關卡選擇、存檔、結算分享（Plan 3）
- 第 2〜12 關與其餘陷阱動作（Plan 2）
- 死亡時的像素爆散粒子（Plan 2 一併做，本計畫先用畫面震動代替）
