import { PHYSICS_DT, VIEW_W, VIEW_H } from './game/constants.js';
import { LEVELS } from './game/levels/index.js';
import { createSession, updateSession, restartLevel } from './game/session.js';
import { createInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { initSprites } from './engine/sprites.js';
import { createRenderer } from './engine/render.js';
import { createAudio } from './engine/audio.js';

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

initSprites();
const renderer = createRenderer(canvas);
const input = createInput(window);
const audio = createAudio();

const session = createSession(LEVELS);
let shake = 0;

function step(dt) {
  if (input.consumeRestart()) restartLevel(session);
  updateSession(session, input.state, dt);
  for (const e of session.world.events) {
    audio.play(e);
    if (e === 'death') shake = 5;
  }
  shake = Math.max(0, shake - dt * 20);
}

function render() {
  renderer.draw(session, shake);
}

startLoop(step, render, PHYSICS_DT);
