// 把整個遊戲打包成一個 .html，雙擊就能玩——不需要伺服器、不需要帳號。
//
// 為什麼不能直接把檔案串起來：關卡檔之間有一堆同名的東西
// （digGap、GAP_W、fillGap……），串在一起會互相蓋掉。
// 所以每支模組各自包在一個 IIFE 裡，靠一個 __mods 表互相取用，
// 等於手工做一次 ES module 的作用域隔離。
//
// 用法：node tools/build-single.mjs   →   dist/搞人遊戲.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');

const key = (abs) => relative(ROOT, abs).replace(/\\/g, '/');

// import { a, b } from './x.js';   或   import x from './x.js';
const IMPORT_RE = /^import\s+(?:(\{[^}]*\})|(\w+))\s+from\s+['"]([^'"]+)['"];?\s*$/gm;

async function collect(abs, seen = new Map()) {
  if (seen.has(abs)) return seen;
  seen.set(abs, null);   // 先佔位，避免循環相依無限遞迴

  const src = await readFile(abs, 'utf8');
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    deps.push({ names: m[1], defaultName: m[2], abs: resolve(dirname(abs), m[3]) });
  }
  for (const d of deps) await collect(d.abs, seen);

  seen.set(abs, { src, deps });
  return seen;
}

// 把一支模組轉成「回傳自己所有匯出」的 IIFE
function wrap(abs, { src, deps }) {
  let body = src;

  // import → 從 __mods 取
  body = body.replace(IMPORT_RE, (_all, names, defaultName, spec) => {
    const id = key(resolve(dirname(abs), spec));
    return names
      ? `const ${names} = __mods[${JSON.stringify(id)}];`
      : `const ${defaultName} = __mods[${JSON.stringify(id)}].default;`;
  });

  const exported = [];

  // export default { ... }  →  具名的區域變數，最後放進回傳物件
  if (/^export\s+default\s/m.test(body)) {
    body = body.replace(/^export\s+default\s/m, 'const __default = ');
    exported.push('default: __default');
  }

  // export function foo / export const foo
  for (const m of body.matchAll(/^export\s+(?:function|const)\s+(\w+)/gm)) {
    exported.push(m[1]);
  }
  body = body.replace(/^export\s+/gm, '');

  return `__mods[${JSON.stringify(key(abs))}] = (function () {\n${body}\nreturn { ${exported.join(', ')} };\n})();`;
}

// 相依在前的順序（深度優先後序）
function order(seen, abs, done = new Set(), out = []) {
  if (done.has(abs)) return out;
  done.add(abs);
  for (const d of seen.get(abs).deps) order(seen, d.abs, done, out);
  out.push(abs);
  return out;
}

const seen = await collect(ENTRY);
const bundle = order(seen, ENTRY)
  .map((abs) => wrap(abs, seen.get(abs)))
  .join('\n\n');

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>搞人遊戲</title>
<style>
  html, body { margin: 0; height: 100%; background: #05060a; overflow: hidden; }
  body {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    font: 12px/1.6 Consolas, "Microsoft JhengHei", monospace;
    color: #6f779b;
  }
  /* touch-action: none——沒有它,手機上按方向鈕會變成捲動頁面 */
  canvas { image-rendering: pixelated; display: block; touch-action: none; }
  #hint { text-align: center; }
  #hint b { color: #8fd6a0; font-weight: normal; }
</style>
</head>
<body>
<canvas id="game" width="480" height="270"></canvas>
<div id="hint">
  <b>&larr; &rarr;</b> 移動　<b>空白鍵</b> 跳　<b>R</b> 重來　手機平板開頭選「📱」就有觸控按鈕
</div>
<script type="module">
const __mods = {};

${bundle}
</script>
</body>
</html>
`;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
const out = resolve(ROOT, 'dist/搞人遊戲.html');
await writeFile(out, html, 'utf8');
console.log(`${key(out)}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
