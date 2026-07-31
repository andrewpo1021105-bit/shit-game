import { createPlayer, updatePlayer } from './player.js';
import { TILE, DEFAULT_TUNE } from './constants.js';

// 打鬥模式。打贏第 18 關的人撿起一把劍,走進這個房間——
// 從這裡開始它不再是整人遊戲,是一場正面對決:
// 一隻龍,三種招式,全部有預備動作、全部躲得掉、全部確定性。
// 招式的節奏照著快打旋風的文法寫:飛行道具(火球)、
// 蓄力突進(低身衝撞)、還有懲罰貼臉亂摸的近身尾擊。

// 競技場:一個畫面大的空房間。這裡唯一的機關就是牠。
const ROOM = [
  '##############################',
  ...Array(13).fill('#............................#'),
  '##############################',
  '##############################',
  '##############################',
];

// 給渲染器認的關卡殼。不進 LEVELS——它不是平台關卡,規則測試管不到它。
export const FIGHT_LEVEL = {
  id: 19,
  name: '牠',
  render3d: true,
  boss: true,
  tiles: ROOM,
  spawn: [3, 13],
  door: [-9, -9],   // 沒有門。這一戰打贏才算出口。
  traps: [],
};

const FLOOR_Y = 14 * TILE;          // 地板頂面
const DRAGON_W = 76;
const DRAGON_H = 44;
const DRAGON_FLAT = 24;             // 衝撞時壓低的高度——跳得過去,這是活路
const CHARGE_SPEED = 250;
const FIREBALL_SPEED = 150;
const SLASH_CD = 0.42;              // 劍的冷卻:不是按越快越強
const SLASH_TIME = 0.16;
const DRAGON_HP = 16;
const PLAYER_HP = 4;                // 格鬥遊戲的文法:被打是扣血擊退,不是秒死
const ROUND_IN = 1.4;               // ROUND N → FIGHT! 的開場讀秒,期間雙方站樁

export function createFight() {
  return {
    // world 形狀的殼,drawWorld 直接吃得下
    level: FIGHT_LEVEL,
    map: ROOM.slice(),
    player: createPlayer(3, 13),
    door: { x: -9, y: -9 },
    decoys: [],
    enemies: [],
    hazards: [],      // 龍的火球放這裡,渲染共用 drawHazard
    glitch: null,
    flipped: false,
    doorLock: 0,
    fakeKind: null,
    time: 0,
    phase: 'play',    // 'play' | 'dying'
    phaseTimer: 0,
    deaths: 0,
    events: [],

    // 劍與連擊。三段連擊是火柴人格鬥的文法:
    // 一段、二段是普通斬,0.8 秒內接上第三段會前衝重斬+放出氣功彈。
    slash: 0,
    slashCd: 0,
    chain: 0,        // 連擊段數 0→1→2→3(第三段是重斬)
    chainT: 0,       // 連擊窗口:超時歸零重來
    power: 0,        // 重斬的演出時間(畫大刀光用)
    beams: [],       // 氣功彈 {x, y, w, h, vx}
    stickman: true,  // 打鬥模式的玩家畫成火柴人劍士(render 讀這個旗子)

    // 格鬥遊戲的行頭:血量、回合、打擊停頓、無敵時間、火花、連擊
    playerHp: PLAYER_HP,
    maxPlayerHp: PLAYER_HP,
    shownPlayerHp: PLAYER_HP,   // 血條殘影(SF 掉血時那截慢慢縮的紅)
    round: 1,
    roundT: 0,
    hitstop: 0,                 // 命中瞬間全世界靜止一拍——打擊感的來源
    invuln: 0,                  // 挨打後的無敵閃爍
    spark: null,                // 命中火花 {x, y, t}
    combo: 0,
    comboT: 0,

    // 單命制:倒下一次就是屠龍失敗。這一戰沒有續關投幣。
    lost: false,
    lostT: 0,

    // 牠
    dragon: {
      x: 20 * TILE,
      y: FLOOR_Y - DRAGON_H,
      w: DRAGON_W,
      h: DRAGON_H,
      homeX: 20 * TILE,
      hp: DRAGON_HP,
      maxHp: DRAGON_HP,
      shownHp: DRAGON_HP,
      face: -1,
      state: 'rest',   // rest → aim → fire ×3 → rest → crouch → charge → tired → …
      t: 0,
      cycle: 0,
      fired: 0,
      flash: 0,        // 挨刀的白閃
      swipeT: -1,      // 近身尾擊的計時(-1 = 沒在揮)
    },

    won: false,
    wonT: 0,
    done: false,
  };
}

const overlap = (a, b) =>
  a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;

function dragonBox(d) {
  // 衝撞時壓低身體貼地滑——留出跳過去的空間,這一招才是招式而不是牆
  if (d.state === 'charge') return { x: d.x, y: FLOOR_Y - DRAGON_FLAT, w: d.w, h: DRAGON_FLAT };
  return { x: d.x, y: d.y, w: d.w, h: d.h };
}

// 倒下=屠龍失敗。沒有下一回合,沒有續關投幣——
// 這一戰的重量就是從「只有一條命」來的。
function die(f) {
  if (f.phase !== 'play') return;
  f.phase = 'dying';
  f.deaths += 1;
  f.lost = true;
  f.lostT = 0;
  f.events.push('death');
  f.events.push('roar');
}

// 挨一下:扣血、擊退、無敵閃爍、打擊停頓——快打旋風的完整流程。
// 血歸零才算真的倒下。
function hurt(f, fromX) {
  if (f.invuln > 0 || f.phase !== 'play') return;
  f.playerHp -= 1;
  f.hitstop = 0.12;
  f.invuln = 1.0;
  const p = f.player;
  f.spark = { x: p.x + p.w / 2, y: p.y + 6, t: 0.18 };
  // 往攻擊來源的反方向彈開
  const dir = p.x + p.w / 2 < fromX ? -1 : 1;
  p.vx = dir * 170;
  p.vy = -150;
  f.events.push('hurt');
  if (f.playerHp <= 0) die(f);
}

// 龍受傷:白閃、火花、連擊、打擊停頓,一條龍服務。重斬傷害翻倍。
function damageDragon(f, hitX, hitY, dmg = 1) {
  f.dragon.hp -= dmg;
  f.dragon.flash = 0.22;
  f.hitstop = dmg > 1 ? 0.14 : 0.09;   // 重斬的停頓更長,那一下要「重」
  f.combo += 1;
  f.comboT = 2.2;
  f.spark = { x: hitX, y: hitY, t: 0.18 };
  f.events.push('hit');
  if (f.dragon.hp <= 0) {
    f.won = true;
    f.hitstop = 0;
    f.events.push('win');
    f.events.push('roar');
  }
}

function spitFireball(f) {
  const d = f.dragon;
  f.hazards.push({
    kind: 'fire',
    x: d.face < 0 ? d.x - 16 : d.x + d.w + 2,
    y: FLOOR_Y - 14,   // 貼地飛——跳起來就躲得掉,站著不動就中
    w: 14, h: 12,
    vx: d.face * FIREBALL_SPEED,
  });
  f.events.push('spike');
}

function updateDragon(f, dt) {
  const d = f.dragon;
  const p = f.player;
  d.t += dt;
  d.flash = Math.max(0, d.flash - dt);
  d.face = p.x + p.w / 2 < d.x + d.w / 2 ? -1 : 1;

  // 近身尾擊:休息時貼牠太近,牠會用尾巴教你什麼叫距離管理。
  // 0.4 秒預備、0.2 秒判定——看得見,退得開。
  if (d.swipeT >= 0) {
    d.swipeT += dt;
    if (d.swipeT >= 0.4 && d.swipeT < 0.6) {
      const reach = {
        x: d.face < 0 ? d.x - 30 : d.x + d.w,
        y: d.y + d.h - 30,
        w: 30, h: 30,
      };
      if (overlap(reach, p)) { hurt(f, d.x + d.w / 2); return; }
    }
    if (d.swipeT >= 0.6) d.swipeT = -1;
    return;   // 揮尾巴的時候不做別的事
  }

  switch (d.state) {
    case 'rest':
      if ((d.state === 'rest') && d.t >= 1.3) {
        d.state = d.cycle % 2 === 0 ? 'aim' : 'crouch';
        d.cycle += 1;
        d.t = 0;
        d.fired = 0;
        f.events.push('roar');
      } else if (Math.abs((p.x + p.w / 2) - (d.x + d.w / 2)) < d.w / 2 + 26 && d.swipeT < 0) {
        d.swipeT = 0;   // 貼太近,起手尾擊
      }
      break;
    case 'aim':
      // 張嘴蓄力——這 0.7 秒就是「要吐火了」的告示
      if (d.t >= 0.7) { d.state = 'fire'; d.t = 0; }
      break;
    case 'fire':
      // 三發,固定節奏。像那個蹲在畫面另一端丟波動拳的人。
      if (d.fired < 3 && d.t >= 0.2 + d.fired * 0.9) {
        spitFireball(f);
        d.fired += 1;
      }
      if (d.t >= 2.4) { d.state = 'rest'; d.t = 0; }
      break;
    case 'crouch':
      // 壓低身體——這 0.8 秒是「要衝過來了」的告示
      if (d.t >= 0.8) { d.state = 'charge'; d.t = 0; d.chargeDir = d.face; }
      break;
    case 'charge': {
      d.x += d.chargeDir * CHARGE_SPEED * dt;
      const leftWall = TILE, rightWall = 29 * TILE - d.w;
      if (d.x <= leftWall || d.x >= rightWall) {
        d.x = Math.max(leftWall, Math.min(d.x, rightWall));
        d.state = 'tired';
        d.t = 0;
        f.events.push('thud');
      }
      if (overlap(dragonBox(d), p)) { hurt(f, d.x + d.w / 2); return; }
      break;
    }
    case 'tired':
      // 撞完牆會喘。這 2.2 秒就是你的回合。
      if (d.t >= 2.2) { d.state = 'rest'; d.t = 0; }
      break;
    default:
      break;
  }
}

export function updateFight(f, input, dt) {
  f.events = [];
  if (f.done) return;
  f.time += dt;

  // 血條殘影追趕(SF 掉血時慢慢縮回去的那截)
  f.dragon.shownHp += (f.dragon.hp - f.dragon.shownHp) * Math.min(1, 4 * dt);
  f.shownPlayerHp += (f.playerHp - f.shownPlayerHp) * Math.min(1, 4 * dt);
  if (f.spark) {
    f.spark.t -= dt;
    if (f.spark.t <= 0) f.spark = null;
  }

  // 勝利演出:牠倒下,慢慢沉進地板
  if (f.won) {
    f.wonT += dt;
    f.dragon.y += 14 * dt;
    if (f.wonT >= 2.4) f.done = true;
    return;
  }

  // 敗北演出:你倒下了。屠龍失敗,沒有第二次。
  if (f.lost) {
    f.lostT += dt;
    if (f.lostT >= 2.4) f.done = true;
    return;
  }

  // 打擊停頓:命中的那一拍,全世界靜止。打擊感就是從這裡來的。
  if (f.hitstop > 0) {
    f.hitstop -= dt;
    return;
  }

  // ROUND N → FIGHT! 的報幕。讀秒期間雙方站樁,這是規矩。
  f.roundT += dt;
  if (f.roundT < ROUND_IN) return;

  if (f.invuln > 0) f.invuln -= dt;
  f.comboT -= dt;
  if (f.comboT <= 0) f.combo = 0;

  updatePlayer(f.player, f.map, input, dt, DEFAULT_TUNE);

  // 劍與三段連擊。有冷卻——這是節奏遊戲,不是滑鼠連點測試。
  f.slashCd = Math.max(0, f.slashCd - dt);
  f.slash = Math.max(0, f.slash - dt);
  f.power = Math.max(0, f.power - dt);
  f.chainT = Math.max(0, f.chainT - dt);
  if (f.chainT <= 0) f.chain = 0;
  if (input.attack && f.slashCd <= 0) {
    f.chain += 1;
    f.chainT = 0.8;
    f.slash = SLASH_TIME;
    f.slashCd = SLASH_CD;
    f.events.push('swing');
    const p = f.player;
    const finisher = f.chain >= 3;
    if (finisher) {
      // 第三段:前衝重斬。人往前竄一步,刀更長、傷害翻倍,
      // 順手放出一顆氣功彈——火柴人格鬥的收尾式。
      f.chain = 0;
      f.power = 0.2;
      p.vx = (p.facing < 0 ? -1 : 1) * 240;
      f.beams.push({
        x: p.facing < 0 ? p.x - 20 : p.x + p.w + 2,
        y: p.y + 2,
        w: 14, h: 14,
        vx: (p.facing < 0 ? -1 : 1) * 260,
      });
      f.events.push('flip');   // 氣功出手的音效:借反轉那個「咻」
    }
    const reach = finisher ? 36 : 26;
    const blade = {
      x: p.facing < 0 ? p.x - reach : p.x + p.w,
      y: p.y - 6,
      w: reach, h: 26,
    };
    if (overlap(blade, dragonBox(f.dragon))) {
      damageDragon(
        f,
        p.facing < 0 ? p.x - 14 : p.x + p.w + 14,
        p.y + 4,
        finisher ? 2 : 1,
      );
      if (f.won) return;
    }
  }

  // 劍氣飛行與命中
  const beamsAlive = [];
  for (const b of f.beams) {
    b.x += b.vx * dt;
    if (b.x <= TILE || b.x + b.w >= 29 * TILE) continue;
    if (overlap(b, dragonBox(f.dragon))) {
      damageDragon(f, b.vx > 0 ? b.x + b.w : b.x, b.y + b.h / 2);
      if (f.won) return;
      continue;   // 劍氣打中就消散
    }
    beamsAlive.push(b);
  }
  f.beams = beamsAlive;

  updateDragon(f, dt);
  if (f.phase !== 'play') return;   // 尾擊或衝撞已經把人打倒

  // 火球飛行與命中
  const alive = [];
  for (const h of f.hazards) {
    h.x += h.vx * dt;
    if (h.x > TILE && h.x + h.w < 29 * TILE) alive.push(h);
  }
  f.hazards = alive;
  for (const h of f.hazards) {
    if (overlap(h, f.player)) { hurt(f, h.x + h.w / 2); return; }
  }
}
