/* 最小 DOM 桩，用于在 Node 中跑一遍前端逻辑，捕捉运行时错误 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = blocks.join('\n;\n') + `
;globalThis.__t = {
  getState: () => state,
  setTab: (v) => { state.analysisTab = v; },
  setSubj: (i, k, v) => { state.subjects[i][k] = v; },
  exams: () => state.exams
};`;

function makeEl(id) {
  const el = {
    id, _html: '', value: '', textContent: '', scrollTop: 0,
    style: {}, dataset: {}, children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } },
      contains(c) { return this._s.has(c); }
    },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    appendChild(c) { this.children.push(c); },
    removeChild(c) { },
    insertBefore() { },
    click() { }, focus() { }, addEventListener() { }, removeEventListener() { },
    setAttribute() { }, getAttribute() { return null; }, removeAttribute() { },
    getBoundingClientRect() { return { width: 380, height: 260 }; },
    onclick: null, oninput: null, onchange: null, onscroll: null
  };
  return el;
}

const els = {};
const document = {
  readyState: 'complete',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext() {
          const noop = () => { };
          return new Proxy({
            measureText: () => ({ width: 40 }),
            createLinearGradient: () => ({ addColorStop: noop }),
            canvas: { width: 1080, height: 1500 }
          }, { get: (t, k) => (k in t ? t[k] : noop) });
        },
        toDataURL: () => 'data:image/png;base64,AAA'
      };
    }
    return makeEl(tag);
  },
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  querySelector() { return makeEl('q'); },
  querySelectorAll() { return []; },
  addEventListener() { }
};

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

const echarts = {
  init: () => ({ setOption() { }, dispose() { }, resize() { }, clear() { } }),
  graphic: { LinearGradient: function () { } }
};

const ctx = {
  console, Math, Date, JSON, Number, String, Object, Array, Boolean, isNaN, parseFloat, parseInt,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document, localStorage, echarts, navigator: { onLine: true },
  matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
  Blob: function () { }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
  FileReader: function () { this.readAsText = () => { }; },
  AbortController: function () { this.abort = () => { }; this.signal = {}; },
  fetch: () => Promise.reject(new Error('no network')),
  addEventListener() { }, removeEventListener() { }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

const errors = [];
function step(name, fn) {
  try { fn(); console.log('✓ ' + name); }
  catch (e) { errors.push(name + ': ' + e.message); console.log('✗ ' + name + ' -> ' + e.message); }
}

try {
  vm.runInContext(code, ctx, { filename: 'app.js' });
  console.log('✓ 脚本解析并执行');
} catch (e) {
  console.log('✗ 脚本执行失败: ' + e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}

step('init', () => ctx.boot ? ctx.boot() : ctx.init());
step('loadDemoData', () => ctx.loadDemoData());
step('renderHome', () => ctx.switchView('home'));
step('renderExams', () => ctx.switchView('exams'));
step('analysis-trend', () => { ctx.__t.setTab('trend'); ctx.switchView('analysis'); });
step('analysis-strength', () => { ctx.__t.setTab('strength'); ctx.switchView('analysis'); });
step('analysis-rank', () => { ctx.__t.setTab('rank'); ctx.switchView('analysis'); });
step('loadDemoScore', () => ctx.loadDemoScoreData());
step('recalcRank', () => { ctx.document.getElementById('rk-score').value = '620'; ctx.recalcRank(); });
step('fillScoreFromRate', () => ctx.fillScoreFromRate());
step('renderMistakes', () => ctx.switchView('mistakes'));
step('renderExamList', () => ctx.renderExamList());
step('renderMistakeList', () => ctx.renderMistakeList());
step('toggleSubject', () => ctx.toggleSubject(2, 'hidden'));
step('weightsPreset', () => ctx.applyWeightPreset());
step('renderSettings', () => ctx.switchView('settings'));
step('openExamModal', () => ctx.openExamModal());
step('collectScores', () => ctx.collectExamScores());
step('updateTotalDisplay', () => ctx.updateTotalDisplay());
step('openDetail', () => { const e = ctx.__t.exams()[0]; ctx.openDetailModal(e.id); });
step('shareCard', () => ctx.openShareCard());
step('openMistakeModal', () => ctx.openMistakeModal());
step('termModal', () => ctx.openTermModal());
step('dataModal', () => ctx.openDataModal());
step('parseScoreTable', () => ctx.parseScoreTable('分数,本段人数,累计人数\n700,10,50\n699,20,70'));
step('exportCSV', () => ctx.exportCSV());
step('importTable', () => ctx.importExamTable('日期\t考试名称\t科目\t分数\t满分\n2026-09-01\t测试\t语文\t110\t150\n2026-09-01\t测试\t数学\t120\t150'));
step('mode-weighted', () => { ctx.setScoreMode('weighted'); ctx.switchView('home'); });
step('mode-assigned', () => { ctx.__t.setSubj(3, 'assign', true); ctx.setScoreMode('assigned'); ctx.switchView('home'); });
step('theme-dark', () => { ctx.setThemeMode('dark'); });
step('parent-view', () => { ctx.setViewMode('parent'); });
step('saveExam', () => {
  ctx.openExamModal();
  ctx.document.getElementById('exam-name').value = '新考试';
  ctx.document.getElementById('exam-date').value = '2026-10-20';
  // 伪造单科输入
  ctx.document.getElementById('subject-scores-container').querySelectorAll = () => [];
  ctx.saveExam();
});
step('appHandleBack', () => ctx.appHandleBack());

console.log('\n--- 错误汇总 ---');
if (!errors.length) console.log('无');
else errors.forEach(e => console.log('• ' + e));

if (process.argv.includes('--dump')) {
  const g = (id) => (els[id] ? els[id]._html : '(none)');
  const st = ctx.__t.getState();
  console.log('\n=== 数据 ===');
  console.log('exams', st.exams.length, '| terms', st.terms.length, '| subjects', st.subjects.length, '| mistakes', st.mistakes.length);
  const e0 = st.exams[0];
  console.log('exam0', e0.name, e0.date, 'scores', Object.keys(e0.scores).length);
  console.log('total raw', ctx.examTotalDisplay(e0));
  console.log('\n=== 首页 HTML 长度', g('home-content').length, '===');
  console.log(g('home-content').replace(/\s+/g, ' ').slice(0, 900));
  console.log('\n=== 位次结果 ===');
  console.log(g('rank-result').replace(/\s+/g, ' ').slice(0, 700));
  console.log('\n=== 设置页长度', g('settings-content').length, '===');
  console.log(g('settings-content').replace(/\s+/g, ' ').slice(0, 400));
  console.log('\n=== 分享卡片 ===', g('share-body').slice(0, 120));
  console.log('\n=== 详情 ===', g('detail-title'), '|', g('detail-body').replace(/\s+/g,' ').slice(0,300));
}
