// 一幀最多追 3 步(25ms)。之前是 8 步:手機偶爾卡一下之後,
// 累積器會一口氣跑 66ms 的物理——玩家看到的就是角色瞬移。
// 3 步以內的追趕肉眼看不出來;追不完的時間直接丟掉,
// 代價是卡頓的那一瞬間遊戲稍微變慢,但慢比瞬移誠實。
const MAX_STEPS = 3;

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
    // 單幀最多認列 0.1 秒。切出去再回來、當機恢復之類的大空窗,
    // 不該變成遊戲裡的一次大跳躍。
    const frameTime = Math.min((now - last) / 1000, 0.1);
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
