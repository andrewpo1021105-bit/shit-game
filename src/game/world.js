import { createPlayer, updatePlayer } from './player.js';
import { createTrapState, checkTriggers, applyAction } from './traps.js';
import { TILE, VIEW_H, RESPAWN_DELAY } from './constants.js';

export function createWorld(level) {
  return {
    level,
    map: level.tiles.slice(),
    door: { x: level.door[0], y: level.door[1] },
    player: createPlayer(level.spawn[0], level.spawn[1]),
    trapState: createTrapState(level),
    time: 0,
    deaths: 0,
    jumps: 0,
    phase: 'play',
    phaseTimer: 0,
    events: [],
  };
}

export function resetLevel(world) {
  world.map = world.level.tiles.slice();
  world.door = { x: world.level.door[0], y: world.level.door[1] };
  world.player = createPlayer(world.level.spawn[0], world.level.spawn[1]);
  world.trapState = createTrapState(world.level);
  world.time = 0;
  world.jumps = 0;
  world.phase = 'play';
  world.phaseTimer = 0;
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
  const wasGrounded = p.grounded;

  world.time += dt;
  updatePlayer(p, world.map, input, dt);

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
