import { createProfile, describeProfile, buildReport } from './profile.js';
import { createWorld, updateWorld, resetLevel } from './world.js';
import { createFight, updateFight } from './fight.js';

// 轉場時間軸（秒）
export const CLEAR_HOLD = 1.4;        // CLEAR! 畫面停留多久才開始轉場
export const SWEEP_IN = 0.5;          // 黑幕由上往下蓋滿
export const REVEAL_AT = 2.4;         // 開始掀開，此刻換成下一關——留給劇情讀完的時間
export const TRANSITION_TIME = 2.9;   // 轉場總長

export function createSession(levels) {
  const profile = createProfile();
  return {
    levels,
    index: 0,
    profile,
    world: createWorld(levels[0], profile),
    phase: 'play',          // 'play' | 'transition' | 'finished'
    timer: 0,
    analysis: '',           // 轉場時唸出來的那行側寫結果
    revealed: false,
    totalDeaths: 0,
    report: [],             // 全部跑完之後那份「它對你的評語」
    // 通關計時。只在你操作得到的時間累計——轉場動畫不算你的,
    // 但死亡重生、假死、假當機全都算:被騙掉的時間就是你的時間。
    totalTime: 0,
  };
}

function beginTransition(session) {
  session.phase = 'transition';
  session.timer = 0;
  session.revealed = false;
  // 下一關可以自己宣告一句話取代側寫結果。第 10 關用它說
  // 「已停止分析」——而且那句話是真的。
  const next = session.levels[session.index + 1];
  session.analysis = next?.announce ?? describeProfile(session.profile);
}

function reveal(session) {
  session.totalDeaths += session.world.deaths;
  session.index += 1;
  session.world = createWorld(session.levels[session.index], session.profile);
  session.revealed = true;
}

// 創造者模式的跳關。直接換到指定方向的關卡,不結算、不轉場、不計死亡——
// 這是給造關的人用的傳送門,不是給玩家用的捷徑。
export function jumpLevel(session, dir) {
  if (session.phase === 'finished') return;
  const i = Math.max(0, Math.min(session.levels.length - 1, session.index + dir));
  session.index = i;
  session.world = createWorld(session.levels[i], session.profile);
  session.phase = 'play';
  session.timer = 0;
}

export function restartLevel(session) {
  if (session.phase !== 'play') return;
  const deaths = session.world.deaths;
  resetLevel(session.world);
  session.world.deaths = deaths;
}

export function updateSession(session, input, dt) {
  if (session.phase === 'finished') {
    session.timer += dt;
    // 不清掉的話 world.events 會停在最後一幀的 'win'，主迴圈會每幀重播勝利音效
    session.world.events = [];
    if (session.fight) session.fight.events = [];
    return;
  }

  if (session.phase === 'transition') {
    session.timer += dt;
    session.world.events = [];
    // 黑幕蓋滿之後才換關，玩家不會看到關卡憑空跳掉。
    // 撿了劍的人,黑幕掀開之後是 BOSS 房,不是下一關。
    if (!session.revealed && session.timer >= REVEAL_AT) {
      if (session.pendingFight) {
        session.fight = createFight();
        session.revealed = true;
      } else {
        reveal(session);
      }
    }
    if (session.timer >= TRANSITION_TIME) {
      session.phase = session.pendingFight ? 'fight' : 'play';
      session.timer = 0;
    }
    return;
  }

  // 打鬥模式。整個遊戲在這裡換了文法:沒有陷阱,只有牠。
  if (session.phase === 'fight') {
    session.totalTime += dt;
    updateFight(session.fight, input, dt);
    if (session.fight.done) {
      session.totalDeaths += session.fight.deaths;
      session.phase = 'finished';
      session.timer = 0;
      // 屠龍者掛星;倒下的人,結算畫面會記得牠還活著
      session.bossCleared = session.fight.won === true;
      session.bossFailed = session.fight.won !== true;
      session.report = buildReport(session.profile);
    }
    return;
  }

  session.totalTime += dt;
  updateWorld(session.world, input, dt);

  if (session.world.phase === 'won' && session.world.phaseTimer >= CLEAR_HOLD) {
    const next = session.levels[session.index + 1];
    const deathsSoFar = session.totalDeaths + session.world.deaths;

    // BOSS 只見死得夠少的人。門檻沒過就在這裡結算——
    // 結算畫面會告訴你牠本來願意見你的條件。
    const bossLocked = next?.boss && deathsSoFar > next.maxDeaths;

    if (session.world.level.boss) {
      // 走完 BOSS 關的人撿起一把劍。黑幕掀開,遊戲變成打鬥遊戲。
      session.totalDeaths = deathsSoFar;
      session.pendingFight = true;
      beginTransition(session);
      session.analysis = '你撿起了一把劍';
    } else if (!next || bossLocked) {
      session.totalDeaths = deathsSoFar;
      session.phase = 'finished';
      session.timer = 0;
      if (bossLocked) session.bossLocked = next.maxDeaths;
      // 傳給朋友的東西不是死亡數，是這一份
      session.report = buildReport(session.profile);
    } else {
      beginTransition(session);
    }
  }
}
