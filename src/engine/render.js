import { TILE, VIEW_W, VIEW_H } from '../game/constants.js';
import { SWEEP_IN, REVEAL_AT, TRANSITION_TIME } from '../game/session.js';
import { SPRITES } from './sprites.js';
import { ZONES, ASK } from './touch.js';

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
// 消失點:畫面中央偏上,像稍微俯視。BOSS 關會捲軸,
// 消失點得跟著鏡頭走,所以 X 是變數,烘焙地形前設定。
let vpX = VIEW_W / 2;
const VP_Y = VIEW_H * 0.34;
const DEPTH_K = 80 / (80 + TILE);    // 方塊背面的透視縮放
const BAKE_PAD = 32;                 // 捲軸關的地形快取,兩側多烘的邊距

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
  const screenCtx = canvas.getContext('2d');
  screenCtx.imageSmoothingEnabled = false;
  // ctx 是「目前的畫布」。地形要畫進離屏快取時會暫時換成 tctx,
  // 畫完換回來——所有繪圖函式都讀這個變數,誰在當畫布它們不用知道。
  let ctx = screenCtx;

  // 地形快取。每幀重畫整片方塊地形是幾百個 canvas 呼叫,手機扛不住;
  // 但地形只有陷阱發動時才會變。所以畫一次存起來,之後每幀一張
  // drawImage。key 是整張地圖字串——變了才重畫,沒變就直接貼圖。
  const terrain = document.createElement('canvas');
  terrain.width = VIEW_W;
  terrain.height = VIEW_H;
  const tctx = terrain.getContext('2d');
  if (tctx) tctx.imageSmoothingEnabled = false;
  let terrainKey = null;

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
    if (h.kind === 'fire') {
      // 龍吐的火球:波動拳式的能量彈——脈動的外環、亮心、拖三截殘影。
      // 脈動用位置當相位,同一幀畫幾次都一樣,不引入時間外的變因。
      const pulse = Math.floor(h.x / 10) % 2;
      const back = h.vx < 0 ? 1 : -1;
      for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = `rgba(255,${150 - i * 30},40,${(0.4 - i * 0.11).toFixed(2)})`;
        ctx.fillRect(px + back * i * 7, py + i, h.w - i * 2, h.h - i * 2);
      }
      ctx.fillStyle = pulse ? '#ff6a1a' : '#ff8a2a';
      ctx.fillRect(px - 2, py - 2, h.w + 4, h.h + 4);
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(px, py, h.w, h.h);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(px + 3, py + 3, h.w - 6, h.h - 6);
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
    return [vpX + (px - vpX) * DEPTH_K, VP_Y + (py - VP_Y) * DEPTH_K];
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
    if (airLeft && px > vpX) {
      quad(px, py, px, py + TILE, bx3, by3, bx0, by0, MC.dirtDark);
    }
    if (airRight && px + TILE < vpX) {
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
  // BOSS 關換成火燒雲的黃昏:太陽變紅、雲變黑,像有什麼東西燒起來了。
  function drawSky(world, boss = false) {
    ctx.fillStyle = boss ? '#8a3324' : MC.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (boss) {
      ctx.fillStyle = '#a8452b';
      ctx.fillRect(0, VIEW_H * 0.45, VIEW_W, VIEW_H * 0.25);
      ctx.fillStyle = '#c95b2e';
      ctx.fillRect(0, VIEW_H * 0.62, VIEW_W, VIEW_H * 0.2);
    }
    ctx.fillStyle = boss ? '#ff5a36' : MC.sun;
    ctx.fillRect(VIEW_W - 108, 22, 26, 26);
    ctx.fillStyle = boss ? 'rgba(255,120,60,0.5)' : 'rgba(255,244,170,0.55)';
    ctx.fillRect(VIEW_W - 112, 18, 34, 34);

    ctx.fillStyle = boss ? 'rgba(40,18,14,0.75)' : MC.cloud;
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

    // 攝影機。地圖比一個畫面寬(BOSS 關)才會捲,平常 camX 恆為 0——
    // 人物與地磚永遠原尺寸,寬地圖靠鏡頭跟著玩家走。
    const mapPxW = map[0].length * TILE;
    const scroll = mapPxW > VIEW_W;
    const camX = scroll
      ? Math.max(0, Math.min(world.player.x + world.player.w / 2 - VIEW_W / 2, mapPxW - VIEW_W))
      : 0;
    // 捲軸時地形快取只烘鏡頭附近一個畫面寬(加邊距),消失點跟著鏡頭。
    // 烘焙位置量化到 8px:每滑 8px 才重烘一次,而不是每幀。
    const bakeX = scroll ? Math.floor(camX / 8) * 8 : 0;

    // 地形變了才重建快取(字串比對很便宜)
    const key = (threeD ? '3' : '2') + bakeX + ':' + map.join('');
    if (key !== terrainKey) {
      terrainKey = key;
      const wantW = scroll ? VIEW_W + BAKE_PAD * 2 : VIEW_W;
      if (terrain.width !== wantW) terrain.width = wantW;   // 改寬度順便清空
      vpX = bakeX + VIEW_W / 2;
      ctx = tctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, terrain.width, VIEW_H);
      // 之後全部用世界座標畫,由這個位移對到快取畫布上
      ctx.setTransform(1, 0, 0, 1, -(bakeX - (scroll ? BAKE_PAD : 0)), 0);
      const x0 = scroll ? Math.max(0, Math.floor((bakeX - BAKE_PAD) / TILE)) : 0;
      const x1 = scroll
        ? Math.min(map[0].length - 1, Math.ceil((bakeX + VIEW_W + BAKE_PAD) / TILE))
        : map[0].length - 1;
      if (threeD) {
        // 兩趟畫完：先畫所有方塊往後延伸的面，再畫所有正面蓋在上面。
        // 正面永遠離鏡頭最近，所以這個順序就是正確的遮擋關係。
        for (let y = 0; y < map.length; y++)
          for (let x = x0; x <= x1; x++)
            if (looksSolid(map[y][x])) drawVoxelBack(map, x, y);
        for (let y = 0; y < map.length; y++)
          for (let x = x0; x <= x1; x++) {
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
          for (let x = x0; x <= x1; x++) {
            const ch = map[y][x];
            // 假地板走 '#' 的畫法、假刺走 '^' 的畫法。像素完全相同，不是近似。
            if (ch === '#' || ch === ',') drawTile(map, x, y);
            else if (ch === '^' || ch === '/') drawSpike(x, y, 1);
            else if (ch === 'v') drawSpike(x, y, -1);
          }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx = screenCtx;
    }

    if (threeD) drawSky(world, world.level.boss === true);
    // 從這裡開始的東西都活在世界座標裡,跟著鏡頭平移
    ctx.translate(-camX, 0);
    ctx.drawImage(terrain, bakeX - (scroll ? BAKE_PAD : 0), 0);

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

    // 死了看不到人（爆掉），過關也看不到人（走進門裡了）。
    // 打鬥模式挨打後的無敵時間會一閃一閃——那是「現在打不到我」的告示。
    const blink = world.invuln > 0 && Math.floor(world.invuln * 16) % 2 === 0;
    if (world.phase === 'play' && !blink) {
      const p = world.player;
      // 踏步：用走過的距離驅動，走得快就踏得快。每 16 像素（一格）換一次腳。
      const walking = p.grounded && Math.abs(p.vx) > 8;
      const bob = walking && Math.floor(Math.abs(p.x) / 16) % 2 === 0 ? -1 : 0;
      // 打鬥模式的玩家是火柴人劍士(world.stickman 旗子),平常是方塊人
      if (world.stickman) drawStickman(p, world.slash ?? 0, world.time);
      else if (threeD) drawSteve(p, bob);
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

    // 創造者徽章。金色,擺在關卡編號下面——這不是給玩家看的,
    // 是給拿著密碼的那個人確認「我現在可以跳關」用的。
    if (world.creator) {
      ctx.fillStyle = '#c9a227';
      ctx.fillText('CREATOR  N/B 跳關', 8, 22);
    }

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

  // 開場的第一頁:先問你用什麼玩。兩顆大按鈕,點了才進標題畫面。
  function drawAsk(t, touchy) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSky({ time: t });
    ctx.fillStyle = MC.dirt;
    ctx.fillRect(0, 232, VIEW_W, VIEW_H - 232);
    ctx.fillStyle = MC.grassSide;
    ctx.fillRect(0, 232, VIEW_W, 5);
    ctx.fillStyle = MC.grassEdge;
    ctx.fillRect(0, 232, VIEW_W, 2);

    ctx.textAlign = 'center';
    ctx.font = 'bold 30px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#2b1d04';
    ctx.fillText('搞 人 遊 戲', VIEW_W / 2 + 2, 72);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('搞 人 遊 戲', VIEW_W / 2, 70);

    ctx.font = '13px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#1d3557';
    ctx.fillText('你用什麼玩?', VIEW_W / 2, 116);

    // touchy = 這台裝置看起來有觸控——把建議的那顆框亮一點
    for (const [name, z] of Object.entries(ASK)) {
      const hot = (name === 'mobile') === touchy;
      ctx.fillStyle = 'rgba(5,6,10,0.55)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = hot ? '#ffd75e' : '#6f779b';
      ctx.fillRect(z.x, z.y, z.w, 2);
      ctx.fillRect(z.x, z.y + z.h - 2, z.w, 2);
      ctx.fillRect(z.x, z.y, 2, z.h);
      ctx.fillRect(z.x + z.w - 2, z.y, 2, z.h);
      ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = hot ? '#ffd75e' : '#d8dae6';
      ctx.fillText(name === 'mobile' ? '📱 手機 / 平板' : '⌨ 電腦鍵盤', z.x + z.w / 2, z.y + 26);
      ctx.font = '9px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(name === 'mobile' ? '螢幕上會有觸控按鈕' : '方向鍵移動.空白鍵跳', z.x + z.w / 2, z.y + 44);
    }
    ctx.textAlign = 'left';
  }

  // 遊戲中的觸控按鈕。半透明壓在畫面上,壓到的那顆會亮。
  // showAtk:撿到劍(打鬥模式)才亮出攻擊鈕。
  function drawTouchButtons(touch, showAtk = false) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const btn = (z, hot) => {
      ctx.fillStyle = hot ? 'rgba(255,215,94,0.30)' : 'rgba(5,6,10,0.30)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = hot ? 'rgba(255,215,94,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.fillRect(z.x, z.y, z.w, 1);
      ctx.fillRect(z.x, z.y + z.h - 1, z.w, 1);
      ctx.fillRect(z.x, z.y, 1, z.h);
      ctx.fillRect(z.x + z.w - 1, z.y, 1, z.h);
    };
    const arrow = (z, dir, hot) => {
      const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      tri(cx - dir * 9, cy - 12, cx - dir * 9, cy + 12, cx + dir * 11, cy,
        hot ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)');
    };
    btn(ZONES.left, touch.pressed.left);
    arrow(ZONES.left, -1, touch.pressed.left);
    btn(ZONES.right, touch.pressed.right);
    arrow(ZONES.right, 1, touch.pressed.right);
    btn(ZONES.jump, touch.pressed.jump);
    tri(
      ZONES.jump.x + ZONES.jump.w / 2 - 13, ZONES.jump.y + ZONES.jump.h / 2 + 9,
      ZONES.jump.x + ZONES.jump.w / 2 + 13, ZONES.jump.y + ZONES.jump.h / 2 + 9,
      ZONES.jump.x + ZONES.jump.w / 2, ZONES.jump.y + ZONES.jump.h / 2 - 13,
      touch.pressed.jump ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
    );
    btn(ZONES.restart, touch.pressed.restart);
    btn(ZONES.mute, touch.pressed.mute);
    ctx.textAlign = 'center';
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('R', ZONES.restart.x + ZONES.restart.w / 2, ZONES.restart.y + 17);
    ctx.fillText('♪', ZONES.mute.x + ZONES.mute.w / 2, ZONES.mute.y + 15);
    if (showAtk) {
      btn(ZONES.attack, touch.pressed.attack);
      ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = touch.pressed.attack ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
      ctx.fillText('⚔', ZONES.attack.x + ZONES.attack.w / 2, ZONES.attack.y + 36);
    }
    ctx.textAlign = 'left';
  }

  // 畫一條有粗細的線段——火柴人的四肢、龍鬚都靠它
  function limb(x1, y1, x2, y2, color, w = 2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
    quad(x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny, color);
  }

  // ── 火柴人劍士 ──────────────────────────────────────────
  // 打鬥模式的玩家。白圈頭、黑身、青色頭帶飄在腦後——
  // 跑有跑的腿、跳有跳的腿、揮刀時前臂跟著刀的角度走。
  function drawStickman(p, slash, time) {
    const dir = p.facing < 0 ? -1 : 1;
    const cx = p.x + p.w / 2;
    const top = p.y - 3;
    const hipY = p.y + 8;
    const feetY = p.y + p.h;
    const body = '#16181f';

    // 腿:地上照步伐剪刀腳,空中收膝
    const airborne = Math.abs(p.vy) > 8 || !p.grounded;
    if (airborne) {
      limb(cx, hipY, cx - dir * 4, feetY - 3, body);
      limb(cx, hipY, cx + dir * 3, feetY - 1, body);
    } else if (Math.abs(p.vx) > 8) {
      const ph = Math.floor(p.x / 9) % 2 === 0 ? 1 : -1;
      limb(cx, hipY, cx + ph * 4, feetY, body);
      limb(cx, hipY, cx - ph * 4, feetY, body);
    } else {
      limb(cx, hipY, cx - 2, feetY, body);
      limb(cx, hipY, cx + 2, feetY, body);
    }
    // 軀幹
    limb(cx, top + 8, cx, hipY, body, 3);
    // 後手:自然垂在身後
    limb(cx, top + 9, cx - dir * 5, top + 14, body);
    // 前手:跟著刀的角度(跟 drawSword 同一條公式,劍才會長在手上)
    const prog = slash > 0 ? 1 - slash / 0.16 : 0;
    const ang = slash > 0 ? (-70 + 110 * prog) * (Math.PI / 180) : -50 * (Math.PI / 180);
    const hx = cx + Math.cos(ang) * dir * 7;
    const hy = top + 10 + Math.sin(ang) * 7;
    limb(cx, top + 9, hx, hy, body);
    // 頭:白圈黑心
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(cx - 4, top - 4, 8, 8);
    ctx.fillStyle = body;
    ctx.fillRect(cx - 3, top - 3, 6, 6);
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(cx + dir, top - 1, 2, 2);   // 眼神看向前方
    // 頭帶:青色,尾端照時間飄
    ctx.fillStyle = '#39d0d0';
    ctx.fillRect(cx - 4, top - 2, 8, 2);
    const fl = Math.sin(time * 6) * 2;
    ctx.fillRect(cx - dir * 6, top - 2 + fl, 3, 2);
    ctx.fillRect(cx - dir * 9, top - 1 - fl, 3, 2);
  }

  // ── 龍 ────────────────────────────────────────────────
  // 東方長龍:一節一節的蛇身沿著波浪起伏、鹿角、龍鬚、金腹鱗。
  // 狀態全寫在姿勢上:張嘴=要吐火、壓平貼地=要衝、垂頭=你的回合。
  // 快打旋風的規矩:每一招都先講,躲不掉是你的事。
  function drawDragon(d, won, wonT, time = 0) {
    const flat = d.state === 'charge';
    const x = Math.round(d.x);
    const dir = d.face;
    const hit = d.flash > 0;
    const alpha = won ? Math.max(0.15, 1 - wonT * 0.4) : 1;
    ctx.globalAlpha = alpha;

    const bodyC = hit ? '#ffe0d0' : '#a83226';
    const darkC = hit ? '#ffc9b0' : '#7a1c1c';
    const bellyC = hit ? '#fff0d0' : '#e8c46a';
    const baseY = flat ? 14 * TILE - 14 : d.y + 20;
    const amp = flat ? 2 : 9;                       // 蛇身波浪的振幅,衝撞時壓平
    const mouthOpen = d.state === 'aim' || d.state === 'fire' || d.swipeT >= 0;
    const droop = d.state === 'tired' ? 10 : 0;     // 喘氣時整顆頭垂下來

    // 衝撞的速度線
    if (flat) {
      ctx.fillStyle = 'rgba(255,138,42,0.4)';
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(x + (d.chargeDir < 0 ? d.w + i * 10 : -i * 10 - 8), baseY - 6 + i * 5, 12, 2);
      }
    }

    // 蛇身:9 節,從尾巴畫到脖子,每一節沿著波浪起伏、越尾越細。
    // 波浪吃 time,牠站著不動也一直在游——長龍就是要一直在動。
    const headX = dir < 0 ? x + 8 : x + d.w - 8;
    const segs = 9;
    for (let i = segs - 1; i >= 0; i--) {
      const sx = headX - dir * (10 + i * 7.4);
      const sy = baseY + Math.sin(time * 2.6 + i * 0.85) * amp * (i < 2 ? 0.4 : 1);
      const r = i === segs - 1 ? 4 : 9 - i * 0.55;   // 尾端收細
      ctx.fillStyle = i % 2 === 0 ? bodyC : (hit ? '#ffd9c4' : '#93281f');
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      // 金腹鱗
      ctx.fillStyle = bellyC;
      ctx.fillRect(sx - r + 2, sy + r - 4, r * 2 - 4, 3);
      // 背鰭:每一節一片小三角,跟著波浪走
      if (i > 0 && i < segs - 1) {
        tri(sx - 4, sy - r + 1, sx + 4, sy - r + 1, sx, sy - r - 7, hit ? '#ffc9b0' : '#e0563c');
      }
    }
    // 尾端的尾鰭:三叉,像一把小扇子
    const tailX = headX - dir * (10 + segs * 7.4);
    const tailY = baseY + Math.sin(time * 2.6 + segs * 0.85) * amp;
    const swipeUp = d.swipeT >= 0 && d.swipeT < 0.4;
    const tY = swipeUp ? tailY - 18 : tailY;
    tri(tailX, tY, tailX - dir * 14, tY - 10, tailX - dir * 8, tY, '#e0563c');
    tri(tailX, tY, tailX - dir * 16, tY, tailX - dir * 8, tY + 2, '#c9432e');
    tri(tailX, tY, tailX - dir * 14, tY + 10, tailX - dir * 8, tY + 4, '#a83226');

    // 頭:方吻、上揚的眉骨——東方龍的臉是「長」的
    const hx = dir < 0 ? x - 20 : x + d.w - 8;
    const hy = baseY - 14 + droop + (flat ? 6 : Math.sin(time * 2.6 + 0.4) * 3);
    ctx.fillStyle = bodyC;
    ctx.fillRect(hx, hy, 28, 14);                          // 頭殼
    ctx.fillStyle = darkC;
    ctx.fillRect(dir < 0 ? hx - 8 : hx + 20, hy + 4, 16, 10);   // 吻部
    // 下顎:張嘴時掉下來,嘴裡有火光
    ctx.fillStyle = darkC;
    ctx.fillRect(dir < 0 ? hx - 8 : hx + 18, hy + 12 + (mouthOpen ? 6 : 2), 18, 4);
    if (mouthOpen) {
      ctx.fillStyle = Math.floor(time * 10) % 2 ? '#ff8a2a' : '#ffd75e';
      ctx.fillRect(dir < 0 ? hx - 6 : hx + 20, hy + 12, 14, 6);
    }
    // 鹿角:主枝+分岔,兩支——龍的身分證
    const ax0 = dir < 0 ? hx + 18 : hx + 4;
    tri(ax0, hy, ax0 + 4, hy, ax0 + 2 - dir * 8, hy - 16, '#e8e0d0');
    tri(ax0 + 1 - dir * 4, hy - 8, ax0 + 3 - dir * 4, hy - 8, ax0 - dir * 12, hy - 12, '#d8d0c0');
    const ax1 = dir < 0 ? hx + 10 : hx + 12;
    tri(ax1, hy, ax1 + 3, hy, ax1 + 1 - dir * 6, hy - 11, '#d8d0c0');
    // 龍鬚:兩根細長的觸鬚,往前飄
    const wy = hy + 9;
    const wx = dir < 0 ? hx - 8 : hx + 36;
    limb(wx, wy, wx + dir * 12, wy + 4 + Math.sin(time * 4) * 2, '#ffd75e', 1.4);
    limb(wx, wy + 3, wx + dir * 10, wy + 9 + Math.sin(time * 4 + 1) * 2, '#ffd75e', 1.4);
    // 眼睛:平常金燈,喘氣變灰
    ctx.fillStyle = d.state === 'tired' ? '#555' : '#ffd75e';
    ctx.fillRect(dir < 0 ? hx + 6 : hx + 16, hy + 3, 6, 3);
    ctx.fillStyle = '#101218';
    ctx.fillRect(dir < 0 ? hx + 8 : hx + 18, hy + 3, 2, 3);
    // 鬃毛:頭後緣一撮火焰色
    tri(dir < 0 ? hx + 28 : hx, hy + 2, dir < 0 ? hx + 28 : hx, hy + 12, dir < 0 ? hx + 38 : hx - 10, hy + 4, '#e0563c');

    ctx.globalAlpha = 1;
  }

  // 手裡那把劍。平舉是待機,揮下去掃一道 110° 的弧——
  // 動作只有 0.16 秒,但玩家看得出「我剛剛揮了一刀」。
  function drawSword(p, slash) {
    const dir = p.facing < 0 ? -1 : 1;
    const px = dir < 0 ? p.x - 1 : p.x + p.w + 1;   // 握把在手上
    const py = p.y + 8;
    // 揮劍進度 0→1:從上舉 -70° 掃到 +40°
    const prog = slash > 0 ? 1 - slash / 0.16 : 0;
    const ang = slash > 0
      ? (-70 + 110 * prog) * (Math.PI / 180)
      : -50 * (Math.PI / 180);
    const cos = Math.cos(ang) * dir, sin = Math.sin(ang);
    const len = 20;
    // 劍身(亮鋼)+ 劍脊(白)
    quad(
      px, py,
      px + sin * 2, py - cos * 0 - 2,
      px + cos * len + sin * 2, py + sin * len - 2,
      px + cos * len, py + sin * len + 1,
      '#cfd6e4',
    );
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(px + cos * len - 1, py + sin * len - 1, 2, 2);
    // 護手(金)與握把(棕)
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(px - 2, py - 2, 4, 5);
    ctx.fillStyle = '#7a4b26';
    ctx.fillRect(px - dir * 3 - 1, py, 3, 4);
  }

  // SF 式血條:外框、底色、亮黃血量、掉血殘影(紅)。
  // anchor = 1 表示血從外側往中間掉(左方玩家),-1 相反。
  function hpBar(x, y, w, hp, shown, max, anchor) {
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(x - 2, y - 2, w + 4, 14);
    ctx.fillStyle = '#101218';
    ctx.fillRect(x, y, w, 10);
    const cur = Math.max(0, hp) / max * w;
    const ghost = Math.max(0, shown) / max * w;
    const gx = anchor > 0 ? x + w - ghost : x;
    const cx2 = anchor > 0 ? x + w - cur : x;
    // 殘影先畫(紅),真血蓋上去(黃),中間露出來的紅就是剛剛掉的那截
    ctx.fillStyle = '#c2372f';
    ctx.fillRect(gx, y, ghost, 10);
    const low = hp / max <= 0.3;
    ctx.fillStyle = low ? '#ff5a36' : '#ffd12e';
    ctx.fillRect(cx2, y, cur, 10);
    ctx.fillStyle = low ? '#ffd0b8' : '#fff3b8';
    ctx.fillRect(cx2, y, cur, 3);
  }

  // 打鬥模式的外掛層:對峙血條、ROUND/FIGHT!、火花、連擊、K.O.。
  // 場地本身還是 drawWorld 畫的——同一個世界,換了街機的文法。
  function drawFightLayer(f) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 腳下的影子,人跟龍都有——沒有影子的角色是浮在畫面上的貼圖
    ctx.fillStyle = 'rgba(5,6,10,0.25)';
    if (f.phase === 'play') {
      ctx.fillRect(f.player.x - 3, 14 * TILE - 3, f.player.w + 6, 3);
    }
    ctx.fillRect(f.dragon.x + 4, 14 * TILE - 3, f.dragon.w - 8, 3);

    drawDragon(f.dragon, f.won, f.wonT, f.time);

    // 手裡的劍(無敵閃爍時跟人一起消失)
    const blinkNow = f.invuln > 0 && Math.floor(f.invuln * 16) % 2 === 0;
    if (f.phase === 'play' && !blinkNow) drawSword(f.player, f.slash);

    // 劍光:揮刀時的白弧殘影;第三段重斬的弧更大、帶青色
    if (f.slash > 0 && f.phase === 'play') {
      const p = f.player;
      const dir = p.facing < 0 ? -1 : 1;
      const reach = f.power > 0 ? 38 : 26;
      const sx = dir < 0 ? p.x - reach : p.x + p.w;
      ctx.globalAlpha = Math.min(0.8, f.slash / 0.16 + 0.1);
      tri(
        sx + (dir < 0 ? reach : 0), p.y - (f.power > 0 ? 14 : 8),
        sx + (dir < 0 ? reach : 0), p.y + 20,
        sx + (dir < 0 ? 0 : reach), p.y + 6,
        f.power > 0 ? '#aef2f2' : '#f4f7ff',
      );
      ctx.globalAlpha = 1;
    }

    // 迴旋斬:繞著人掃一圈的青色光環
    if (f.spin > 0 && f.phase === 'play') {
      const p = f.player;
      const cx2 = p.x + p.w / 2, cy2 = p.y + p.h / 2;
      const prog = 1 - f.spin / 0.3;
      ctx.globalAlpha = Math.min(0.85, f.spin / 0.3 + 0.2);
      for (let i = 0; i < 10; i++) {
        const a = prog * 9 + (i / 10) * Math.PI * 2;
        const r = 26 + i % 2 * 4;
        ctx.fillStyle = i % 2 ? '#aef2f2' : '#f4f7ff';
        ctx.fillRect(cx2 + Math.cos(a) * r - 2, cy2 + Math.sin(a) * r * 0.7 - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    // 下劈:刀尖朝下的速度線
    if (f.plunging && f.phase === 'play') {
      const p = f.player;
      ctx.fillStyle = 'rgba(244,247,255,0.6)';
      ctx.fillRect(p.x + 1, p.y - 16, 2, 14);
      ctx.fillRect(p.x + p.w - 3, p.y - 12, 2, 10);
      tri(p.x - 2, p.y + p.h, p.x + p.w + 2, p.y + p.h, p.x + p.w / 2, p.y + p.h + 14, '#f4f7ff');
    }

    // 升龍斬:向上竄的青色殘影
    if (f.upper > 0 && f.phase === 'play') {
      const p = f.player;
      ctx.globalAlpha = Math.min(0.8, f.upper / 0.35 + 0.15);
      tri(p.x - 6, p.y + p.h, p.x + p.w + 6, p.y + p.h, p.x + p.w / 2, p.y - 30, '#aef2f2');
      ctx.globalAlpha = 1;
    }

    // 蓄力提示:長按攻擊時,人身上漸漸亮起金光——放開就是迴旋斬
    if (f.holdT > 0.3 && f.phase === 'play') {
      const p = f.player;
      const g = Math.min(0.5, (f.holdT - 0.3) * 1.2);
      ctx.fillStyle = `rgba(255,215,94,${g.toFixed(2)})`;
      ctx.fillRect(p.x - 4, p.y - 6, p.w + 8, p.h + 10);
    }

    // 技能欄:左下角三格,冷卻用暗罩由上往下退
    const skills = [
      { label: '空', cd: 0, max: 1 },                       // 下劈:無冷卻
      { label: '升', cd: f.upperCd, max: 4 },
      { label: '旋', cd: f.spinCd, max: 3 },
    ];
    skills.forEach((s, i) => {
      const sx2 = 10 + i * 22, sy2 = VIEW_H - 26;
      ctx.fillStyle = 'rgba(5,6,10,0.55)';
      ctx.fillRect(sx2, sy2, 18, 18);
      ctx.fillStyle = s.cd > 0 ? '#6f779b' : '#ffd75e';
      ctx.fillRect(sx2, sy2, 18, 1);
      ctx.fillRect(sx2, sy2 + 17, 18, 1);
      ctx.fillRect(sx2, sy2, 1, 18);
      ctx.fillRect(sx2 + 17, sy2, 1, 18);
      ctx.font = '9px "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = s.cd > 0 ? '#9aa3b5' : '#f4f7ff';
      ctx.fillText(s.label, sx2 + 9, sy2 + 13);
      if (s.cd > 0) {
        ctx.fillStyle = 'rgba(5,6,10,0.65)';
        ctx.fillRect(sx2 + 1, sy2 + 1, 16, 16 * (s.cd / s.max));
      }
      ctx.textAlign = 'left';
    });

    // 氣功彈:圓形的青白能量球,拖著淡出的殘影——火柴人格鬥的招牌
    for (const b of f.beams) {
      const dir2 = b.vx < 0 ? -1 : 1;
      const cx3 = b.x + b.w / 2, cy3 = b.y + b.h / 2;
      for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = `rgba(88,200,220,${(0.3 - i * 0.08).toFixed(2)})`;
        ctx.fillRect(cx3 - dir2 * i * 8 - 5, cy3 - 5, 10, 10);
      }
      ctx.fillStyle = 'rgba(120,230,240,0.5)';
      ctx.fillRect(cx3 - 9, cy3 - 9, 18, 18);
      ctx.fillStyle = '#39d0d0';
      ctx.fillRect(cx3 - 7, cy3 - 7, 14, 14);
      ctx.fillStyle = '#d8ffff';
      ctx.fillRect(cx3 - 4, cy3 - 4, 8, 8);
    }

    // 命中火花:八方迸射的星芒,黃白相間——街機的打點就長這樣
    if (f.spark) {
      const s = f.spark;
      const r = 6 + (0.18 - s.t) * 90;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const len = i % 2 === 0 ? r : r * 0.55;
        ctx.globalAlpha = Math.min(1, s.t / 0.18 + 0.15);
        tri(
          s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3,
          s.x + Math.cos(a + 0.35) * 3, s.y + Math.sin(a + 0.35) * 3,
          s.x + Math.cos(a + 0.17) * len, s.y + Math.sin(a + 0.17) * len,
          i % 2 === 0 ? '#fff6d8' : '#ffd12e',
        );
      }
      ctx.globalAlpha = 1;
    }

    // ── 街機抬頭顯示:兩條血條對峙,中間是回合計時 ──
    const bw2 = 176;
    hpBar(16, 14, bw2, f.playerHp, f.shownPlayerHp, f.maxPlayerHp, 1);
    hpBar(VIEW_W - 16 - bw2, 14, bw2, f.dragon.hp, f.dragon.shownHp, f.dragon.maxHp, -1);
    ctx.textAlign = 'left';
    ctx.font = 'bold 8px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#f4f7ff';
    ctx.fillText('YOU', 16, 34);
    ctx.textAlign = 'right';
    ctx.fillText('牠', VIEW_W - 16, 34);
    // 中間的回合秒數,街機的 99 倒數換成正數——這裡的時間是拿去排行榜的
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Consolas, monospace';
    ctx.fillStyle = '#f4f7ff';
    ctx.fillText(String(Math.min(99, Math.floor(f.time))), VIEW_W / 2, 24);
    ctx.font = '7px Consolas, monospace';
    ctx.fillStyle = C.ui;
    ctx.fillText(`ROUND ${f.round}`, VIEW_W / 2, 33);

    // 連擊數:2 連以上才好意思顯示
    if (f.combo >= 2) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillStyle = '#3a2c05';
      ctx.fillText(`${f.combo} HITS!`, 22, 66);
      ctx.fillStyle = '#ffd12e';
      ctx.fillText(`${f.combo} HITS!`, 20, 64);
    }

    // ROUND N → FIGHT! 報幕
    if (!f.won && f.phase === 'play' && f.roundT < 1.4) {
      ctx.textAlign = 'center';
      if (f.roundT < 0.8) {
        ctx.font = 'bold 24px Consolas, monospace';
        ctx.fillStyle = '#101218';
        ctx.fillText(`ROUND ${f.round}`, VIEW_W / 2 + 2, VIEW_H / 2 + 2);
        ctx.fillStyle = '#f4f7ff';
        ctx.fillText(`ROUND ${f.round}`, VIEW_W / 2, VIEW_H / 2);
      } else {
        const pop = clamp01((f.roundT - 0.8) / 0.15);
        ctx.font = `bold ${Math.round(18 + 14 * pop)}px Consolas, monospace`;
        ctx.fillStyle = '#3a0f0f';
        ctx.fillText('FIGHT!', VIEW_W / 2 + 2, VIEW_H / 2 + 2);
        ctx.fillStyle = '#ff5a36';
        ctx.fillText('FIGHT!', VIEW_W / 2, VIEW_H / 2);
      }
    }

    // 敗北:你倒下了。K.O. 打在你身上。
    if (f.lost) {
      ctx.textAlign = 'center';
      if (f.lostT < 1.1) {
        const pop = clamp01(f.lostT / 0.25);
        ctx.font = `bold ${Math.round(20 + 26 * pop)}px Consolas, monospace`;
        ctx.fillStyle = '#101218';
        ctx.fillText('K.O.', VIEW_W / 2 + 3, VIEW_H / 2 + 3);
        ctx.fillStyle = '#c2372f';
        ctx.fillText('K.O.', VIEW_W / 2, VIEW_H / 2);
      } else {
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#101218';
        ctx.fillText('屠 龍 失 敗', VIEW_W / 2 + 2, VIEW_H / 2 + 2);
        ctx.fillStyle = '#c2372f';
        ctx.fillText('屠 龍 失 敗', VIEW_W / 2, VIEW_H / 2);
      }
      ctx.textAlign = 'left';
    }

    // K.O. → 屠龍成功
    if (f.won) {
      ctx.textAlign = 'center';
      if (f.wonT < 0.15) {
        ctx.fillStyle = `rgba(255,255,255,${(0.8 * (1 - f.wonT / 0.15)).toFixed(2)})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      if (f.wonT < 1.1) {
        const pop = clamp01(f.wonT / 0.25);
        ctx.font = `bold ${Math.round(20 + 26 * pop)}px Consolas, monospace`;
        ctx.fillStyle = '#3a0f0f';
        ctx.fillText('K.O.', VIEW_W / 2 + 3, VIEW_H / 2 + 3);
        ctx.fillStyle = '#ff5a36';
        ctx.fillText('K.O.', VIEW_W / 2, VIEW_H / 2);
      } else {
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#3a2c05';
        ctx.fillText('屠 龍 成 功', VIEW_W / 2 + 2, VIEW_H / 2 + 2);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText('屠 龍 成 功', VIEW_W / 2, VIEW_H / 2);
      }
    }
    ctx.textAlign = 'left';
  }

  // 開場畫面。陽光草地、被殭屍追著跑的方塊人——看起來是快樂遊戲,
  // 這個第一印象本身就是全遊戲的第一個陷阱。
  function drawIntro(t, creator = false, mobile = false) {
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
      ctx.fillText(mobile ? '點 擊 螢 幕 開 始' : '按 任 意 鍵 開 始', VIEW_W / 2, 190);
    }

    // 密碼打對了才會出現。不提示有密碼這回事——知道的人自然知道。
    if (creator) {
      ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('★ 創造者模式已啟用 — N 下一關 / B 上一關 ★', VIEW_W / 2, 212);
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

    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    ctx.textAlign = 'center';

    // 撿劍轉場:不報關卡編號了,報武器
    if (session.pendingFight) {
      const pop2 = clamp01((t - SWEEP_IN) / 0.3);
      ctx.font = `bold ${Math.round(10 + 10 * pop2)}px "Microsoft JhengHei", sans-serif`;
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('⚔ 你撿起了一把劍', cx, cy - 6);
      ctx.font = '11px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#e04b4b';
      ctx.fillText(typed('J / X 揮劍。牠在等你。', t, SWEEP_IN + 0.3, 0.5), cx, cy + 16);
      ctx.textAlign = 'left';
      return;
    }

    const next = session.revealed
      ? session.world.level
      : (session.levels[session.index + 1] ?? session.world.level);

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

    // BOSS 沒見你的原因,寫在你臉上
    if (session.bossLocked) {
      ctx.font = '9px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#ff8a5c';
      ctx.fillText(
        `BOSS 還在沉睡:總死亡 ${session.totalDeaths} > ${session.bossLocked}——死少一點再來`,
        cx, 88,
      );
    } else if (session.bossCleared) {
      ctx.font = '9px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('⭐ 屠龍成功', cx, 88);
    } else if (session.bossFailed) {
      ctx.font = '9px "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#ff8a5c';
      ctx.fillText('屠龍失敗——牠還在那裡等你', cx, 88);
    }

    // 全球排行榜——所有人的成績都在同一張榜上,前十名攤開。
    // 雲端還在同步或斷線時,先顯示本機紀錄,狀態寫在標題旁邊。
    const board = (session.leaderboard ?? []).slice(0, 10);
    if (t > 0.5) {
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('─────  WORLD BEST TIMES  ─────', cx, 98);
      if (session.boardStatus === 'loading') {
        ctx.font = '8px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = C.ui;
        ctx.fillText('同步中…', cx + 140, 98);
      } else if (session.boardStatus === 'offline') {
        ctx.font = '8px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = C.uiHot;
        ctx.fillText('離線:只顯示本機紀錄', cx, 250);
      }
      ctx.font = '10px "Microsoft JhengHei", Consolas, monospace';
      board.forEach((r, i) => {
        if (t < 0.5 + i * 0.12) return;   // 一行一行浮出來
        const mine = `${r.name}|${r.time}|${r.deaths}` === session.lastKey;
        const y = 114 + i * 14;
        if (mine) {
          ctx.fillStyle = 'rgba(143,214,160,0.16)';
          ctx.fillRect(cx - 150, y - 10, 300, 13);
        }
        ctx.fillStyle = mine ? C.scan : (i === 0 ? '#ffd75e' : '#d8dae6');
        const rank = i === 0 ? '♛1' : `${i + 1}`;
        ctx.fillText(
          `${rank}.  ${r.boss ? '⭐' : ''}${r.name ?? '匿名'}   ${fmtTime(r.time)}   死 ${r.deaths}   ${r.date}${mine ? ' ◄' : ''}`,
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
    // 打鬥模式:fight 物件長得跟 world 一樣,場地直接用 drawWorld 畫,
    // 龍、劍光跟血條疊在上面。
    if (session.phase === 'fight') {
      session.fight.hudTime = session.totalTime;
      session.fight.creator = session.world.creator;
      drawWorld(session.fight, shake);
      drawFightLayer(session.fight);
      return;
    }
    // 計時器是 session 的東西,每幀塞給 world 帶進去畫——
    // drawWorld 不必認識 session
    session.world.hudTime = session.totalTime;
    drawWorld(session.world, shake);
    if (session.phase === 'transition') drawTransition(session);
  }

  resize();
  window.addEventListener('resize', resize);
  return { resize, draw, drawIntro, drawAsk, drawTouchButtons };
}
