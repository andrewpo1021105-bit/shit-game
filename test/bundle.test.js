// 要傳給朋友的那個單檔 HTML。
//
// 打包器把每支模組包進各自的 IIFE 來隔離作用域——關卡檔之間有一堆同名的
// 東西（digGap、GAP_W、fillGap……），少了這層隔離會互相蓋掉，而且是
// 「打開來一片黑」的那種壞法。這裡真的把打包產物執行起來，
// 因為一個壞掉的單檔正是最丟臉的失敗模式：你已經傳出去了才發現。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubBrowser } from './helpers/browser-stub.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', '搞人遊戲.html');

function build() {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'build-single.mjs')], { cwd: ROOT });
}

// 把 <script type="module"> 裡的內容挖出來
function extractScript(html) {
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, '單檔 HTML 裡找不到 module script');
  return m[1];
}

test('打包器產得出單檔 HTML，而且是自給自足的', async () => {
  build();
  const html = await readFile(OUT, 'utf8');

  assert.ok(html.startsWith('<!doctype html>'));
  // 自給自足：不可以還留著任何要另外抓檔案的東西
  assert.ok(!/<script[^>]+src=/.test(html), '還有外連的 script，雙擊打不開');
  assert.ok(!/<link[^>]+href=/.test(html), '還有外連的樣式');
  assert.ok(!/^\s*import\s.+from\s+['"]\./m.test(extractScript(html)),
    '還留著相對路徑的 import，從 file:// 開會被 CORS 擋掉');
});

test('打包進去的是全部 12 關，不是只有進入點', async () => {
  const script = extractScript(await readFile(OUT, 'utf8'));
  for (let i = 1; i <= 12; i++) {
    const id = `src/game/levels/level${String(i).padStart(2, '0')}.js`;
    assert.ok(script.includes(id), `第 ${i} 關沒被打包進去`);
  }
});

test('打包產物真的跑得起來，能連跑數百幀不炸', async () => {
  const script = extractScript(await readFile(OUT, 'utf8'));

  const dir = join(tmpdir(), 'troll-bundle-check');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `bundle-${Date.now()}.mjs`);
  await writeFile(file, script, 'utf8');

  const framesRun = stubBrowser(400);
  await import(`file://${file.replace(/\\/g, '/')}`);
  assert.ok(framesRun() > 100,
    `打包後只跑了 ${framesRun()} 幀，主迴圈沒有真的動起來`);
});

test('同名的關卡輔助函式沒有互相蓋掉', async () => {
  const script = extractScript(await readFile(OUT, 'utf8'));
  // 三支關卡檔各有一個 digGap，打包後三個都要還在，
  // 而且各自關在自己的 IIFE 裡
  const digGaps = script.match(/function digGap/g) ?? [];
  assert.equal(digGaps.length, 3,
    `digGap 應該有 3 份（第 2、8、12 關），實際 ${digGaps.length} 份`);
});
