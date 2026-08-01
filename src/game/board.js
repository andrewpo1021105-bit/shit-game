// 排行榜的受理規則。純函式,不碰瀏覽器——因為它是唯一決定
// 「誰算數」的地方,而這種東西必須測得到。
import { MIN_BOARD_TIME } from './constants.js';

// 一筆成績長得像不像成績,而且快得合不合理。
// 時間不是數字的一律不收:榜是所有人共用的,手改過的 JSON 也會流進來。
export function accepts(entry) {
  return typeof entry?.time === 'number'
    && Number.isFinite(entry.time)
    && entry.time >= MIN_BOARD_TIME;
}

// 把一張榜洗乾淨。不是陣列就當作空榜——
// 寧可顯示空的,也不要讓壞掉的資料把結算畫面整個炸掉。
export function sift(list) {
  return Array.isArray(list) ? list.filter(accepts) : [];
}

// 榜的排序規則:時間快的贏,同秒數死得少的贏。
// 排序跟受理規則放在一起,是因為「上榜」這件事就是這兩條規則加起來。
export function rank(list) {
  return [...list].sort((a, b) => a.time - b.time || a.deaths - b.deaths);
}
