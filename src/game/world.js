import { createPlayer, updatePlayer } from './player.js';
import { createTrapState, checkTriggers, applyAction } from './traps.js';
import { createProfile, noteLanding, noteAttempt } from './profile.js';
import { TILE, VIEW_H, RESPAWN_DELAY, TAUNT_TIME, AIRBORNE_MIN } from './constants.js';

// 關卡可以提供 adapt(tiles, profile)，依側寫重建這一條命的地形。
// 只在這裡（建立世界）與 resetLevel（重生）呼叫——這就是
// 「絕不在玩家人在空中時改動任何東西」這條鐵則的實作保證。
function buildMap(level, profile) {
  if (!level.adapt) return { tiles: level.tiles.slice(), taunt: null };
  const r = level.adapt(level.tiles, profile);
  return { tiles: r.tiles.slice(), taunt: r.taunt ?? null };
}

function applyBuild(world) {
  const built = buildMap(world.level, world.profile);
  world.map = built.tiles;
  world.taunt = built.taunt;
  world.tauntTimer = built.taunt ? TAUNT_TIME : 0;
  world.door = { x: world.level.door[0], y: world.level.door[1] };
  world.player = createPlayer(world.level.spawn[0], world.level.spawn[1]);
  world.trapState = createTrapState(world.level);
  world.time = 0;
  world.jumps = 0;
  world.airTime = 0;
  world.landRecorded = false;
  world.phase = 'play';
  world.phaseTimer = 0;
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
  world.tauntTimer = Math.max(0, world.tauntTimer - dt);

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

  if (wasGrounded && p.vy < 0) {
    world.jumps += 1;
    world.events.push('jump');
  }

  const actions = checkTriggers(world.level, world.trapState, {
    px: p.x + p.w / 2,
    py: p.y + p.h / 2,
    prevX,
    prevY,
    time: world.time,
    deaths: world.deaths,
    jumps: world.jumps,
    atDoor: touchingDoor(world),
  });
  for (const a of actions) applyAction(world, a);

  if (p.y > VIEW_H + TILE) { kill(world); return; }

  if (touchingDoor(world) && world.phase === 'play') {
    world.phase = 'won';
    world.phaseTimer = 0;      // 通關動畫從 0 開始累加
    world.events.push('win');
  }
}
