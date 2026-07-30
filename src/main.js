import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createSession, updateSession, restartLevel, jumpLevel } from './game/session.js';
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

// 開場畫面。按方向鍵或跳躍才進遊戲——計時也從那一刻才開始跑。
let started = false;
let introT = 0;

// 創造者模式:在開場畫面把密碼打完就解鎖,N/B 可以跳關。
// 密碼裡的 A、D、W 跟移動鍵重疊,所以「正在輸入密碼」的期間
// 這些鍵不算開始遊戲——打錯字歸零之後它們才恢復原本的身分。
const PASSWORD = 'ANDREW1105';
let pwProgress = 0;
let creatorMode = false;
let wantStart = false;
const START_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'KeyW', 'KeyA', 'KeyD']);

window.addEventListener('keydown', (e) => {
  if (started) return;
  const ch = e.key.length === 1 ? e.key.toUpperCase() : null;
  if (ch) {
    pwProgress = PASSWORD[pwProgress] === ch ? pwProgress + 1 : (PASSWORD[0] === ch ? 1 : 0);
    if (pwProgress === PASSWORD.length) {
      creatorMode = true;
      pwProgress = 0;
      audio.play('win');
      return;   // 解鎖的那一鍵不當作開始
    }
    if (pwProgress > 0) return;   // 密碼打到一半,先不開始
  }
  if (START_KEYS.has(e.code)) wantStart = true;
});

function step(dt) {
  // M 靜音/開音樂,開場中也有效
  if (input.consumeMute()) audio.toggleMusic();
  if (!started) {
    introT += dt;
    if (wantStart) {
      started = true;
      // 瀏覽器規定要有使用者手勢才准出聲——開始遊戲的這一下正好
      audio.startMusic();
    }
    input.consumeRestart();   // 開場按 R 不該累積成遊戲裡的重來
    return;
  }
  // 跳關是創造者的特權;不是創造者的話,把按鍵吃掉當作沒發生
  if (creatorMode) {
    if (input.consumeNext()) jumpLevel(session, 1);
    if (input.consumeBack()) jumpLevel(session, -1);
  } else {
    input.consumeNext();
    input.consumeBack();
  }
  if (input.consumeRestart()) restartLevel(session);
  // 戰績是要傳給朋友的，所以一定要複製得走
  if (input.consumeCopy() && session.phase === 'finished') {
    const text = `搞人遊戲 — 總共死了 ${session.totalDeaths} 次,花了 ${fmtTime(session.totalTime)}`;
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
  if (!started) { renderer.drawIntro(introT, creatorMode); return; }
  session.world.creator = creatorMode;   // HUD 要畫創造者徽章
  renderer.draw(session, shake);
}

startLoop(step, render, PHYSICS_DT);
