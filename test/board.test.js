import test from 'node:test';
import assert from 'node:assert/strict';
import { accepts, sift, rank } from '../src/game/board.js';
import { MIN_BOARD_TIME } from '../src/game/constants.js';

const run = (time, extra = {}) => ({ name: 'x', time, deaths: 1, date: '08-01', ...extra });

test('剛好踩在門檻上的成績算數', () => {
  assert.equal(accepts(run(MIN_BOARD_TIME)), true);
});

test('差一點點也不算——門檻不是「大概」', () => {
  assert.equal(accepts(run(MIN_BOARD_TIME - 0.1)), false);
});

// 榜是全世界共用的一份 JSON,任何人都能手動 PUT 進去。
// 只擋時間不夠是不夠的,壞掉的資料同樣會把結算畫面炸掉。
test('時間不是數字的一律不收', () => {
  for (const bad of [run('999'), run(null), run(undefined), run(NaN), run(Infinity), {}, null]) {
    assert.equal(accepts(bad), false, `${JSON.stringify(bad)} 不該被收下`);
  }
});

test('sift 只留下算數的那幾筆,順序不動', () => {
  const list = [run(300), run(30), run(90), run(59.9), run(60)];
  assert.deepEqual(sift(list).map((r) => r.time), [300, 90, 60]);
});

test('sift 遇到不是陣列的東西會回空榜,而不是炸掉', () => {
  for (const junk of [null, undefined, { error: 'nope' }, '[]', 42]) {
    assert.deepEqual(sift(junk), []);
  }
});

test('時間快的排前面', () => {
  assert.deepEqual(rank([run(300), run(90), run(150)]).map((r) => r.time), [90, 150, 300]);
});

test('同秒數時死得少的排前面', () => {
  const ranked = rank([run(90, { deaths: 9 }), run(90, { deaths: 2 })]);
  assert.deepEqual(ranked.map((r) => r.deaths), [2, 9]);
});

test('rank 不會就地改動傳進來的陣列', () => {
  const list = [run(300), run(90)];
  rank(list);
  assert.deepEqual(list.map((r) => r.time), [300, 90]);
});
