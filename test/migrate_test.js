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


const v1 = {
  subjects: [
    {id:'chinese',name:'语文',fullScore:150,targetScore:118},
    {id:'math',name:'数学',fullScore:150,targetScore:130},
    {id:'english',name:'英语',fullScore:150,targetScore:125},
    {id:'physics',name:'物理',fullScore:100,targetScore:85},
    {id:'chemistry',name:'化学',fullScore:100,targetScore:80},
    {id:'biology',name:'生物',fullScore:100,targetScore:75},
    {id:'politics',name:'政治',fullScore:100,targetScore:70},
    {id:'history',name:'历史',fullScore:100,targetScore:72},
    {id:'geography',name:'地理',fullScore:100,targetScore:68}
  ],
  exams: [
    {id:'e1',name:'高一上第一次月考',date:'2026-10-15',type:'monthly',
     totalClassRank:12,totalGradeRank:88,note:'首次',
     scores:{
       chinese:{score:116,classRank:10,gradeRank:70},
       math:{score:134,classRank:5,gradeRank:31},
       english:{score:122,classRank:9,gradeRank:66},
       physics:{score:88,classRank:7,gradeRank:45},
       chemistry:{score:79,classRank:15,gradeRank:120},
       biology:{score:81,classRank:11,gradeRank:90}
     }},
    {id:'e2',name:'高一上期中',date:'2026-11-05',type:'midterm',
     totalClassRank:8,totalGradeRank:60,note:'',
     scores:{
       chinese:{score:121,classRank:6,gradeRank:48},
       math:{score:141,classRank:2,gradeRank:9},
       english:{score:128,classRank:4,gradeRank:35}
     }}
  ]
};
store['grade_tracker_data'] = JSON.stringify(v1);

vm.runInContext(code, ctx, { filename: 'app.js' });
ctx.init();

const st = ctx.__t.getState();
const ok = [];
function check(name, cond, extra) { ok.push((cond ? '✓ ' : '✗ ') + name + (extra ? '  ' + extra : '')); }

check('考试条数迁移', st.exams.length === 2, String(st.exams.length));
const e1 = st.exams.find(e => e.name === '高一上第一次月考');
check('考试名称保留', !!e1);
check('日期保留', e1 && e1.date === '2026-10-15', e1 && e1.date);
check('类型保留', e1 && e1.type === 'monthly');
check('班排保留', e1 && e1.totalClassRank === 12, String(e1 && e1.totalClassRank));
check('年排保留', e1 && e1.totalGradeRank === 88, String(e1 && e1.totalGradeRank));
check('备注保留', e1 && e1.note === '首次', JSON.stringify(e1 && e1.note));
check('单科分数保留(数学134)', e1 && e1.scores.math.score === 134, String(e1 && e1.scores.math.score));
check('单科班排保留(数学5)', e1 && e1.scores.math.classRank === 5);
check('单科年排保留(数学31)', e1 && e1.scores.math.gradeRank === 31);
check('科目数仍是9', st.subjects.length === 9, String(st.subjects.length));
check('满分保留(语文150)', st.subjects[0].fullScore === 150);
check('目标分保留(数学130)', st.subjects[1].targetScore === 130, String(st.subjects[1].targetScore));
check('考试归入当前学期', st.exams.every(e => !!e.termId));
check('新键已写入', !!store['grade_tracker_v2']);
check('旧键未被删除', !!store['grade_tracker_data']);

// 渲染一次，确认页面能吃下迁移后的数据
ctx.switchView('home');
ctx.switchView('exams');
ctx.setScoreMode('weighted');
ctx.switchView('analysis');
check('渲染无异常', true);

const total = ctx.examTotalDisplay(e1);
check('迁移后总分可计算', total && total.value > 0, total && String(total.value));

console.log(ok.join('\n'));
console.log('\n失败项: ' + ok.filter(x => x[0] === '✗').length);
