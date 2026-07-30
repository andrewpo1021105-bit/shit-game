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

// 通關計時的顯示格式：m:ss.t。排行榜比的就是這個數字。
export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// 畫面上「看起來是實心」的字元。假地板必須跟真地板共用同一組畫法，
// 連頂端亮邊的判斷都要一致——看得出來的假地板就不是假地板。
const looksSolid = (ch) => ch === '#' || ch === ',';

// ─── 第 1 關的 Minecraft 風 3D 渲染 ──────────────────────────────
// 遊戲邏輯完全是 2D 的（物理、碰撞、陷阱一個位元都沒變），只有畫法變了：
// 每一格實心地磚畫成一顆有草皮頂面、泥土側面的立體方塊，
// 朝著消失點做透視延伸。假地磚跟真方塊共用同一組畫法——
// 「看得出來的假地板就不是假地板」這條鐵則在 3D 裡也一樣。
const VP_X = VIEW_W / 2;             // 消失點：畫面中央偏上，像稍微俯視
const VP_Y = VIEW_H * 0.34;
const DEPTH_K = 80 / (80 + TILE);    // 方塊背面的透視縮放

const MC = {
  sky: '#7fb2ff',
  cloud: 'rgba(255,255,255,0.92)',
  sun: '#ffe066',
  grass: '#7abd4a',
  grassEdge: '#8fd45c',
  grassSide: '#5c9a36',
  dirt: '#9b6b43',
  dirtDark: '#7a5334',
  dirtSpeck: '#835838',
  stone: '#a9a9a9',
  stoneDark: '#8a8a8a',
};

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
    if (y === 0 || !looksSolid(map[y - 1][x])) {
      ctx.fillStyle = C.tileTop;
      ctx.fillRect(px, py, TILE, 3);
    }
    ctx.fillStyle = C.tileDot;
    ctx.fillRect(px + 3, py + 8, 2, 2);
    ctx.fillRect(px + 10, py + 12, 2, 2);
  }

  // 刺：底座 + 兩根尖齒，尖端染紅。dir = 1 朝上（地上），-1 朝下（天花板倒掛）
  function drawSpike(x, y, dir) {
    const px = x * TILE, py = y * TILE;
    const baseY = dir > 0 ? py + 12 : py;
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(px, baseY, TILE, 4);
    for (let tooth = 0; tooth < 2; tooth++) {
      const cx = px + 4 + tooth * 8;
      for (let r = 0; r < 12; r++) {
        const w = Math.max(1, Math.round((r / 11) * 6));
        ctx.fillStyle = r < 3 ? '#e04b4b' : '#c9d2e8';
        const ry = dir > 0 ? py + 12 - r : py + 3 + r;
        ctx.fillRect(cx - Math.floor(w / 2), ry, w, 1);
      }
    }
  }

  // 會動的危險物。跟地形明顯不同色，玩家一眼看得出「這東西在動」。
  function drawHazard(h) {
    const px = Math.round(h.x), py = Math.round(h.y);
    if (h.kind === 'spit') {
      // 砲塔吐出來的東西:一小顆深綠的方塊彈
      ctx.fillStyle = '#2f4a1e';
      ctx.fillRect(px, py, h.w, h.h);
      ctx.fillStyle = '#557f36';
      ctx.fillRect(px + 1, py + 1, h.w - 2, 2);
      return;
    }
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

  // ── 3D 輔助：把前面的點往消失點推一個方塊深 ──
  function proj(px, py) {
    return [VP_X + (px - VP_X) * DEPTH_K, VP_Y + (py - VP_Y) * DEPTH_K];
  }

  function quad(ax, ay, bx, by, cx2, cy2, dx2, dy2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.fill();
  }

  // 一顆方塊「往後延伸」的那幾個面。哪些面看得到由消失點決定：
  // 方塊在消失點下方就看得到頂面、在左邊就看得到右側面——這就是透視。
  // 面只在鄰格是空氣時才畫，被隔壁方塊貼住的面本來就不存在。
  function drawVoxelBack(map, x, y) {
    const px = x * TILE, py = y * TILE;
    const airAbove = y === 0 || !looksSolid(map[y - 1][x]);
    const airBelow = y + 1 >= map.length || !looksSolid(map[y + 1][x]);
    const airLeft = x === 0 || !looksSolid(map[y][x - 1]);
    const airRight = x + 1 >= map[y].length || !looksSolid(map[y][x + 1]);

    const [bx0, by0] = proj(px, py);
    const [bx1, by1] = proj(px + TILE, py);
    const [bx2, by2] = proj(px + TILE, py + TILE);
    const [bx3, by3] = proj(px, py + TILE);

    // 頂面是草皮——只有露天的方塊會長草，跟那個遊戲一樣
    if (airAbove && py > VP_Y) {
      quad(px, py, px + TILE, py, bx1, by1, bx0, by0, MC.grass);
    }
    if (airBelow && py + TILE < VP_Y) {
      quad(px, py + TILE, px + TILE, py + TILE, bx2, by2, bx3, by3, MC.dirtDark);
    }
    // 側面是泥土——草只長在頂面，這是那個遊戲的世界觀
    if (airLeft && px > VP_X) {
      quad(px, py, px, py + TILE, bx3, by3, bx0, by0, MC.dirtDark);
    }
    if (airRight && px + TILE < VP_X) {
      quad(px + TILE, py, px + TILE, py + TILE, bx2, by2, bx1, by1, MC.dirtDark);
    }
  }

  // 方塊的正面：上緣一條草、其餘是帶斑點的泥土。
  // 斑點位置用格座標決定，同一顆方塊每一幀長一樣，不會閃。
  function drawVoxelFront(map, x, y) {
    const px = x * TILE, py = y * TILE;
    const airAbove = y === 0 || !looksSolid(map[y - 1][x]);

    ctx.fillStyle = MC.dirt;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = MC.dirtSpeck;
    ctx.fillRect(px + ((x * 7 + y * 3) % 10) + 2, py + ((x * 5 + y * 11) % 6) + 7, 3, 2);
    ctx.fillRect(px + ((x * 3 + y * 13) % 11) + 1, py + ((x * 9 + y * 7) % 4) + 11, 2, 2);
    if (airAbove) {
      ctx.fillStyle = MC.grassSide;
      ctx.fillRect(px, py, TILE, 5);
      ctx.fillStyle = MC.grassEdge;
      ctx.fillRect(px, py, TILE, 2);
    }
  }

  function tri(ax, ay, bx, by, cx2, cy2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
    ctx.closePath();
    ctx.fill();
  }

  // 3D 版的刺:三根乾淨的鋼刺插在石座上。
  // 深色描邊撐出輪廓、右半面吃陰影(光永遠從左邊來)、尖端一點亮——
  // 遠遠一眼就是「會死」的形狀,而不是一坨灰。
  function drawVoxelSpike(x, y, dir) {
    const px = x * TILE, py = y * TILE;
    const slabY = dir > 0 ? py + 13 : py;
    const [bx0, by0] = proj(px, dir > 0 ? py + 13 : py + 3);
    const [bx1, by1] = proj(px + TILE, dir > 0 ? py + 13 : py + 3);

    // 石座的影子面(往消失點)與石座本體
    quad(px, dir > 0 ? py + 13 : py + 3, px + TILE, dir > 0 ? py + 13 : py + 3, bx1, by1, bx0, by0, '#565a63');
    ctx.fillStyle = '#4a4e57';
    ctx.fillRect(px, slabY, TILE, 3);
    ctx.fillStyle = '#6a707c';
    ctx.fillRect(px, dir > 0 ? slabY : slabY + 2, TILE, 1);

    const base = dir > 0 ? py + 13 : py + 3;   // 刺的根部貼著石座
    const tip = dir > 0 ? py + 1 : py + 15;    // 尖端
    // 四根齒、齒貼齒、鋪滿整格——相鄰的刺磚會無縫連成一整排刺,
    // 石座也是滿版的,一排刺就是一排刺,不是幾顆牙站在那裡。
    for (let tooth = 0; tooth < 4; tooth++) {
      const tx = px + tooth * 4;
      const mid = tx + 2;
      // 描邊 → 鋼身 → 右半陰影 → 尖端亮點,四層疊出立體
      tri(tx - 0.5, base, tx + 4.5, base, mid, tip - (dir > 0 ? 1 : -1), '#2e3138');
      tri(tx + 0.5, base, tx + 3.5, base, mid, tip, '#cfd6e4');
      tri(mid, tip, tx + 3.5, base, mid, base, '#98a1b3');
      ctx.fillStyle = '#f4f7ff';
      ctx.fillRect(mid - 1, dir > 0 ? tip : tip - 1, 1, 1);
    }
  }

  // 方塊風的玩家。不是貼圖，是一個 12×16 的迷你 Steve：
  // 棕髮、露出來的臉、青色上衣、靛藍長褲。碰撞箱跟 2D 版一模一樣。
  function drawSteve(p, bob) {
    const x = Math.round(p.x - 1), y = Math.round(p.y - 2) + bob;
    ctx.fillStyle = '#e8b083';                    // 臉
    ctx.fillRect(x + 2, y + 1, 8, 6);
    ctx.fillStyle = '#4a2f1d';                    // 頭髮
    ctx.fillRect(x + 2, y, 8, 2);
    ctx.fillRect(x + (p.facing < 0 ? 8 : 2), y + 1, 2, 3);
    ctx.fillStyle = '#ffffff';                    // 眼白
    const ex = p.facing < 0 ? x + 3 : x + 6;
    ctx.fillRect(ex, y + 3, 3, 2);
    ctx.fillStyle = '#3d3aa8';                    // 眼珠看著前進方向
    ctx.fillRect(p.facing < 0 ? ex : ex + 1, y + 3, 2, 2);
    ctx.fillStyle = '#009e9e';                    // 上衣
    ctx.fillRect(x + 1, y + 7, 10, 5);
    ctx.fillStyle = '#e8b083';                    // 手
    ctx.fillRect(x, y + 7, 2, 4);
    ctx.fillRect(x + 10, y + 7, 2, 4);
    ctx.fillStyle = '#3d2f8f';                    // 褲子
    ctx.fillRect(x + 2, y + 12, 8, 3);
    ctx.fillStyle = '#555555';                    // 鞋
    ctx.fillRect(x + 2, y + 15, 3, 1);
    ctx.fillRect(x + 7, y + 15, 3, 1);
  }

  // ── 敵人 ──────────────────────────────────────────────
  // 三種個性三種臉。全部用像素方塊拼,跟這個世界的其他東西同一種材質。
  function drawEnemy(e) {
    const x = Math.round(e.x), y = Math.round(e.y);
    if (e.kind === 'walker') {
      // 綠色方塊獸:那張臉致敬某種會爆炸的東西,但牠只會散步
      ctx.fillStyle = '#4fae4f';
      ctx.fillRect(x, y, e.w, e.h);
      ctx.fillStyle = '#3c8c3c';
      ctx.fillRect(x + 1, y + 1, 3, 2);
      ctx.fillRect(x + 8, y + 3, 3, 2);
      ctx.fillStyle = '#101a10';
      ctx.fillRect(x + 2, y + 4, 3, 3);   // 眼
      ctx.fillRect(x + 7, y + 4, 3, 3);
      ctx.fillRect(x + 4, y + 7, 4, 4);   // 口
      ctx.fillRect(x + 3, y + 9, 2, 3);
      ctx.fillRect(x + 7, y + 9, 2, 3);
      return;
    }
    if (e.kind === 'charger') {
      // 殭屍:手永遠朝前伸。累倒的時候閉眼——那是牠唯一無害的時候。
      const d = e.mode === 'dash' ? e.dashDir : e.dir;
      ctx.fillStyle = '#5aa14a';           // 頭
      ctx.fillRect(x + 2, y, 8, 6);
      ctx.fillStyle = e.mode === 'tired' ? '#2f5c28' : '#0e2410';
      ctx.fillRect(d < 0 ? x + 3 : x + 6, y + 2, 2, e.mode === 'tired' ? 1 : 2);
      ctx.fillRect(d < 0 ? x + 6 : x + 3, y + 2, 2, e.mode === 'tired' ? 1 : 2);
      ctx.fillStyle = '#1f6b6b';           // 衣服
      ctx.fillRect(x + 1, y + 6, 10, 5);
      ctx.fillStyle = '#5aa14a';           // 前伸的手
      ctx.fillRect(d < 0 ? x - 3 : x + e.w - 1, y + 5, 4, 2);
      ctx.fillStyle = '#28325c';           // 褲
      ctx.fillRect(x + 2, y + 11, 8, 3);
      return;
    }
    // 砲塔:石頭發射器,黑洞朝著它守的那一側
    ctx.fillStyle = MC.stoneDark;
    ctx.fillRect(x - 1, y, e.w + 2, e.h);
    ctx.fillStyle = MC.stone;
    ctx.fillRect(x, y + 1, e.w, e.h - 3);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(x + 1, y + 2, e.w - 2, 2);
    ctx.fillStyle = '#141414';
    ctx.fillRect(e.dir < 0 ? x : x + e.w - 5, y + 5, 5, 5);
  }

  // 3D 關卡的天空：日照、飄過的方塊雲。雲的位置由時間決定，
  // 同一秒鐘畫幾次都長一樣——渲染不得引入隨機。
  function drawSky(world) {
    ctx.fillStyle = MC.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = MC.sun;
    ctx.fillRect(VIEW_W - 108, 22, 26, 26);
    ctx.fillStyle = 'rgba(255,244,170,0.55)';
    ctx.fillRect(VIEW_W - 112, 18, 34, 34);

    ctx.fillStyle = MC.cloud;
    const drift = (world.time * 6) % (VIEW_W + 120);
    for (const [cx0, cy0, w] of [[30, 34, 52], [190, 58, 68], [330, 24, 44]]) {
      const cx1 = ((cx0 + drift) % (VIEW_W + 120)) - 60;
      ctx.fillRect(cx1, cy0, w, 10);
      ctx.fillRect(cx1 + 8, cy0 - 6, w - 20, 6);
    }
  }

  function drawDoor(dx, dy, glow, locked = false) {
    const px = dx * TILE, py = dy * TILE;
    // 鎖住的門不發光、改罩一層紅——玩家碰上去沒反應時，
    // 至少看得出來「它是鎖著的」，而不是以為遊戲當了
    ctx.fillStyle = locked
      ? 'rgba(224,75,75,0.28)'
      : `rgba(120,220,140,${(0.10 + 0.5 * glow).toFixed(3)})`;
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

    // 鎖住時橫一道閂
    if (locked) {
      ctx.fillStyle = '#e04b4b';
      ctx.fillRect(px + 1, py + 13, 30, 5);
      ctx.fillStyle = '#241608';
      ctx.fillRect(px + 13, py + 14, 6, 3);
    }
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

    const threeD = world.level.render3d === true;
    const map = world.map;

    if (threeD) {
      drawSky(world);
      // 兩趟畫完：先畫所有方塊往後延伸的面，再畫所有正面蓋在上面。
      // 正面永遠離鏡頭最近，所以這個順序就是正確的遮擋關係。
      for (let y = 0; y < map.length; y++)
        for (let x = 0; x < map[y].length; x++)
          if (looksSolid(map[y][x])) drawVoxelBack(map, x, y);
      for (let y = 0; y < map.length; y++)
        for (let x = 0; x < map[y].length; x++) {
          const ch = map[y][x];
          // 假地板走 '#' 的畫法、假刺走 '^' 的畫法。像素完全相同，不是近似。
          if (ch === '#' || ch === ',') drawVoxelFront(map, x, y);
          else if (ch === '^' || ch === '/') drawVoxelSpike(x, y, 1);
          else if (ch === 'v') drawVoxelSpike(x, y, -1);
        }
    } else {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = C.grid;
      for (let y = 1; y < 14; y++)
        for (let x = 1; x < 29; x++)
          if ((x + y) % 2 === 0) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

      for (let y = 0; y < map.length; y++)
        for (let x = 0; x < map[y].length; x++) {
          const ch = map[y][x];
          // 假地板走 '#' 的畫法、假刺走 '^' 的畫法。像素完全相同，不是近似。
          if (ch === '#' || ch === ',') drawTile(map, x, y);
          else if (ch === '^' || ch === '/') drawSpike(x, y, 1);
          else if (ch === 'v') drawSpike(x, y, -1);
        }
    }

    // 過關瞬間門會亮一下再收回去
    // 假通關必須跟真通關畫得一模一樣，所以兩者共用同一條時間軸。
    // 差別只在真通關用 phaseTimer，假通關用 fakeTimer。
    const winLike = world.phase === 'won'
      || (world.phase === 'faking' && world.fakeKind === 'win');
    const winT = world.phase === 'won' ? world.phaseTimer : world.fakeTimer;
    const glow = winLike ? Math.max(0, 1 - winT / 0.45) : 0;
    // 假門必須跟真門畫得一模一樣，否則就不叫假門了
    for (const d of world.decoys) drawDoor(d.x, d.y, 0);
    drawDoor(world.door.x, world.door.y, glow, world.doorLock > 0);

    for (const h of world.hazards) drawHazard(h);
    for (const e of world.enemies ?? []) drawEnemy(e);

    // 死了看不到人（爆掉），過關也看不到人（走進門裡了）
    if (world.phase === 'play') {
      const p = world.player;
      // 踏步：用走過的距離驅動，走得快就踏得快。每 16 像素（一格）換一次腳。
      const walking = p.grounded && Math.abs(p.vx) > 8;
      const bob = walking && Math.floor(Math.abs(p.x) / 16) % 2 === 0 ? -1 : 0;
      if (threeD) drawSteve(p, bob);
      else ctx.drawImage(SPRITES.player, Math.round(p.x - 1), Math.round(p.y - 2) + bob);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    // 3D 關卡的背景是天空藍，灰紫色的 HUD 會糊掉，換成深色
    ctx.fillStyle = world.flipped ? C.uiHot : (threeD ? '#1d3557' : C.ui);
    // HUD 也會說謊。label glitch 一旦發動，關卡編號就一路錯下去。
    const levelText = world.glitch?.kind === 'label' && world.glitch.text
      ? world.glitch.text
      : `LEVEL ${world.level.id}`;
    if (world.flipped) {
      // 左右反轉時關卡編號也左右反轉。這是反轉唯一的持續性告示——
      // 觸發那一瞬間有聲音有震動，之後就只剩這個。有在看的人看得到。
      ctx.save();
      ctx.translate(8 + ctx.measureText(levelText).width, 0);
      ctx.scale(-1, 1);
      ctx.fillText(levelText, 0, 12);
      ctx.restore();
    } else {
      ctx.fillText(levelText, 8, 12);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = world.deaths > 0 ? C.uiHot : (threeD ? '#1d3557' : C.ui);
    ctx.fillText(`DEATHS ${world.deaths}`, VIEW_W - 8, 12);
    ctx.textAlign = 'left';

    // 通關計時,結算畫面的排行榜比的就是它。掛在 world 上是 session
    // 每幀塞進來的——render 不 import session,免得畫畫的人管到規則。
    if (world.hudTime !== undefined) {
      ctx.textAlign = 'center';
      ctx.fillStyle = threeD ? '#1d3557' : C.ui;
      ctx.fillText(`TIME ${fmtTime(world.hudTime)}`, VIEW_W / 2, 12);
      ctx.textAlign = 'left';
    }

    if (world.level.showProfile) drawProfilePanel(world);
    if (winLike) drawWinOverlay(world, winT);
    if (world.glitch?.kind === 'crash') drawCrash();
  }

  // 第 9 關：把它算到的東西即時攤在你眼前。它不解釋任何一個數字。
  function drawProfilePanel(world) {
    const p = world.profile;
    const rows = [
      ['LAND', p.lastLandTile],
      ['APEX', p.lastApex],
      ['SPEED', p.lastSpeed],
      ['DELAY', p.lastRestartDelay],
      ['LEAD', p.lastJumpLead],
      ['HESIT', p.lastHesitation],
    ];

    const x = VIEW_W - 66, y = 22, w = 58, h = rows.length * 9 + 12;
    ctx.fillStyle = 'rgba(5,6,10,0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.scan;
    ctx.fillRect(x, y, w, 1);

    ctx.font = '7px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.scan;
    ctx.fillText('PROFILE', x + 4, y + 9);

    rows.forEach(([label, value], i) => {
      const ty = y + 20 + i * 9;
      ctx.fillStyle = C.ui;
      ctx.fillText(label, x + 4, ty);
      ctx.textAlign = 'right';
      // 還沒有樣本就顯示破折號，不要編一個數字出來
      ctx.fillStyle = value === null || value === undefined ? C.ui : '#d8dae6';
      ctx.fillText(value === null || value === undefined ? '--' : String(value), x + w - 4, ty);
      ctx.textAlign = 'left';
    });
  }

  // 過關演出。煙火、衝擊波、金光——越華麗越好,因為假通關也走同一條路:
  // 你被騙的時候,連煙火都是全套的。
  // 所有粒子位置都是 t 與編號的函數,不用亂數,同一幀畫幾次都一樣。
  const FW_COLORS = ['#ffd75e', '#8fd6a0', '#ffffff', '#e04b4b', '#7fb2ff'];

  function drawWinOverlay(world, t) {
    const cx = VIEW_W / 2, cy = VIEW_H / 2;

    ctx.fillStyle = `rgba(5,6,10,${(0.72 * Math.min(1, t / 0.35)).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 開場白光一閃
    if (t < 0.16) {
      ctx.fillStyle = `rgba(255,255,255,${(0.7 * (1 - t / 0.16)).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // 兩圈煙火粒子往外炸,外圈快、內圈慢,尾端慢慢熄掉
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? 18 : 12;
      const speed = ring === 0 ? 150 : 90;
      const delay = ring * 0.12;
      const life = Math.max(0, t - delay);
      const r = speed * life * (1 - life * 0.35);
      if (life <= 0 || life > 1.3) continue;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.26 + t * 0.4;
        const sz = Math.max(1, 4 - life * 3);
        ctx.fillStyle = FW_COLORS[(i + ring) % FW_COLORS.length];
        ctx.globalAlpha = Math.max(0, 1 - life * 0.8);
        ctx.fillRect(cx + Math.cos(a) * r - sz / 2, cy - 8 + Math.sin(a) * r * 0.62 - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // 衝擊波:一圈往外擴的細框
    const wave = Math.min(1, t / 0.5);
    if (wave < 1) {
      const wr = 20 + wave * 190;
      const wh = wr * 0.55;
      ctx.fillStyle = `rgba(255,215,94,${(0.5 * (1 - wave)).toFixed(3)})`;
      ctx.fillRect(cx - wr, cy - 8 - wh, wr * 2, 2);
      ctx.fillRect(cx - wr, cy - 8 + wh, wr * 2, 2);
      ctx.fillRect(cx - wr, cy - 8 - wh, 2, wh * 2);
      ctx.fillRect(cx + wr - 2, cy - 8 - wh, 2, wh * 2);
    }

    // CLEAR! 金字彈出來,帶一點回彈跟影子
    ctx.textAlign = 'center';
    const pop = Math.min(1, t / 0.26);
    const bounce = 1 - (1 - pop) ** 3 + (pop >= 1 ? Math.sin(Math.min(t - 0.26, 0.5) * 10) * 0.04 : 0);
    const size = Math.round(30 * bounce) + 4;
    ctx.font = `bold ${size}px Consolas, monospace`;
    ctx.fillStyle = '#3a2c05';
    ctx.fillText('CLEAR!', cx + 2, cy - 2);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('CLEAR!', cx, cy - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.max(4, Math.round(size * 0.28))}px Consolas, monospace`;

    if (t > 0.4) {
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = '#d8dae6';
      ctx.fillText(`DEATHS  ${world.deaths}`, cx, cy + 20);
    }
    ctx.textAlign = 'left';
  }

  // 假當機。它蓋掉整個畫面，看起來就是遊戲真的爆了。
  // 物理同時是凍住的，所以你不會在看不見的時候被偷走進度。
  function drawCrash() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'left';
    ctx.font = '8px Consolas, monospace';
    const lines = [
      'Uncaught TypeError: Cannot read properties of null',
      '    at updateWorld (world.js:214:19)',
      '    at step (main.js:32:3)',
      '    at frame (loop.js:18:7)',
      '',
      'The game has stopped responding.',
    ];
    lines.forEach((line, i) => {
      ctx.fillStyle = i >= 4 ? C.ui : C.uiHot;
      ctx.fillText(line, 12, 40 + i * 12);
    });
  }

  // 開場畫面。陽光草地、被殭屍追著跑的方塊人——看起來是快樂遊戲,
  // 這個第一印象本身就是全遊戲的第一個陷阱。
  function drawIntro(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSky({ time: t });

    // 地面:一整條草皮方塊
    ctx.fillStyle = MC.dirt;
    ctx.fillRect(0, 232, VIEW_W, VIEW_H - 232);
    ctx.fillStyle = MC.grassSide;
    ctx.fillRect(0, 232, VIEW_W, 5);
    ctx.fillStyle = MC.grassEdge;
    ctx.fillRect(0, 232, VIEW_W, 2);
    ctx.fillStyle = MC.dirtSpeck;
    for (let x = 8; x < VIEW_W; x += 24) ctx.fillRect(x, 244 + (x % 3) * 5, 3, 2);

    // 一個人被一隻綠色的東西追著跑,永遠追不上,永遠在跑
    const span = VIEW_W + 120;
    const sx = ((t * 55) % span) - 60;
    const bob = Math.floor(sx / 16) % 2 === 0 ? -1 : 0;
    drawSteve({ x: sx, y: 216, facing: 1 }, bob);
    drawEnemy({ kind: 'walker', x: sx - 42, y: 218, w: 12, h: 14 });

    // 標題:金字帶黑影,輕輕浮動
    const cy = 92 + Math.sin(t * 1.8) * 3;
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#2b1d04';
    ctx.fillText('搞 人 遊 戲', VIEW_W / 2 + 3, cy + 3);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('搞 人 遊 戲', VIEW_W / 2, cy);

    ctx.font = '11px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#1d3557';
    ctx.fillText('17 關 · 每一關都會騙你 · 計時上排行榜 · M 靜音', VIEW_W / 2, cy + 26);

    if (Math.floor(t * 1.6) % 2 === 0) {
      ctx.font = 'bold 12px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#e04b4b';
      ctx.fillText('按 任 意 鍵 開 始', VIEW_W / 2, 190);
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

    // 只在全黑那段時間顯示文字。分析演出拿掉了——
    // 現在只報下一關的編號,有狠話要放的關卡(announce)照樣放。
    if (t < SWEEP_IN || t >= REVEAL_AT) return;

    const next = session.revealed
      ? session.world.level
      : (session.levels[session.index + 1] ?? session.world.level);

    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    ctx.textAlign = 'center';

    const pop = clamp01((t - SWEEP_IN) / 0.3);
    ctx.font = `bold ${Math.round(10 + 14 * pop)}px Consolas, monospace`;
    ctx.fillStyle = C.scan;
    ctx.fillText(`LEVEL ${next.id}`, cx, cy - 6);

    if (next.announce) {
      ctx.font = '11px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#d8dae6';
      ctx.fillText(typed(next.announce, t, SWEEP_IN + 0.3, 0.45), cx, cy + 16);
    }
    ctx.textAlign = 'left';
  }

  // 結算:排行榜就是主角。分析報告的演出拿掉了——
  // 你走完 17 關,唯一該面對的數字就是時間,跟過去的自己排排站。
  function drawFinished(session) {
    const t = session.timer;
    const cx = VIEW_W / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 背景煙火:三個定點輪流炸,位置與時間全是確定性的
    for (let f = 0; f < 3; f++) {
      const life = ((t * 0.7 + f * 0.33) % 1);
      const fx = [70, VIEW_W - 70, cx][f];
      const fy = [60, 52, 40][f];
      const r = life * 46;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + f;
        ctx.fillStyle = FW_COLORS[(i + f) % FW_COLORS.length];
        ctx.globalAlpha = Math.max(0, 0.9 - life);
        ctx.fillRect(fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.7, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    const pop = clamp01(t / 0.35);
    ctx.font = `bold ${Math.round(8 + 16 * (1 - (1 - pop) ** 3))}px "Microsoft JhengHei", sans-serif`;
    ctx.fillStyle = '#3a2c05';
    ctx.fillText('全 部 通 關', cx + 2, 36);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('全 部 通 關', cx, 34);

    ctx.font = 'bold 20px Consolas, monospace';
    ctx.fillStyle = C.scan;
    ctx.fillText(fmtTime(session.totalTime), cx, 62);
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = C.uiHot;
    ctx.fillText(`TOTAL DEATHS  ${session.totalDeaths}`, cx, 76);

    // 通關時間排行榜——放大版,前十名一次攤開。
    // 存在你自己的瀏覽器裡:跟你比的人永遠是過去的你。
    const board = (session.leaderboard ?? []).slice(0, 10);
    if (board.length > 0 && t > 0.5) {
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('─────  BEST TIMES  ─────', cx, 98);
      ctx.font = '10px Consolas, monospace';
      board.forEach((r, i) => {
        if (t < 0.5 + i * 0.12) return;   // 一行一行浮出來
        const mine = r === session.lastEntry;
        const y = 114 + i * 14;
        if (mine) {
          ctx.fillStyle = 'rgba(143,214,160,0.16)';
          ctx.fillRect(cx - 130, y - 10, 260, 13);
        }
        ctx.fillStyle = mine ? C.scan : (i === 0 ? '#ffd75e' : '#d8dae6');
        const rank = i === 0 ? '♛1' : ` ${i + 1}`;
        ctx.fillText(
          `${rank}   ${fmtTime(r.time)}    DEATHS ${String(r.deaths).padStart(3)}    ${r.date}${mine ? ' ◄' : ''}`,
          cx, y,
        );
      });
    }

    if (t > 1.6 && Math.floor(t * 1.5) % 2 === 0) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = C.ui;
      ctx.fillText('PRESS  C  TO COPY', cx, VIEW_H - 8);
    }
    ctx.textAlign = 'left';
  }

  function draw(session, shake) {
    if (session.phase === 'finished') { drawFinished(session); return; }
    // 計時器是 session 的東西,每幀塞給 world 帶進去畫——
    // drawWorld 不必認識 session
    session.world.hudTime = session.totalTime;
    drawWorld(session.world, shake);
    if (session.phase === 'transition') drawTransition(session);
  }

  resize();
  window.addEventListener('resize', resize);
  return { resize, draw, drawIntro };
}
