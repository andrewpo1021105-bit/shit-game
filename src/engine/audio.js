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
  const LOOP = 32;               // 4 小節一循環
  const TRACKS = {
    // 決鬥曲:~143 BPM,低音幾乎不休息——決鬥中沒有人站著不動
    duel: {
      step: 0.21,
      lead: 'sawtooth', leadGain: 0.02, leadDur: 0.9,
      bassType: 'square', bassGain: 0.038, bassDur: 0.95,
      melody: [
        440, 0, 523, 0, 659, 587, 523, 0,
        494, 0, 440, 494, 523, 0, 440, 0,
        349, 0, 440, 0, 523, 494, 440, 0,
        415, 0, 494, 0, 659, 0, 831, 0,
      ],
      bass: [
        110, 110, 110, 110, 110, 110, 98, 110,
        87, 87, 87, 87, 87, 87, 82, 87,
        98, 98, 98, 98, 98, 98, 110, 98,
        82, 0, 82, 82, 123, 0, 82, 82,
      ],
    },
    // BOSS 曲:照著鬼滅之刃「炎」的氣氛寫的原創致敬——
    // E 小調、慢而重的長音低音、悲壯往上爬的旋律。
    // 火燒雲下面,牠在等你。
    boss: {
      step: 0.3,
      lead: 'sawtooth', leadGain: 0.024, leadDur: 1.6,
      bassType: 'triangle', bassGain: 0.062, bassDur: 3.4,
      melody: [
        330, 0, 392, 440, 494, 0, 440, 392,
        440, 0, 392, 330, 294, 0, 0, 330,
        330, 0, 392, 440, 494, 0, 587, 523,
        494, 523, 494, 440, 392, 0, 494, 0,
      ],
      bass: [
        82, 0, 0, 0, 82, 0, 0, 0,
        65, 0, 0, 0, 65, 0, 0, 0,
        98, 0, 0, 0, 98, 0, 0, 0,
        73, 0, 0, 0, 73, 0, 73, 0,
      ],
    },
  };
  let track = TRACKS.duel;

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
      const m = track.melody[stepIdx % LOOP];
      // 鋸齒波當主旋律,才有那種銅管吹出來的味道
      if (m) noteAt(m, nextStep, track.step * track.leadDur, track.lead, track.leadGain);
      const b = track.bass[stepIdx % LOOP];
      if (b) noteAt(b, nextStep, track.step * track.bassDur, track.bassType, track.bassGain);
      nextStep += track.step;
      stepIdx += 1;
    }
  }

  // 換曲。BOSS 關進場換 BOSS 曲,回到一般關換回來;同一首就什麼都不做。
  function setTrack(name) {
    const t = TRACKS[name] ?? TRACKS.duel;
    if (t === track) return;
    track = t;
    stepIdx = 0;
    if (musicOn) {
      try { nextStep = ensure().currentTime + 0.12; } catch { /* 沒音效環境 */ }
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
      // 揮劍:短促的破空聲
      else if (name === 'swing') { noise(0.05, 0.05); tone(600, 220, 0.08, 'sawtooth', 0.04); }
      // 砍中:悶而重,像刀背敲在鱗片上
      else if (name === 'hit') { noise(0.07, 0.10); tone(200, 90, 0.12, 'square', 0.09); }
      // 龍吼:低頻的轟鳴
      else if (name === 'roar') { noise(0.28, 0.09); tone(70, 45, 0.35, 'sawtooth', 0.08); }
      // 挨打:短促的悶哼加下墜音——格鬥遊戲的受擊聲
      else if (name === 'hurt') { noise(0.08, 0.11); tone(320, 90, 0.16, 'square', 0.08); }
      else if (name === 'win') {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'square', 0.07), i * 90));
      }
    } catch { /* 音效失敗不該讓遊戲停下來 */ }
  }

  return { play, startMusic, toggleMusic, setTrack };
}
