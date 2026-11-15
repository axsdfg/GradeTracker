/* 真实渲染验证：
   用 jsdom 真正执行 index.html，载入示例数据后逐个视图扫描，
   统计指定语言下仍残留的中文文本。用于确认界面确实被翻译，
   而不是只通过静态比对。

   用法：node test/render_check.js [en|ja|ko|es|ru]
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const lang = process.argv[2] || 'en';
const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://localhost/',
  pretendToBeVisual: true,
  resources: undefined // 不加载 echarts.min.js，走「图表库未加载」分支
});
const w = dom.window;

const errors = [];
w.addEventListener('error', e => errors.push(String(e.message || e.error)));

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await wait(120);
  const ev = code => {
    try { return w.eval(code); }
    catch (e) { errors.push('eval: ' + e.message); return null; }
  };

  // 关掉确认框，直接执行
  ev(`window.showConfirm = (m, ok) => { ok && ok(); }; window.showAlert = m => {};`);
  ev(`loadDemoData()`);

  // 切语言
  const ok = ev(`typeof setLanguage === 'function'`);
  if (!ok) { console.error('setLanguage 未定义，页面脚本可能未执行'); process.exit(2); }
  ev(`setLanguage('${lang}')`);

  const views = ['home', 'exams', 'analysis', 'mistakes', 'settings'];
  // 判据：文本仍等于英文词典里的中文原文，说明没被翻译。
  // 这样不会把日文汉字（如「学期平均」）误判为残留中文。
  const enKeys = new Set(Object.keys(w.eval('I18N_DICT.en')));
  let total = 0;
  const report = [];

  for (const v of views) {
    ev(`switchView('${v}')`);
    await wait(30);
    const container = w.document.getElementById('view-' + v);
    if (!container) { report.push({ view: v, cjk: 0, note: '容器不存在' }); continue; }
    const walker = w.document.createTreeWalker(container, w.NodeFilter.SHOW_TEXT);
    const hits = [];
    let n = walker.nextNode();
    while (n) {
      const s = (n.nodeValue || '').trim();
      // 语言下拉框里的语言名按惯例显示母语，不计入残留
      const inLangSelect = n.parentNode && n.parentNode.nodeName === 'OPTION' &&
        n.parentNode.parentNode && n.parentNode.parentNode.id === 'lang-select';
      if (s && enKeys.has(s) && !inLangSelect) hits.push(s);
      n = walker.nextNode();
    }
    // 统计输入框占位符
    const ph = [];
    container.querySelectorAll('[placeholder]').forEach(el => {
      const p = el.getAttribute('placeholder');
      if (p && enKeys.has(p.trim())) ph.push(p);
    });
    total += hits.length + ph.length;
    report.push({ view: v, cjk: hits.length + ph.length, samples: hits.slice(0, 6), ph: ph.slice(0, 3) });
  }

  console.log(`语言: ${lang}`);
  console.log(`视图数: ${views.length}`);
  console.log(`残留中文文本节点: ${total}`);
  for (const r of report) {
    console.log(`  ${r.view.padEnd(10)} ${String(r.cjk).padStart(3)} ${r.samples ? '  ' + r.samples.join(' | ') : ''}`);
    if (r.ph && r.ph.length) console.log(`             placeholder: ${r.ph.join(' | ')}`);
  }
  if (errors.length) {
    console.log('\n运行时错误:');
    [...new Set(errors)].slice(0, 10).forEach(e => console.log('  ' + e));
  }
  process.exit(total === 0 && errors.length === 0 ? 0 : 1);
})();
