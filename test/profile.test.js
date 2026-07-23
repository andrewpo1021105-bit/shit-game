import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile, noteLanding, noteAttempt, describeProfile,
  noteApex, noteSpeed, noteRestartDelay, noteRoute, median,
} from '../src/game/profile.js';

test('median 取中位數，偶數個時取中間兩個的平均', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('median 不會弄亂原始陣列', () => {
  const list = [3, 1, 2];
  median(list);
  assert.deepEqual(list, [3, 1, 2]);
});

test('記錄跳躍最高點，取整數像素', () => {
  const p = createProfile();
  noteApex(p, 51.4);
  assert.equal(p.lastApex, 51);
  noteApex(p, 20.6);
  assert.equal(p.lastApex, 21);
  assert.deepEqual(p.apexes, [51, 21]);
});

test('記錄速度時取絕對值，往左走也算', () => {
  const p = createProfile();
  noteSpeed(p, -112);
  assert.equal(p.lastSpeed, 112);
});

test('記錄重生後的反應延遲', () => {
  const p = createProfile();
  noteRestartDelay(p, 0.2345);
  assert.equal(p.lastRestartDelay, 0.23);
});

test('記錄走過的路線', () => {
  const p = createProfile();
  noteRoute(p, 'high');
  noteRoute(p, 'low');
  assert.equal(p.lastRoute, 'low');
  assert.deepEqual(p.routes, ['high', 'low']);
});

test('所有歷史都有上限，長跑一小時也不會吃光記憶體', () => {
  const p = createProfile();
  for (let i = 0; i < 200; i++) {
    noteLanding(p, i); noteApex(p, i); noteSpeed(p, i);
    noteRestartDelay(p, i); noteRoute(p, i % 2 ? 'high' : 'low');
  }
  for (const list of [p.landings, p.apexes, p.speeds, p.restartDelays, p.routes]) {
    assert.ok(list.length <= 20, `歷史長度 ${list.length} 沒有被截斷`);
  }
});

test('新側寫還不知道任何事', () => {
  const p = createProfile();
  assert.equal(p.lastLandTile, null);
  assert.equal(p.attempts, 0);
  assert.deepEqual(p.landings, []);
});

test('記錄落點，最新的一次會蓋掉舊的', () => {
  const p = createProfile();
  noteLanding(p, 16);
  assert.equal(p.lastLandTile, 16);
  noteLanding(p, 19);
  assert.equal(p.lastLandTile, 19);
});

test('保留落點歷史，之後的關卡才算得出習慣', () => {
  const p = createProfile();
  noteLanding(p, 16);
  noteLanding(p, 17);
  noteLanding(p, 16);
  assert.deepEqual(p.landings, [16, 17, 16]);
});

test('落點歷史有上限，不會無限長大', () => {
  const p = createProfile();
  for (let i = 0; i < 100; i++) noteLanding(p, i);
  assert.ok(p.landings.length <= 20, `歷史長度 ${p.landings.length} 應該被截斷`);
  assert.equal(p.lastLandTile, 99);
});

test('每次重生累加嘗試次數', () => {
  const p = createProfile();
  noteAttempt(p);
  noteAttempt(p);
  assert.equal(p.attempts, 2);
});

test('還沒有樣本時什麼都不說', () => {
  assert.equal(describeProfile(createProfile()), null);
});

test('只有一次落點還不算習慣，仍然閉嘴', () => {
  const p = createProfile();
  noteLanding(p, 16);
  assert.equal(describeProfile(p), null, '一次不成習慣，不該開口');
});

test('找得出重複最多次的落點', () => {
  const p = createProfile();
  [16, 17, 16, 16, 19].forEach((t) => noteLanding(p, t));
  assert.equal(describeProfile(p), '你 5 次裡有 3 次落在第 16 格');
});

test('沒有任何重複時說落點飄忽', () => {
  const p = createProfile();
  [10, 11, 12].forEach((t) => noteLanding(p, t));
  assert.equal(describeProfile(p), '落點飄忽：3 次沒有兩次一樣');
});

test('轉場沒話說時不會硬擠出一行字', () => {
  const p = createProfile();
  assert.equal(describeProfile(p), null);
  noteLanding(p, 5);
  assert.equal(describeProfile(p), null);
  noteLanding(p, 5);
  assert.ok(describeProfile(p).includes('第 5 格'), '湊滿兩次才開口');
});

test('次數平手時取小的格，結果才可重現', () => {
  const p = createProfile();
  [19, 12, 19, 12].forEach((t) => noteLanding(p, t));
  assert.equal(describeProfile(p), '你 4 次裡有 2 次落在第 12 格');
});

test('落點格會取整數，因為地形是以格為單位重建的', () => {
  const p = createProfile();
  noteLanding(p, 16.8);
  assert.equal(p.lastLandTile, 16);
});
