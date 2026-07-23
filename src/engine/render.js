import { TILE, VIEW_W, VIEW_H } from '../game/constants.js';
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
};

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

  function draw(world, alpha, shake) {
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
      for (let x = 0; x < map[y].length; x++)
        if (map[y][x] === '#') drawTile(map, x, y);

    // 過關瞬間門會亮一下再收回去
    const glow = world.phase === 'won'
      ? Math.max(0, 1 - world.phaseTimer / 0.45)
      : 0;
    drawDoor(world.door.x, world.door.y, glow);

    // 死了看不到人（爆掉），過關也看不到人（走進門裡了）
    if (world.phase === 'play') {
      const p = world.player;
      ctx.drawImage(SPRITES.player, Math.round(p.x - 1), Math.round(p.y - 2));
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

    // 標題由小彈到大
    const pop = Math.min(1, t / 0.22);
    const size = Math.round(12 + 16 * (1 - (1 - pop) * (1 - pop)));
    ctx.font = `bold ${size}px Consolas, monospace`;
    ctx.fillStyle = '#8fd6a0';
    ctx.fillText('CLEAR!', cx, cy - 4);

    if (t > 0.4) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = '#d8dae6';
      ctx.fillText(`DEATHS  ${world.deaths}`, cx, cy + 18);
    }
    // 提示閃爍，才不會被當成畫面當掉
    if (t > 0.9 && Math.floor(t * 2) % 2 === 0) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = '#6f779b';
      ctx.fillText('PRESS  R  TO  REPLAY', cx, cy + 38);
    }

    ctx.textAlign = 'left';
  }

  resize();
  window.addEventListener('resize', resize);
  return { resize, draw };
}
