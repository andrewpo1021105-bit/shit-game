const MAX_STEPS = 8;

export function stepAccumulator(acc, frameTime, dt) {
  let rest = acc + frameTime;
  let steps = 0;
  while (rest >= dt && steps < MAX_STEPS) {
    rest -= dt;
    steps++;
  }
  if (steps === MAX_STEPS) rest = 0;
  return { steps, rest };
}

export function startLoop(onStep, onRender, dt) {
  let acc = 0;
  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    const frameTime = Math.min((now - last) / 1000, 0.25);
    last = now;
    const r = stepAccumulator(acc, frameTime, dt);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) onStep(dt);
    onRender(acc / dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return () => { running = false; };
}
