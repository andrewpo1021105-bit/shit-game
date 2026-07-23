import test from 'node:test';
import assert from 'node:assert/strict';

// 用假的瀏覽器環境把整個遊戲真的跑起來。
// 這是唯一會踩到 render.js / main.js / input.js 的測試——
// 純邏輯的單元測試碰不到它們，連「import 了不存在的匯出」這種
// 會讓整個畫面變全黑的連結期錯誤都攔不到。
function stubBrowser(frameBudget) {
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return canvasStub();
      if (typeof prop === 'string' && prop in target) return target[prop];
      return () => {};
    },
    set() { return true; },
  });

  function canvasStub() {
    return { width: 0, height: 0, style: {}, getContext: () => ctx };
  }

  let frames = 0;
  let clock = 0;

  globalThis.document = {
    createElement: () => canvasStub(),
    getElementById: () => canvasStub(),
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 720,
    AudioContext: function AudioContext() { throw new Error('測試環境不開音效'); },
  };
  globalThis.performance = { now: () => (clock += 16.7) };
  globalThis.requestAnimationFrame = (fn) => {
    if (frames++ >= frameBudget) return 0;
    fn(clock);
    return frames;
  };
  return () => frames;
}

test('整個遊戲載得起來，而且能連跑數百幀不炸', async () => {
  const framesRun = stubBrowser(400);
  // 每次測試都要拿到全新的模組實體，否則第二次 import 會走快取
  await import(`../src/main.js?smoke=${Date.now()}`);
  assert.ok(framesRun() > 100, `只跑了 ${framesRun()} 幀，主迴圈可能沒有真的動起來`);
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
