// 側寫器：全程在背景記錄玩家的操作習慣，關卡透過 adapt() 讀它。
// 這裡只放「硬邦邦、可計算、不含糊」的量，不做任何猜測或隨機。
// YAGNI：只實作目前關卡真正用到的指標，其餘等需要的那一關再加。

const HISTORY_MAX = 20;

export function createProfile() {
  return {
    attempts: 0,
    lastLandTile: null,
    landings: [],
  };
}

// 玩家落地（或墜落穿過地板線）時所在的格
export function noteLanding(profile, tileX) {
  const t = Math.floor(tileX);
  profile.lastLandTile = t;
  profile.landings.push(t);
  if (profile.landings.length > HISTORY_MAX) profile.landings.shift();
}

export function noteAttempt(profile) {
  profile.attempts += 1;
}

// 轉場時當面唸給玩家聽的那一行。必須是可重現的事實陳述，不能是猜測。
export function describeProfile(profile) {
  const n = profile.landings.length;
  if (n === 0) return '樣本不足';

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
