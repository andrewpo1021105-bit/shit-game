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

  // ── 背景音樂 ─────────────────────────────────────────────
  // 不載任何音檔:整首曲子就是兩張音符表,用振盪器現場演奏。
  // 曲風照著遊戲王決鬥 BGM 的氣氛寫的原創致敬曲:A 小調、
  // Am→F→G→E 的戲劇性走向、急促的驅動低音、鋸齒波假裝銅管——
  // 每一關都是一場決鬥,對面那個 AI 已經蓋了五張陷阱卡。
  const STEP = 0.21;             // ~143 BPM 的八分音符,決鬥的心跳
  const LOOP = 32;               // 4 小節一循環
  const MELODY = [
    440, 0, 523, 0, 659, 587, 523, 0,
    494, 0, 440, 494, 523, 0, 440, 0,
    349, 0, 440, 0, 523, 494, 440, 0,
    415, 0, 494, 0, 659, 0, 831, 0,
  ];
  // 低音幾乎不休息——決鬥中沒有人站著不動
  const BASS = [
    110, 110, 110, 110, 110, 110, 98, 110,
    87, 87, 87, 87, 87, 87, 82, 87,
    98, 98, 98, 98, 98, 98, 110, 98,
    82, 0, 82, 82, 123, 0, 82, 82,
  ];

  let musicOn = false;
  let musicTimer = null;
  let nextStep = 0;
  let stepIdx = 0;

  // 跟 tone 不同:音符要排在未來的節拍點上,不是「現在」
  function noteAt(freq, at, dur, type, gain) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // 排程幫浦:每次醒來把接下來 0.35 秒內的節拍排上去。
  // 用 AudioContext 的時鐘,不用 setInterval 的——後者晃得像壞掉的節拍器。
  function pump() {
    const c = ensure();
    while (nextStep < c.currentTime + 0.35) {
      const m = MELODY[stepIdx % LOOP];
      // 鋸齒波當主旋律,才有那種銅管吹出來的決鬥味
      if (m) noteAt(m, nextStep, STEP * 0.9, 'sawtooth', 0.02);
      const b = BASS[stepIdx % LOOP];
      if (b) noteAt(b, nextStep, STEP * 0.95, 'square', 0.038);
      nextStep += STEP;
      stepIdx += 1;
    }
  }

  function startMusic() {
    try {
      if (musicOn) return;
      const c = ensure();
      musicOn = true;
      nextStep = c.currentTime + 0.05;
      stepIdx = 0;
      pump();
      musicTimer = setInterval(() => { try { pump(); } catch { /* 不吵 */ } }, 150);
    } catch { /* 沒有音效環境就安靜地玩 */ }
  }

  function toggleMusic() {
    if (musicOn) {
      clearInterval(musicTimer);
      musicTimer = null;
      musicOn = false;
    } else {
      startMusic();
    }
    return musicOn;
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

  return { play, startMusic, toggleMusic };
}
