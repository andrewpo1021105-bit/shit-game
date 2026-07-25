const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
};

export function createInput(target = window) {
  const state = { left: false, right: false, jump: false };
  const api = { state, restart: false, copy: false, consumeRestart, consumeCopy, destroy };

  function onKey(down) {
    return (e) => {
      if (e.code === 'KeyR') { if (down) api.restart = true; return; }
      if (e.code === 'KeyC') { if (down) api.copy = true; return; }
      const action = KEYS[e.code];
      if (!action) return;
      e.preventDefault();
      state[action] = down;
    };
  }
  const kd = onKey(true), ku = onKey(false);
  const blur = () => { state.left = state.right = state.jump = false; };

  target.addEventListener('keydown', kd);
  target.addEventListener('keyup', ku);
  target.addEventListener('blur', blur);

  function consumeRestart() {
    const r = api.restart;
    api.restart = false;
    return r;
  }
  function consumeCopy() {
    const c = api.copy;
    api.copy = false;
    return c;
  }
  function destroy() {
    target.removeEventListener('keydown', kd);
    target.removeEventListener('keyup', ku);
    target.removeEventListener('blur', blur);
  }
  return api;
}
