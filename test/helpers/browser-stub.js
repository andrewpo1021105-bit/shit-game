// 假的瀏覽器環境，讓 render.js / main.js / input.js 這些碰得到 DOM 的模組
// 能在 node --test 裡真的跑起來。純邏輯的單元測試碰不到它們，
// 連「import 了不存在的匯出」這種會讓整個畫面變全黑的錯誤都攔不到。
export function stubBrowser(frameBudget) {
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
