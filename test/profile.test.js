import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, noteLanding, noteAttempt, describeProfile } from '../src/game/profile.js';

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

test('還沒有樣本時說樣本不足', () => {
  assert.equal(describeProfile(createProfile()), '樣本不足');
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
