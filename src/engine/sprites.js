export function bakeSprite(rows, palette) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const PLAYER_ROWS = [
  '..1111..',
  '.111111.',
  '.131131.',
  '.111111.',
  '..1111..',
  '2.2222.2',
  '22222222',
  '.222222.',
  '.222222.',
  '.44..44.',
  '.44..44.',
  '333..333',
];
const PLAYER_PAL = { 1: '#f2f2f7', 2: '#e04b4b', 3: '#14161f', 4: '#3a6ea5' };

export const SPRITES = {};

export function initSprites() {
  SPRITES.player = bakeSprite(PLAYER_ROWS, PLAYER_PAL);
}
