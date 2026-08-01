import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/game/constants.js';
import { LEVELS } from '../src/game/levels/index.js';

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

// 排行榜門檻。這個數字寫錯的代價是不對稱的：訂太低只是漏掉幾個作弊的，
// 訂太高會把老實跑完的人擋在榜外，而他不會知道自己為什麼不見了。
test('排行榜門檻是一分鐘', () => {
  assert.equal(C.MIN_BOARD_TIME, 60);
});

test('門檻遠低於一關一關走完所需的時間，不會擋到老實玩的人', () => {
  // 計時只算你操作得到的時間（轉場不算）。這個估計值假設每一關都要用最高速
  // 從左邊走到右邊，不死、不停、不轉彎。
  //
  // 它不是真正的下限：實測榜上有 65 秒的成績，比這個數字還快——關卡的終點
  // 未必在最右邊，而創造者模式（N/B）本來就能跳過整關。這正是門檻要擋的東西。
  // 所以這裡只當「門檻有沒有離譜地接近正常遊玩時間」的警報線：關卡數變多、
  // 速度上限調高之後如果反而逼近門檻，那一定是有人算錯了。
  const walkAcross = LEVELS.length * (C.VIEW_W / C.MAX_SPEED);
  assert.ok(C.MIN_BOARD_TIME < walkAcross * 0.8,
    `門檻 ${C.MIN_BOARD_TIME} 秒已經逼近走完全程的 ${walkAcross.toFixed(1)} 秒，會擋到正常玩家`);
});
