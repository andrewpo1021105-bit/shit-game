import { createPlayer, updatePlayer } from './player.js';
import { createTrapState, checkTriggers, applyAction } from './traps.js';
import { createProfile, noteLanding, noteAttempt, noteApex, noteSpeed, noteRestartDelay } from './profile.js';
import { touchesDeadly, isSolid, collides } from './physics.js';
import { TILE, VIEW_W, VIEW_H, RESPAWN_DELAY, AIRBORNE_MIN } from './constants.js';

const IDLE_SPEED = 6;   // 低於這個速度就算「站著不動」

// 關卡可以提供 adapt(tiles, profile)，依側寫重建這一條命的地形。
// 只在這裡（建立世界）與 resetLevel（重生）呼叫——這就是
// 「絕不在玩家人在空中時改動任何東西」這條鐵則的實作保證。
function buildMap(level, profile) {
  if (!level.adapt) return { tiles: level.tiles.slice(), traps: level.traps };
  const r = level.adapt(level.tiles, profile);
  // adapt 也可以換掉這條命的陷阱設定（例如把「站多久算猶豫」調緊），
  // 回傳新的陣列而不是改寫關卡本身，關卡資料才能一直保持乾淨
  return { tiles: r.tiles.slice(), traps: r.traps ?? level.traps };
}

function applyBuild(world) {
  const built = buildMap(world.level, world.profile);
  world.map = built.tiles;
  world.traps = built.traps ?? [];
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
      const row = Math.floor((h.y + h.h - 1) / TILE);
      if (isSolid(world.map, tx, row + 1)) {
        // 落地後就地變成實心方塊，從此擋在那裡
        setTile(world, tx, row, '#');
        world.events.push('thud');
        continue;
      }
    } else if (h.kind === 'spike') {
      // 撞到牆就消失
      const edge = h.vx < 0 ? h.x : h.x + h.w - 1;
      if (isSolid(world.map, Math.floor(edge / TILE), Math.floor((h.y + h.h / 2) / TILE))) continue;
    }

    if (h.y > VIEW_H + TILE || h.x < -TILE || h.x > VIEW_W + TILE) continue;
    alive.push(h);
  }
  world.hazards = alive;
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

function touchingDoor(world) {
  const p = world.player;
  const dx = world.door.x * TILE, dy = world.door.y * TILE;
  return p.x + p.w > dx && p.x < dx + TILE * 2 && p.y + p.h > dy && p.y < dy + TILE * 2;
}

function kill(world) {
  if (world.phase !== 'play') return;
  // 死前把這條命跑到的最高速度存起來，關卡才知道你是衝的還是走的
  if (world.topSpeed > 0) noteSpeed(world.profile, world.topSpeed);
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

  const p = world.player;
  const prevX = p.x + p.w / 2;
  const prevY = p.y + p.h / 2;
  const prevFeet = p.y + p.h;
  const wasGrounded = p.grounded;

  world.time += dt;
  updatePlayer(p, world.map, input, dt);

  world.airTime = p.grounded ? 0 : world.airTime + dt;
  recordLanding(world, prevFeet);

  // 站著不動多久了（第 6 關要用）
  world.idle = (p.grounded && Math.abs(p.vx) < IDLE_SPEED) ? world.idle + dt : 0;

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
  }

  updateHazards(world, dt);

  if (hazardHitsPlayer(world)) { kill(world); return; }
  // 被地形夾住就死。砸下來的方塊落地時會就地變成實心，
  // 如果玩家正站在那一格，等於被壓在方塊裡——這條規則同時涵蓋
  // 所有「憑空長出實心地形」的陷阱。
  if (collides(world.map, p)) { kill(world); return; }
  if (touchesDeadly(world.map, p)) { kill(world); return; }
  if (p.y > VIEW_H + TILE) { kill(world); return; }

  if (touchingDoor(world) && world.phase === 'play') {
    // 成功走完也是一筆樣本，不能只從死亡中學習
    if (world.topSpeed > 0) noteSpeed(world.profile, world.topSpeed);
    world.phase = 'won';
    world.phaseTimer = 0;      // 通關動畫從 0 開始累加
    world.events.push('win');
  }
}
