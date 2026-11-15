/* 翻译覆盖率检测：
   在 Node 里加载前端脚本（不启动 UI），把语言切到指定语言，
   再逐个检查界面文案是否仍含中文。用于找出漏翻的词条。

   用法：node test/i18n_coverage.js [en|ja|ko|es|ru]
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lang = process.argv[2] || 'en';
const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

/* 最小 DOM 桩：只为让脚本能解析执行，不渲染任何东西 */
const noop = () => { };
function stubEl() {
  return {
    style: {}, dataset: {}, children: [], textContent: '', value: '', scrollTop: 0,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    set innerHTML(v) { }, get innerHTML() { return ''; },
    querySelector: () => stubEl(), querySelectorAll: () => [],
    appendChild: noop, removeChild: noop, insertBefore: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop, click: noop, focus: noop,
    getBoundingClientRect: () => ({ width: 380, height: 260 })
  };
}
const store = {};
const sandbox = {
  console,
  window: {
    __appInited: true,
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    location: { href: '', protocol: 'file:' }
  },
  navigator: { language: 'zh-CN' },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: {
    readyState: 'complete',
    documentElement: stubEl(),
    body: stubEl(),
    createElement: () => stubEl(),
    getElementById: () => stubEl(),
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    addEventListener: noop
  },
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0,
  MutationObserver: undefined,
  NodeFilter: undefined
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(blocks.join('\n;\n'), sandbox, { filename: 'index.html' });
} catch (e) {
  console.error('脚本执行失败：', e.message);
  process.exit(2);
}

vm.runInContext(`applyLanguage('${lang}')`, sandbox);

/* 从源码里抽取所有界面文案 */
const texts = new Set();
const htmlPart = html.slice(0, html.indexOf('<script>\n'));
for (const m of htmlPart.matchAll(/>([^<>]*[\u4e00-\u9fa5][^<>]*)</g)) texts.add(m[1].replace(/\s+/g, ' ').trim());
for (const attr of ['placeholder', 'title', 'aria-label']) {
  for (const m of htmlPart.matchAll(new RegExp(attr + '="([^"]*[\\u4e00-\\u9fa5][^"]*)"', 'g'))) texts.add(m[1].trim());
}
const jsPart = html.slice(html.indexOf('</script>', html.indexOf('国际化模块（i18n）')));
for (const m of jsPart.matchAll(/>([^<>`$]*[\u4e00-\u9fa5][^<>`$]*)</g)) {
  const s = m[1].replace(/\s+/g, ' ').trim();
  if (s && s.length < 120) texts.add(s);
}
for (const m of jsPart.matchAll(/'([^'\\\n]*[\u4e00-\u9fa5][^'\\\n]*)'/g)) {
  const s = m[1].trim();
  if (s && s.length < 120) texts.add(s);
}
for (const m of jsPart.matchAll(/"([^"\\\n]*[\u4e00-\u9fa5][^"\\\n]*)"'/g)) {
  const s = m[1].trim();
  if (s && s.length < 120) texts.add(s);
}

/* 过滤掉 CSS、代码片段等非文案 */
const isNoise = s =>
  /[{};=<>]/.test(s) ||
  /^[\w.$]+\s*\(/.test(s) ||
  /^[.#][\w-]+\s/.test(s) ||
  s.length < 1;

const translateText = vm.runInContext('translateText', sandbox);
const ownDict = vm.runInContext(`I18N_DICT['${lang}'] || {}`, sandbox);
const enDict = vm.runInContext('I18N_DICT.en', sandbox);

let checked = 0, localized = 0, viaEnglish = 0;
const missing = [];
for (const s of texts) {
  if (isNoise(s)) continue;
  checked++;
  if (Object.prototype.hasOwnProperty.call(ownDict, s)) { localized++; continue; }
  if (Object.prototype.hasOwnProperty.call(enDict, s)) { viaEnglish++; continue; }
  // 命中动态模式或科目名，也算本地化
  if (translateText(s) !== s) { localized++; continue; }
  missing.push(s);
}

const pct = v => ((v / checked) * 100).toFixed(1) + '%';
console.log(`语言: ${lang}`);
console.log(`检查词条: ${checked}`);
console.log(`  本语言词典: ${localized} (${pct(localized)})`);
console.log(`  回退英文:   ${viaEnglish} (${pct(viaEnglish)})`);
console.log(`  完全缺失:   ${missing.length} (${pct(missing.length)})`);
if (missing.length) {
  console.log('\n--- 完全缺失清单 ---');
  missing.sort().forEach(s => console.log('  ' + s));
}
/* 只有本语言覆盖率低于 60% 才算不合格（当前语言至少要能看懂主要界面） */
if (localized / checked < 0.6) {
  console.log(`\n本语言覆盖率 ${pct(localized)} 低于 60% 阈值`);
  process.exit(1);
}
