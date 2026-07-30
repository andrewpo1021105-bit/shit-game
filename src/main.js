import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createSession, updateSession, restartLevel } from './game/session.js';
import { createInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { initSprites } from './engine/sprites.js';
import { createRenderer, fmtTime } from './engine/render.js';
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

// 通關時間排行榜。存在 localStorage——沒有伺服器,你的對手是過去的自己。
// 存取只發生在這裡:邏輯模組不准碰瀏覽器 API,這是它們保持可測的代價。
const BOARD_KEY = '搞人遊戲-排行榜';
let recorded = false;

function recordRun() {
  const now = new Date();
  const entry = {
    time: Math.round(session.totalTime * 10) / 10,
    deaths: session.totalDeaths,
    date: `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
  let board = [];
  try { board = JSON.parse(localStorage.getItem(BOARD_KEY)) ?? []; } catch { /* 隱私模式沒得存 */ }
  board.push(entry);
  // 時間快的贏;同秒數死得少的贏
  board.sort((a, b) => a.time - b.time || a.deaths - b.deaths);
  board = board.slice(0, 10);
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch { /* 一樣,認了 */ }
  session.leaderboard = board;
  session.lastEntry = entry;   // entry 就在 board 裡,畫排行榜時用身分比對挑出這一筆
}

function step(dt) {
  if (input.consumeRestart()) restartLevel(session);
  // 報告是要傳給朋友的，所以一定要複製得走
  if (input.consumeCopy() && session.phase === 'finished') {
    const text = [
      `搞人遊戲 — 總共死了 ${session.totalDeaths} 次,花了 ${fmtTime(session.totalTime)}`,
      ...session.report,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  updateSession(session, input.state, dt);
  if (session.phase === 'finished' && !recorded) {
    recorded = true;
    recordRun();
  }
  for (const e of session.world.events) {
    audio.play(e);
    if (e === 'death') shake = 5;
    if (e === 'spike') shake = 3;
    if (e === 'thud') shake = 4;
    if (e === 'flip') shake = 6;
    if (e === 'lock') shake = 3;
    if (e === 'glitch') shake = 7;
  }
  shake = Math.max(0, shake - dt * 20);
}

function render() {
  renderer.draw(session, shake);
}

startLoop(step, render, PHYSICS_DT);
