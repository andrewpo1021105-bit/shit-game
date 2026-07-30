import { createPlayer, updatePlayer } from './player.js';
import { createTrapState, checkTriggers, applyAction, makeEnemy } from './traps.js';
import {
  createProfile, noteLanding, noteAttempt, noteApex, noteSpeed,
  noteRestartDelay, noteJumpLead, noteHesitation,
} from './profile.js';
import { touchesDeadly, isSolid, isDeadly, collides } from './physics.js';
import { TILE, VIEW_W, VIEW_H, RESPAWN_DELAY, AIRBORNE_MIN, DEFAULT_TUNE } from './constants.js';

const IDLE_SPEED = 6;      // 低於這個速度就算「站著不動」
const HESITATE_IDLE = 0.5; // 動過之後又停這麼久，算猶豫
const LEAD_SCAN = 8;       // 起跳提前量往前掃幾格就放棄

// 關卡可以提供 adapt(tiles, profile, ctx)，依側寫重建這一條命的地形。
// 只在這裡（建立世界）與 resetLevel（重生）呼叫——這就是
// 「絕不在玩家人在空中時改動任何東西」這條鐵則的實作保證。
// ctx.deaths 是「這一關」死了幾次；profile.attempts 是跨關累加的，
// 拿來當難度依據會被前面的關卡污染，所以另外傳。
function buildMap(level, profile, ctx) {
  const base = { traps: level.traps, decoys: level.decoys, enemies: level.enemies, tune: null };
  if (!level.adapt) return { ...base, tiles: level.tiles.slice() };
  const r = level.adapt(level.tiles, profile, ctx);
  // adapt 也可以換掉這條命的陷阱、假門與手感，回傳新的物件而不是改寫關卡本身，
  // 關卡資料才能一直保持乾淨
  return {
    tiles: r.tiles.slice(),
    traps: r.traps ?? level.traps,
    decoys: r.decoys ?? level.decoys,
    enemies: r.enemies ?? level.enemies,
    tune: r.tune ?? null,
  };
}

function applyBuild(world) {
  const built = buildMap(world.level, world.profile, { deaths: world.deaths ?? 0 });
  world.map = built.tiles;
  world.traps = built.traps ?? [];
  // 假門：長得跟真門一模一樣，碰到就死
  world.decoys = (built.decoys ?? []).map(([x, y]) => ({ x, y }));
  // 敵人也是每條命重建，跟陷阱一樣不會記得上一條命發生過什麼
  world.enemies = (built.enemies ?? []).map(makeEnemy);
  world.door = { x: world.level.door[0], y: world.level.door[1] };
  world.player = createPlayer(world.level.spawn[0], world.level.spawn[1]);
  world.trapState = createTrapState(world.traps);
  world.time = 0;
  world.jumps = 0;
  world.airTime = 0;
  world.landRecorded = false;
  world.idle = 0;
  world.topSpeed = 0;
  world.takeoffY = null;   // 起跳當下的高度，用來算這一跳升了多少
  world.apexY = null;      // 這一跳到過的最高點
  world.firstInputAt = null;
  world.hazards = [];
  // 手感是每條命一份的可變副本。重生一定復原，所以命內的物理突變
  // 跟命內的陷阱一樣，不會洩漏到下一條命。
  world.tune = { ...DEFAULT_TUNE, ...(built.tune ?? {}) };
  // 左右反轉也是命內狀態，重生歸零
  world.flipped = false;
  // 門被鎖住還剩幾秒。碰到門而它不開，是門前梗裡唯一不需要你動的那種。
  world.doorLock = 0;
  world.moved = false;      // 這條命有沒有真的開始移動過
  world.hesitated = false;  // 開始移動之後有沒有倒退或停下來想
  world.settled = false;    // 這條命的側寫結算過了沒
  // 假死／假通關的演出狀態。跟其他命內狀態一樣，重生歸零。
  world.fakeKind = null;
  world.fakeTimer = 0;
  world.fakeDuration = 0;
  // 假當機也是命內狀態，重生歸零
  world.glitch = null;
  world.phase = 'play';
  world.phaseTimer = 0;
}

function setTile(world, tx, ty, ch) {
  if (ty < 0 || ty >= world.map.length) return;
  const row = world.map[ty].split('');
  if (tx < 0 || tx >= row.length) return;
  row[tx] = ch;
  world.map[ty] = row.join('');
}

// 會動的危險物：砸下來的方塊、橫掃的刺
function updateHazards(world, dt) {
  const alive = [];
  for (const h of world.hazards) {
    h.vy += h.gravity * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;

    if (h.kind === 'block') {
      const tx = Math.round(h.x / TILE);
      const bottom = Math.floor((h.y + h.h - 1) / TILE);
      if (isSolid(world.map, tx, bottom + 1)) {
        // 落地後就地變成實心地形，從此擋在那裡
        for (let i = 0; i < Math.round(h.h / TILE); i++) setTile(world, tx, bottom - i, '#');
        world.events.push('thud');
        // 一面高到跳不上去的牆，如果落在玩家前方，玩家就永遠過不去了。
        // 與其讓他卡在那裡自己按重來，不如直接算死——0.3 秒就回到起點。
        if (h.seals && world.player.x + world.player.w <= h.x) kill(world);
        continue;
      }
    } else if (h.kind === 'spike' || h.kind === 'spit') {
      // 撞到牆就消失
      const edge = h.vx < 0 ? h.x : h.x + h.w - 1;
      if (isSolid(world.map, Math.floor(edge / TILE), Math.floor((h.y + h.h / 2) / TILE))) continue;
    }

    if (h.y > VIEW_H + TILE || h.x < -TILE || h.x > VIEW_W + TILE) continue;
    alive.push(h);
  }
  world.hazards = alive;
}

// 敵人的一幀。三種個性,全部確定性——同樣的輸入永遠得到同樣的追殺。
function updateEnemies(world, dt) {
  const p = world.player;
  const px = p.x + p.w / 2;
  const pRow = Math.floor((p.y + p.h) / TILE);

  for (const e of world.enemies) {
    const eRow = Math.floor((e.y + e.h) / TILE);
    const ex = e.x + e.w / 2;
    const sameRow = p.grounded && pRow === eRow;

    if (e.kind === 'walker') {
      // 來回巡邏。它不追你、不加速、不假裝——全遊戲最誠實的東西。
      e.x += e.dir * e.speed * dt;
      if (e.x <= e.min) { e.x = e.min; e.dir = 1; }
      if (e.x + e.w >= e.max + TILE) { e.x = e.max + TILE - e.w; e.dir = -1; }
    } else if (e.kind === 'charger') {
      if (e.mode === 'patrol') {
        e.x += e.dir * e.speed * dt;
        if (e.x <= e.min) { e.x = e.min; e.dir = 1; }
        if (e.x + e.w >= e.max + TILE) { e.x = e.max + TILE - e.w; e.dir = -1; }
        // 看到你了。同一列、視野之內,就朝你衝過來。
        if (sameRow && Math.abs(px - ex) <= e.sight) {
          e.mode = 'dash';
          e.dashDir = px < ex ? -1 : 1;
        }
      } else if (e.mode === 'dash') {
        // 衝刺比玩家快,躲不掉的——但它只衝到巡邏邊界就會累倒。
        // 跳過它的頭頂,或者退出它的地盤,都是零操作精度的活路。
        e.x += e.dashDir * 165 * dt;
        if (e.x <= e.min || e.x + e.w >= e.max + TILE) {
          e.x = Math.max(e.min, Math.min(e.x, e.max + TILE - e.w));
          e.mode = 'tired';
          e.timer = 1.2;
        }
      } else {
        // 累倒。這 1.2 秒是它唯一無害的時候。
        e.timer -= dt;
        if (e.timer <= 0) e.mode = 'patrol';
      }
    } else if (e.kind === 'spitter') {
      // 砲塔不動,也不主動。它只射一種人:停在它射程裡想事情的人。
      // 一直走的人永遠不會中彈——這一關考的還是猶豫,不是手速。
      e.cool = Math.max(0, e.cool - dt);
      const inRange = sameRow && Math.abs(px - ex) <= e.range;
      if (inRange && world.idle >= 0.8 && e.cool <= 0) {
        world.hazards.push({
          kind: 'spit',
          x: px < ex ? e.x - 6 : e.x + e.w,
          y: e.y + 4,
          w: 6, h: 6,
          vx: (px < ex ? -1 : 1) * 95,
          vy: 0, gravity: 0,
        });
        e.cool = 1.6;
        world.events.push('spike');
      }
    }
  }
}

function enemyHitsPlayer(world) {
  const p = world.player;
  for (const e of world.enemies) {
    if (p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h > e.y && p.y < e.y + e.h) return true;
  }
  return false;
}

function hazardHitsPlayer(world) {
  const p = world.player;
  for (const h of world.hazards) {
    if (p.x + p.w > h.x && p.x < h.x + h.w && p.y + p.h > h.y && p.y < h.y + h.h) return true;
  }
  return false;
}

export function createWorld(level, profile = createProfile()) {
  const world = {
    level,
    profile,
    // 地板線：玩家墜落穿過這條線時，記下他「本來會落在哪一格」
    floorLineY: (level.spawn[1] + 1) * TILE,
    deaths: 0,
    events: [],
  };
  applyBuild(world);
  return world;
}

export function resetLevel(world) {
  noteAttempt(world.profile);
  applyBuild(world);
}

function overlapsDoorAt(player, dx, dy) {
  const x = dx * TILE, y = dy * TILE;
  return player.x + player.w > x && player.x < x + TILE * 2
      && player.y + player.h > y && player.y < y + TILE * 2;
}

function touchingDoor(world) {
  return overlapsDoorAt(world.player, world.door.x, world.door.y);
}

function touchingDecoy(world) {
  return world.decoys.some((d) => overlapsDoorAt(world.player, d.x, d.y));
}

// 起跳當下，人到前方最近一個站不住的格子（洞或刺）還有多遠。
// 前方一路平坦就回 null——平地上隨便跳一下不代表任何習慣。
function jumpLeadPx(map, x, w, dir, row) {
  const edgeCol = Math.floor((dir > 0 ? x + w - 1 : x) / TILE);
  for (let d = 1; d <= LEAD_SCAN; d++) {
    const tx = edgeCol + d * dir;
    if (isSolid(map, tx, row) && !isDeadly(map, tx, row)) continue;
    return dir > 0 ? tx * TILE - (x + w) : x - (tx + 1) * TILE;
  }
  return null;
}

// 一條命的結算。死亡與過關都要跑，而且只跑一次——
// 只從死亡中學習會漏掉「一次就過」的人。
function settleLife(world) {
  if (world.settled) return;
  world.settled = true;
  if (world.topSpeed > 0) noteSpeed(world.profile, world.topSpeed);
  noteHesitation(world.profile, world.hesitated);
}

function kill(world) {
  if (world.phase !== 'play') return;
  settleLife(world);
  world.phase = 'dying';
  world.phaseTimer = RESPAWN_DELAY;
  world.deaths += 1;
  world.events.push('death');
}

// 一條命只記一次落點：先發生的那次算數（穿過地板線，或落在高台上）
function recordLanding(world, prevFeet) {
  if (world.landRecorded) return;
  const p = world.player;
  const feet = p.y + p.h;
  // 站在地板上時腳底正好等於地板線，所以要用「原本不低於、現在低於」，
  // 否則走路的每一幀都不算穿過，掉進洞裡也偵測不到
  const crossedFloorLine = prevFeet <= world.floorLineY && feet > world.floorLineY;
  const landedOnPlatform = p.grounded && world.airTime > AIRBORNE_MIN;
  if (!crossedFloorLine && !landedOnPlatform) return;
  noteLanding(world.profile, (p.x + p.w / 2) / TILE);
  world.landRecorded = true;
}

export function updateWorld(world, input, dt) {
  world.events = [];

  // 假當機的凍結：畫面與物理一起停住。停的期間陷阱不跑、玩家不動，
  // 所以它嚇人但不吃手速。label 的 timer 是 0，不會走進這裡。
  if (world.glitch && world.glitch.timer > 0) {
    world.glitch.timer -= dt;
    if (world.glitch.timer <= 0) world.glitch = null;
    return;
  }

  if (world.phase === 'dying') {
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      const deaths = world.deaths;
      resetLevel(world);
      world.deaths = deaths;
    }
    return;
  }
  if (world.phase === 'won') { world.phaseTimer += dt; return; }

  // 演出期間輸入完全無效——它要看起來就是一次真的死亡／過關。
  if (world.phase === 'faking') {
    world.fakeTimer += dt;
    if (world.fakeTimer >= world.fakeDuration) {
      // 假通關演完，真門跟第 0 扇假門交換身分：
      // 你剛剛「走進去」的那扇，現在是會殺你的那扇。
      // 沒有假門就不換——單純演完恢復。
      if (world.fakeKind === 'win' && world.decoys.length > 0) {
        applyAction(world, { t: 'swapDoor', decoy: 0 });
      }
      world.fakeKind = null;
      world.phase = 'play';
    }
    return;
  }

  const p = world.player;
  const prevX = p.x + p.w / 2;
  const prevY = p.y + p.h / 2;
  const prevFeet = p.y + p.h;
  const wasGrounded = p.grounded;
  // 起跳提前量要用「起跳前」的位置算，updatePlayer 跑完人已經離地了
  const prevLeftX = p.x;
  const prevGroundRow = Math.floor(prevFeet / TILE);
  const prevDir = p.vx > IDLE_SPEED ? 1 : (p.vx < -IDLE_SPEED ? -1 : p.facing);

  world.time += dt;
  // 左右反轉。玩家按的還是同一顆鍵，只是這條命裡它代表反方向。
  const eff = world.flipped
    ? { left: input.right, right: input.left, jump: input.jump }
    : input;
  updatePlayer(p, world.map, eff, dt, world.tune);

  world.airTime = p.grounded ? 0 : world.airTime + dt;
  recordLanding(world, prevFeet);

  // 站著不動多久了（第 6 關要用）
  world.idle = (p.grounded && Math.abs(p.vx) < IDLE_SPEED) ? world.idle + dt : 0;

  // 猶豫（第 9 關展示）：先確定他真的動起來了，之後再倒退或停下來想才算數。
  // 否則出生後還沒按鍵的那段靜止會被誤判成猶豫。
  if (Math.abs(p.vx) > IDLE_SPEED) world.moved = true;
  if (world.moved && (p.vx < -IDLE_SPEED || world.idle >= HESITATE_IDLE)) {
    world.hesitated = true;
  }

  // 這條命跑到的最高速度（第 4 關要用）
  world.topSpeed = Math.max(world.topSpeed, Math.abs(p.vx));

  // 重生後隔多久才動（第 5、6 關要用）
  if (world.firstInputAt === null && (input.left || input.right || input.jump)) {
    world.firstInputAt = world.time;
    noteRestartDelay(world.profile, world.time);
  }

  if (wasGrounded && p.vy < 0) {
    world.jumps += 1;
    world.takeoffY = p.y;
    world.apexY = p.y;
    // 這一跳是在離障礙多遠的地方起跳的（第 8 關要用）
    noteJumpLead(
      world.profile,
      jumpLeadPx(world.map, prevLeftX, p.w, prevDir, prevGroundRow),
    );
    world.events.push('jump');
  }

  // 追蹤這一跳的最高點，落地時結算升了多少（第 3 關要用）
  if (world.takeoffY !== null) {
    world.apexY = Math.min(world.apexY, p.y);
    if (p.grounded) {
      noteApex(world.profile, world.takeoffY - world.apexY);
      world.takeoffY = null;
    }
  }

  const actions = checkTriggers(world.traps, world.trapState, {
    px: p.x + p.w / 2,
    py: p.y + p.h / 2,
    prevX,
    prevY,
    time: world.time,
    deaths: world.deaths,
    jumps: world.jumps,
    idle: world.idle,
    grounded: p.grounded,
    footX: Math.floor((p.x + p.w / 2) / TILE),
    footY: Math.floor((p.y + p.h) / TILE),
    atDoor: touchingDoor(world),
  });
  for (const a of actions) {
    applyAction(world, a);
    // 刺彈出來要有聲音與震動——玩家不會被告知原因，但一定要察覺「剛剛有東西冒出來」
    if (a.t === 'spawnSpikes') world.events.push('spike');
    if (a.t === 'dropBlock' || a.t === 'sweepSpike') world.events.push('spike');
    // 左右反轉沒有實體，看不見也聽不見就等於作弊——這一聲是它的公平性保證
    if (a.t === 'flipControls') world.events.push('flip');
    // 門鎖上也要聽得見，否則玩家只會以為遊戲當了
    if (a.t === 'lockDoor') world.events.push('lock');
    // 假的也要有聲音與震動，否則它就不像真的了
    if (a.t === 'fakeDeath') world.events.push('death');
    if (a.t === 'fakeWin') world.events.push('win');
    if (a.t === 'glitch') world.events.push('glitch');
  }

  if (world.doorLock > 0) world.doorLock = Math.max(0, world.doorLock - dt);

  updateHazards(world, dt);
  updateEnemies(world, dt);

  // 假門跟真門長得一樣。碰錯了就死——這是純粹的欺騙，跟操作無關。
  if (touchingDecoy(world)) { kill(world); return; }
  if (hazardHitsPlayer(world)) { kill(world); return; }
  if (enemyHitsPlayer(world)) { kill(world); return; }
  // 被地形夾住就死。砸下來的方塊落地時會就地變成實心，
  // 如果玩家正站在那一格，等於被壓在方塊裡——這條規則同時涵蓋
  // 所有「憑空長出實心地形」的陷阱。
  if (collides(world.map, p)) { kill(world); return; }
  if (touchesDeadly(world.map, p)) { kill(world); return; }
  if (p.y > VIEW_H + TILE) { kill(world); return; }

  // 門鎖著的時候碰到它不算過關。等就好——但它不會告訴你要等多久。
  if (touchingDoor(world) && world.doorLock <= 0 && world.phase === 'play') {
    // 成功走完也是一筆樣本，不能只從死亡中學習
    settleLife(world);
    world.phase = 'won';
    world.phaseTimer = 0;      // 通關動畫從 0 開始累加
    world.events.push('win');
  }
}
