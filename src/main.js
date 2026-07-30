import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createSession, updateSession, restartLevel, jumpLevel } from './game/session.js';
import { createInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { initSprites } from './engine/sprites.js';
import { createRenderer, fmtTime } from './engine/render.js';
import { createAudio } from './engine/audio.js';
import { createTouch, ASK } from './engine/touch.js';
import { BOARD_URL } from './engine/board-url.js';

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

// 通關時間排行榜。全球共用一份(jsonblob),所有人的成績都上同一張榜;
// localStorage 只當離線備援。存取只發生在這裡:
// 邏輯模組不准碰瀏覽器 API,這是它們保持可測的代價。
const BOARD_KEY = '搞人遊戲-排行榜';
const NAME_KEY = '搞人遊戲-名字';
let recorded = false;

function playerName() {
  let n = null;
  try { n = localStorage.getItem(NAME_KEY); } catch { /* 隱私模式 */ }
  if (!n) {
    n = (window.prompt?.('留下名字,上全球排行榜(最多 10 個字):', '') || '匿名')
      .trim().slice(0, 10) || '匿名';
    try { localStorage.setItem(NAME_KEY, n); } catch { /* 認了 */ }
  }
  return n;
}

// 抓下來、把自己的成績塞進去、整包寫回去。
// 兩個人同一秒寫會有一筆被蓋掉——玩具排行榜,先寫先贏,不上鎖。
async function syncBoard(entry) {
  const res = await fetch(BOARD_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  let list = await res.json();
  if (!Array.isArray(list)) list = [];
  if (entry) {
    list.push(entry);
    // 時間快的贏;同秒數死得少的贏
    list.sort((a, b) => a.time - b.time || a.deaths - b.deaths);
    list = list.slice(0, 100);
    await fetch(BOARD_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list),
    });
  }
  return list;
}

function recordRun() {
  const now = new Date();
  const entry = {
    name: playerName(),
    time: Math.round(session.totalTime * 10) / 10,
    deaths: session.totalDeaths,
    date: `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    // 打贏 BOSS 的人,排行榜名字前面掛星——用走完 18 關的時間跟
    // 只走 17 關的人比並不公平,這顆星就是「不公平在哪」的說明
    boss: session.bossCleared === true,
  };
  session.lastKey = `${entry.name}|${entry.time}|${entry.deaths}`;

  // 本機備份照舊——雲端掛了至少還有自己的紀錄可以看
  let board = [];
  try { board = JSON.parse(localStorage.getItem(BOARD_KEY)) ?? []; } catch { /* 隱私模式沒得存 */ }
  board.push(entry);
  board.sort((a, b) => a.time - b.time || a.deaths - b.deaths);
  board = board.slice(0, 10);
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch { /* 一樣,認了 */ }
  session.leaderboard = board;
  session.boardStatus = 'loading';

  syncBoard(entry)
    .then((list) => { session.leaderboard = list; session.boardStatus = 'ok'; })
    .catch(() => { session.boardStatus = 'offline'; });
}

// 開場分三頁:先問你用什麼裝置(ask)→ 標題畫面(title)→ 遊戲。
// 手機/平板選下去就開觸控按鈕;計時一樣從真正開始的那一刻才跑。
let stage = 'ask';           // 'ask' | 'title'
let mobileMode = false;
let started = false;
let introT = 0;
let tapCopy = false;

// 這台裝置看起來有沒有觸控——只拿來把建議的按鈕框亮,不替使用者決定
const touchy = (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0)
  || ('ontouchstart' in window);

const touch = createTouch(canvas, (x, y) => {
  if (stage === 'ask') {
    const hit = (z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
    if (hit(ASK.mobile)) { mobileMode = true; touch.enabled = true; stage = 'title'; }
    else if (hit(ASK.desktop)) { mobileMode = false; stage = 'title'; }
    return;
  }
  if (!started) { wantStart = true; return; }
  // 結算畫面:點一下就複製戰績,手機沒有 C 鍵
  if (session.phase === 'finished') tapCopy = true;
});

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
  // 詢問頁按到鍵盤,那答案很明顯就是「電腦鍵盤」
  if (stage === 'ask') {
    mobileMode = false;
    stage = 'title';
    return;
  }
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
  // M 靜音/開音樂,開場中也有效;手機用畫面右上角的 ♪ 鈕
  if (input.consumeMute() || touch.consumeMute()) audio.toggleMusic();
  if (!started) {
    introT += dt;
    if (stage === 'title' && wantStart) {
      started = true;
      // 瀏覽器規定要有使用者手勢才准出聲——開始遊戲的這一下正好
      audio.startMusic();
    }
    input.consumeRestart();   // 開場按 R 不該累積成遊戲裡的重來
    touch.consumeRestart();
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
  if (input.consumeRestart() || touch.consumeRestart()) restartLevel(session);
  // 戰績是要傳給朋友的，所以一定要複製得走。手機點結算畫面就是複製。
  if ((input.consumeCopy() || tapCopy) && session.phase === 'finished') {
    const text = `搞人遊戲 — 總共死了 ${session.totalDeaths} 次,花了 ${fmtTime(session.totalTime)}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  tapCopy = false;
  // 鍵盤跟觸控誰按了都算——兩邊都沒按才是沒按
  updateSession(session, {
    left: input.state.left || touch.state.left,
    right: input.state.right || touch.state.right,
    jump: input.state.jump || touch.state.jump,
  }, dt);
  // BOSS 關換 BOSS 曲,回到一般關換回決鬥曲(setTrack 同曲時是空操作)
  audio.setTrack(session.world.level.boss ? 'boss' : 'duel');
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
  if (stage === 'ask') { renderer.drawAsk(introT, touchy); return; }
  if (!started) { renderer.drawIntro(introT, creatorMode, mobileMode); return; }
  session.world.creator = creatorMode;   // HUD 要畫創造者徽章
  renderer.draw(session, shake);
  if (mobileMode && session.phase !== 'finished') renderer.drawTouchButtons(touch);
}

startLoop(step, render, PHYSICS_DT);
