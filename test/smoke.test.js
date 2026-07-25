import test from 'node:test';
import assert from 'node:assert/strict';
import { stubBrowser } from './helpers/browser-stub.js';

// 用假的瀏覽器環境把整個遊戲真的跑起來。
// 這是唯一會踩到 render.js / main.js / input.js 的測試——
// 純邏輯的單元測試碰不到它們，連「import 了不存在的匯出」這種
// 會讓整個畫面變全黑的連結期錯誤都攔不到。

test('整個遊戲載得起來，而且能連跑數百幀不炸', async () => {
  const framesRun = stubBrowser(400);
  // 每次測試都要拿到全新的模組實體，否則第二次 import 會走快取
  await import(`../src/main.js?smoke=${Date.now()}`);
  assert.ok(framesRun() > 100, `只跑了 ${framesRun()} 幀，主迴圈可能沒有真的動起來`);
});

// 主迴圈只跑得到第 1 關的正常畫面。新加的三條繪製路徑
// （側寫面板、反轉時的鏡像編號、結算報告）在那裡一次都不會被執行到，
// 所以這裡直接叫 renderer 把它們畫一遍——至少確保它們不會炸。
test('側寫面板、反轉提示與結算報告都畫得出來', async () => {
  stubBrowser(1);
  const { createRenderer } = await import(`../src/engine/render.js?smoke=${Date.now()}`);
  const { createSession, updateSession } = await import('../src/game/session.js');
  const { LEVELS } = await import('../src/game/levels/index.js');
  const { PHYSICS_DT } = await import('../src/game/constants.js');

  const renderer = createRenderer(document.getElementById('game'));
  const session = createSession(LEVELS);

  // 第 9 關的側寫面板
  session.world = createSession([LEVELS.find((l) => l.id === 9)]).world;
  assert.equal(session.world.level.showProfile, true);
  renderer.draw(session, 0);

  // 反轉時關卡編號是鏡像的
  session.world.flipped = true;
  renderer.draw(session, 2);

  // 結算報告，而且要畫到每一行都打完為止
  const solo = createSession([LEVELS[0]]);
  solo.phase = 'finished';
  solo.report = ['第一行', '第二行', '第三行'];
  for (const t of [0, 0.5, 1.5, 3, 6]) {
    solo.timer = t;
    renderer.draw(solo, 0);
  }
  updateSession(solo, { left: false, right: false, jump: false }, PHYSICS_DT);
});

test('每一支瀏覽器端模組都 import 得起來', async () => {
  stubBrowser(1);
  for (const path of [
    '../src/engine/render.js',
    '../src/engine/sprites.js',
    '../src/engine/audio.js',
    '../src/engine/input.js',
    '../src/engine/loop.js',
  ]) {
    await import(`${path}?smoke=${Date.now()}`);
  }
});
