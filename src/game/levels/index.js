import level01 from './level01.js';
import level02 from './level02.js';
import level03 from './level03.js';
import level04 from './level04.js';
import level05 from './level05.js';
import level06 from './level06.js';
import level07 from './level07.js';
import level08 from './level08.js';
import level09 from './level09.js';
import level10 from './level10.js';
import level11 from './level11.js';
import level12 from './level12.js';
import level13 from './level13.js';
import level14 from './level14.js';
import level15 from './level15.js';
import level16 from './level16.js';
import level17 from './level17.js';

export const LEVELS = [
  level01, level02, level03, level04, level05, level06,
  level07, level08, level09, level10, level11, level12,
  level13, level14, level15, level16, level17,
];

// 整場遊戲都畫成 Minecraft 風的 3D 方塊世界：陽光、草地、飄雲——
// 跟關卡對你做的事形成最大的反差，這個反差本身就是整人的一部分。
// 遊戲邏輯（物理、碰撞、陷阱）完全是 2D 的，只有畫法不一樣，
// 所以「看得見不代表擋得住」這套規則在 3D 裡一樣成立。
// 想讓個別關卡回到 2D 掃描線畫風，在關卡檔設 render3d: false。
for (const lv of LEVELS) {
  if (lv.render3d === undefined) lv.render3d = true;
}
