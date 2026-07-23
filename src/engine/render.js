import { TILE, VIEW_W, VIEW_H } from '../game/constants.js';
import { SWEEP_IN, REVEAL_AT, TRANSITION_TIME } from '../game/session.js';
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
  scan: '#8fd6a0',
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 打字機：依時間推進顯示到第幾個字
function typed(text, t, start, dur) {
  const n = Math.floor(text.length * clamp01((t - start) / dur));
  return text.slice(0, n);
}

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

  // 刺：底座 + 兩根往上的尖齒，尖端染紅
  function drawSpike(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(px, py + 12, TILE, 4);
    for (let tooth = 0; tooth < 2; tooth++) {
      const cx = px + 4 + tooth * 8;
      for (let r = 0; r < 12; r++) {
        const w = Math.max(1, Math.round((r / 11) * 6));
        ctx.fillStyle = r < 3 ? '#e04b4b' : '#c9d2e8';
        ctx.fillRect(cx - Math.floor(w / 2), py + 12 - r, w, 1);
      }
    }
  }

  // 會動的危險物。跟地形明顯不同色，玩家一眼看得出「這東西在動」。
  function drawHazard(h) {
    const px = Math.round(h.x), py = Math.round(h.y);
    if (h.kind === 'block') {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(px, py, h.w, h.h);
      ctx.fillStyle = '#9c6f43';
      ctx.fillRect(px + 1, py + 1, h.w - 2, 3);
      ctx.fillStyle = '#e04b4b';
      ctx.fillRect(px, py + h.h - 2, h.w, 2);
      return;
    }
    // 橫掃的刺：尖端朝著行進方向
    const dir = h.vx < 0 ? -1 : 1;
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(px + (dir < 0 ? 10 : 0), py + 2, 6, h.h - 4);
    for (let r = 0; r < 11; r++) {
      const w = Math.max(1, Math.round((r / 10) * 6));
      ctx.fillStyle = r < 3 ? '#e04b4b' : '#c9d2e8';
      const ax = dir < 0 ? px + r : px + h.w - 1 - r;
      ctx.fillRect(ax, py + 8 - Math.floor(w / 2), 1, w);
    }
  }

  function drawDoor(dx, dy, glow) {
    const px = dx * TILE, py = dy * TILE;
    ctx.fillStyle = `rgba(120,220,140,${(0.10 + 0.5 * glow).toFixed(3)})`;
    ctx.fillRect(px - 6 - glow * 8, py - 6 - glow * 8, 44 + glow * 16, 40 + glow * 16);
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

  function drawWorld(world, shake) {
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
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === '#') drawTile(map, x, y);
        else if (map[y][x] === '^') drawSpike(x, y);
      }

    // 過關瞬間門會亮一下再收回去
    const glow = world.phase === 'won' ? Math.max(0, 1 - world.phaseTimer / 0.45) : 0;
    drawDoor(world.door.x, world.door.y, glow);

    for (const h of world.hazards) drawHazard(h);

    // 死了看不到人（爆掉），過關也看不到人（走進門裡了）
    if (world.phase === 'play') {
      const p = world.player;
      // 踏步：用走過的距離驅動，走得快就踏得快。每 16 像素（一格）換一次腳。
      const walking = p.grounded && Math.abs(p.vx) > 8;
      const bob = walking && Math.floor(Math.abs(p.x) / 16) % 2 === 0 ? -1 : 0;
      ctx.drawImage(SPRITES.player, Math.round(p.x - 1), Math.round(p.y - 2) + bob);
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

    if (world.phase === 'won') drawWinOverlay(world);
  }

  function drawWinOverlay(world) {
    const t = world.phaseTimer;
    const cx = VIEW_W / 2, cy = VIEW_H / 2;

    ctx.fillStyle = `rgba(5,6,10,${(0.78 * Math.min(1, t / 0.35)).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = 'center';
    const pop = Math.min(1, t / 0.22);
    const size = Math.round(12 + 16 * (1 - (1 - pop) * (1 - pop)));
    ctx.font = `bold ${size}px Consolas, monospace`;
    ctx.fillStyle = C.scan;
    ctx.fillText('CLEAR!', cx, cy - 4);

    if (t > 0.4) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = '#d8dae6';
      ctx.fillText(`DEATHS  ${world.deaths}`, cx, cy + 18);
    }
    ctx.textAlign = 'left';
  }

  // 轉場：黑幕由上往下蓋滿 → 分析你 → 由上往下掀開露出下一關
  function drawTransition(session) {
    const t = session.timer;
    const closing = t < REVEAL_AT;
    const barY = closing
      ? VIEW_H * clamp01(t / SWEEP_IN)
      : VIEW_H * clamp01((t - REVEAL_AT) / (TRANSITION_TIME - REVEAL_AT));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    if (closing) ctx.fillRect(0, 0, VIEW_W, barY);
    else ctx.fillRect(0, barY, VIEW_W, VIEW_H - barY);

    // 掃描亮線
    ctx.fillStyle = C.scan;
    ctx.fillRect(0, Math.round(barY) - 1, VIEW_W, 2);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, Math.round(barY) - 5, VIEW_W, 4);
    ctx.globalAlpha = 1;

    // 只在全黑那段時間顯示文字
    if (t < SWEEP_IN || t >= REVEAL_AT) return;

    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    ctx.textAlign = 'center';

    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = C.scan;
    ctx.fillText(typed('ANALYSING...', t, SWEEP_IN + 0.05, 0.35), cx, cy - 12);

    // 沒有樣本就只掃描不下結論——寧可沉默也不要講沒根據的話
    if (t > 1.0 && session.analysis) {
      ctx.font = '11px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#d8dae6';
      const line = typed(session.analysis, t, 1.0, 0.45);
      ctx.fillText(line, cx, cy + 10);
      // 游標
      if (Math.floor(t * 6) % 2 === 0) {
        const w = ctx.measureText(line).width;
        ctx.fillStyle = C.scan;
        ctx.fillRect(cx + w / 2 + 2, cy + 2, 5, 10);
      }
    }
    ctx.textAlign = 'left';
  }

  function drawFinished(session) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillStyle = C.scan;
    ctx.fillText('ALL CLEAR', cx, cy - 8);
    ctx.font = '8px Consolas, monospace';
    ctx.fillStyle = '#d8dae6';
    ctx.fillText(`TOTAL DEATHS  ${session.totalDeaths}`, cx, cy + 14);
    ctx.font = '11px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = C.ui;
    ctx.fillText(session.analysis || '', cx, cy + 36);
    ctx.textAlign = 'left';
  }

  function draw(session, shake) {
    if (session.phase === 'finished') { drawFinished(session); return; }
    drawWorld(session.world, shake);
    if (session.phase === 'transition') drawTransition(session);
  }

  resize();
  window.addEventListener('resize', resize);
  return { resize, draw };
}
