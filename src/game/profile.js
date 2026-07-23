// 側寫器：全程在背景記錄玩家的操作習慣，關卡透過 adapt() 讀它。
// 這裡只放「硬邦邦、可計算、不含糊」的量，不做任何猜測或隨機。

const HISTORY_MAX = 20;

function push(list, value) {
  list.push(value);
  if (list.length > HISTORY_MAX) list.shift();
}

export function median(list) {
  if (list.length === 0) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function createProfile() {
  return {
    attempts: 0,
    // 落點（第 2 關）
    lastLandTile: null,
    landings: [],
    // 跳躍最高點，單位像素（第 3 關）
    lastApex: null,
    apexes: [],
    // 平常走路的速度，單位 px/s（第 4 關）
    lastSpeed: null,
    speeds: [],
    // 重生後隔多久才動，單位秒（第 5、6 關）
    lastRestartDelay: null,
    restartDelays: [],
    // 上下兩條路走哪條（第 7 關）
    lastRoute: null,
    routes: [],
  };
}

export function noteLanding(profile, tileX) {
  const t = Math.floor(tileX);
  profile.lastLandTile = t;
  push(profile.landings, t);
}

// 一次跳躍從起跳到最高點升了多少像素
export function noteApex(profile, rise) {
  const r = Math.max(0, Math.round(rise));
  profile.lastApex = r;
  push(profile.apexes, r);
}

// 一條命之內的最高水平速度
export function noteSpeed(profile, speed) {
  const s = Math.round(Math.abs(speed));
  profile.lastSpeed = s;
  push(profile.speeds, s);
}

// 重生後隔多久才按下第一個操作鍵
export function noteRestartDelay(profile, seconds) {
  const d = Math.round(seconds * 100) / 100;
  profile.lastRestartDelay = d;
  push(profile.restartDelays, d);
}

// 'high' 或 'low'
export function noteRoute(profile, route) {
  profile.lastRoute = route;
  push(profile.routes, route);
}

export function noteAttempt(profile) {
  profile.attempts += 1;
}

// 轉場時當面唸給玩家聽的那一行。必須是可重現的事實陳述，不能是猜測。
// 樣本不足時回傳 null——寧可什麼都不說，也不要講一句沒有根據的話。
export function describeProfile(profile) {
  const n = profile.landings.length;
  if (n < 2) return null;

  const counts = new Map();
  for (const t of profile.landings) counts.set(t, (counts.get(t) ?? 0) + 1);

  let best = null, bestN = 0;
  for (const [tile, count] of counts) {
    // 平手時取小的格，結果才是可重現的
    if (count > bestN || (count === bestN && tile < best)) { best = tile; bestN = count; }
  }

  if (bestN < 2) return `落點飄忽：${n} 次沒有兩次一樣`;
  return `你 ${n} 次裡有 ${bestN} 次落在第 ${best} 格`;
}
