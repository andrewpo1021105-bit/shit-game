import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createSession, updateSession, restartLevel } from './game/session.js';
import { createInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { initSprites } from './engine/sprites.js';
import { createRenderer } from './engine/render.js';
import { createAudio } from './engine/audio.js';

// 走到這一行就代表模組載得起來。把「遊戲沒有啟動」那塊說明收掉。
document.getElementById('boot')?.remove?.();

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

initSprites();
const renderer = createRenderer(canvas);
const input = createInput(window);
const audio = createAudio();

const session = createSession(LEVELS);
let shake = 0;

function step(dt) {
  if (input.consumeRestart()) restartLevel(session);
  // 報告是要傳給朋友的，所以一定要複製得走
  if (input.consumeCopy() && session.phase === 'finished') {
    const text = [`搞人遊戲 — 總共死了 ${session.totalDeaths} 次`, ...session.report].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  updateSession(session, input.state, dt);
  for (const e of session.world.events) {
    audio.play(e);
    if (e === 'death') shake = 5;
    if (e === 'spike') shake = 3;
    if (e === 'thud') shake = 4;
    if (e === 'flip') shake = 6;
  }
  shake = Math.max(0, shake - dt * 20);
}

function render() {
  renderer.draw(session, shake);
}

startLoop(step, render, PHYSICS_DT);
