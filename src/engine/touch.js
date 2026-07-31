import { VIEW_W, VIEW_H } from '../game/constants.js';

// 觸控操作。按鈕全部畫在 canvas 上(render.js 負責畫),
// 這裡只負責「哪根手指壓在哪個區域」。座標一律換算成畫布座標
// (480×270),跟 render 說同一種語言,兩邊永遠對得上。
export const ZONES = {
  left: { x: 6, y: 198, w: 54, h: 66 },
  right: { x: 68, y: 198, w: 54, h: 66 },
  jump: { x: 396, y: 192, w: 76, h: 72 },
  attack: { x: 330, y: 204, w: 56, h: 60 },   // 撿到劍之後才會亮出來
  restart: { x: 222, y: 240, w: 36, h: 26 },
  mute: { x: 444, y: 18, w: 30, h: 22 },
};

// 開場「你用什麼玩?」的兩顆大按鈕,render 畫、main 判定,共用這一份座標
export const ASK = {
  mobile: { x: 70, y: 142, w: 154, h: 56 },
  desktop: { x: 256, y: 142, w: 154, h: 56 },
};

export function createTouch(canvas, onTap) {
  const state = { left: false, right: false, jump: false, attack: false };
  const api = {
    state,
    enabled: false,        // 選了「手機/平板」才會開
    attackZone: false,     // 撿到劍(打鬥模式)才啟用 ⚔ 區,平常那裡不是按鈕
    pressed: {},           // render 用來把按下去的按鈕畫亮
    restart: false,
    mute: false,
    consumeRestart, consumeMute,
  };
  const pointers = new Map();

  // 測試環境的假 canvas 沒有事件系統——那就當作沒有觸控,安靜退場
  if (!canvas.addEventListener) return api;

  // getBoundingClientRect 會逼瀏覽器重算版面,拇指一滑就是幾十次——
  // 手機會卡。畫布位置只有轉向/縮放時才變,快取起來,resize 才重算。
  let rect = null;
  const dropRect = () => { rect = null; };
  window.addEventListener?.('resize', dropRect);
  window.addEventListener?.('orientationchange', dropRect);

  function toCanvas(e) {
    if (!rect) rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * VIEW_W) / rect.width,
      ((e.clientY - rect.top) * VIEW_H) / rect.height,
    ];
  }

  function zoneAt(x, y) {
    for (const [name, z] of Object.entries(ZONES)) {
      // ⚔ 區只在打鬥模式存在,平常不能當一塊看不見的死區吃掉觸摸
      if (name === 'attack' && !api.attackZone) continue;
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return name;
    }
    return null;
  }

  function refresh() {
    state.left = false;
    state.right = false;
    state.jump = false;
    state.attack = false;
    api.pressed = {};
    for (const z of pointers.values()) {
      if (!z) continue;
      if (z === 'left' || z === 'right' || z === 'jump' || z === 'attack') state[z] = true;
      api.pressed[z] = true;
    }
  }

  function down(e) {
    e.preventDefault();
    const [x, y] = toCanvas(e);
    onTap?.(x, y);
    if (!api.enabled) return;
    const z = zoneAt(x, y);
    if (z === 'restart') api.restart = true;
    if (z === 'mute') api.mute = true;
    pointers.set(e.pointerId, z);
    refresh();
  }

  function move(e) {
    if (!api.enabled || !pointers.has(e.pointerId)) return;
    const [x, y] = toCanvas(e);
    // 手指滑出按鈕就放開——沒有這個,拇指一滑就會卡在「一直往右」
    pointers.set(e.pointerId, zoneAt(x, y));
    refresh();
  }

  function up(e) {
    pointers.delete(e.pointerId);
    refresh();
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function consumeRestart() {
    const r = api.restart;
    api.restart = false;
    return r;
  }
  function consumeMute() {
    const m = api.mute;
    api.mute = false;
    return m;
  }
  return api;
}
