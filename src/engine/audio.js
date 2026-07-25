export function createAudio() {
  let ac = null;

  function ensure() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, endFreq, dur, type, gain) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function noise(dur, gain) {
    const c = ensure();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(c.destination);
    src.start();
  }

  function play(name) {
    try {
      if (name === 'jump') tone(320, 620, 0.10, 'square', 0.06);
      else if (name === 'spike') { noise(0.06, 0.10); tone(900, 1600, 0.07, 'square', 0.05); }
      else if (name === 'thud') { noise(0.12, 0.14); tone(160, 50, 0.14, 'square', 0.08); }
      else if (name === 'death') { noise(0.25, 0.12); tone(300, 60, 0.30, 'sawtooth', 0.07); }
      // 反轉沒有實體，所以這一聲就是它唯一的存在證明：一個由高滑到低的倒轉音
      else if (name === 'flip') { tone(1200, 300, 0.18, 'sawtooth', 0.07); tone(300, 1200, 0.18, 'square', 0.04); }
      // 門閂落下的悶響。沒有這一聲，玩家只會以為遊戲當了
      else if (name === 'lock') { tone(220, 90, 0.16, 'square', 0.09); noise(0.05, 0.08); }
      // 當機聲：一段爆裂的雜訊加一個低到不像音效的悶音
      else if (name === 'glitch') { noise(0.18, 0.10); tone(90, 70, 0.22, 'square', 0.06); }
      else if (name === 'win') {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'square', 0.07), i * 90));
      }
    } catch { /* 音效失敗不該讓遊戲停下來 */ }
  }

  return { play };
}
