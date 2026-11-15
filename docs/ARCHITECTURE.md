# 架构说明

> 目标读者：想读源码、改功能或把它移植到别处的人。
> 全部代码在 `app/index.html` 一个文件里，约 3,000 行，自上而下分为：样式 → DOM 骨架 → 脚本（存储 / 计算 / 渲染 / 交互）。

---

## 1. 分层

```
┌───────────────────────────────────────────────┐
│ 渲染层   renderHome / renderExams / renderAnalysis / renderMistakes / renderSettings │
│          拼 HTML 字符串 → innerHTML          │
├───────────────────────────────────────────────┤
│ 交互层   openExamModal / saveExam / importExamTable / exportCSV / switchView … │
├───────────────────────────────────────────────┤
│ 计算层   examTotals / totalFor / subjectStats / prevExamOf / rank 换算 … │
├───────────────────────────────────────────────┤
│ 存储层   loadState / saveState / mergeState / migrateV1 │
├───────────────────────────────────────────────┤
│ 桥接层   AndroidBridge（可选，全部"不在就降级"）│
└───────────────────────────────────────────────┘
```

没有框架、没有虚拟 DOM、没有响应式系统。数据流是单向的：

```
用户操作 → 改 state → saveState() → renderXxx() → innerHTML
```

`switchView(view)` 负责切标签：设置 `.view` 的显隐、更新底部导航高亮、调用对应的 `renderXxx()`，并在离开视图时 `dispose` 掉图表实例。

---

## 2. 数据模型

主键 `grade_tracker_v2`，一个 JSON 对象（`SCHEMA = 2`）：

```jsonc
{
  "schemaVersion": 2,

  "subjects": [                       // 9 科，顺序即展示顺序
    {
      "id": "math",                   // 稳定 ID，作为 scores 的键
      "name": "数学",
      "fullScore": 150,               // 满分
      "targetScore": 130,             // 目标分，null = 未设
      "weight": 1,                    // 加权模式下的权重
      "elective": true,               // 是否选考科目
      "assign": false,                // 是否参与赋分
      "assignBase": 30,               // 赋分下限
      "assignMax": 100,               // 赋分上限
      "hidden": false                 // 隐藏后不参与统计与图表
    }
  ],

  "terms": [                          // 学期
    {
      "id": "t2025a",
      "name": "2025-2026 学年 · 上学期",
      "startDate": "2025-09-01",
      "endDate": "2026-01-31"
    }
  ],

  "exams": [
    {
      "id": "m3x9a1",                 // uid()：时间戳 36 进制 + 5 位随机
      "name": "第一次月考",
      "date": "2026-09-28",            // YYYY-MM-DD
      "type": "monthly",               // monthly / midterm / final / mock / other
      "termId": "t2025a",
      "totalClassRank": 12,            // 总分班排，可为 null
      "totalGradeRank": 68,            // 总分年排
      "note": "",
      "scores": {                      // 键 = subject.id
        "math": { "score": 134, "fullScore": 150, "classRank": 5, "gradeRank": 31 }
      }
    }
  ],

  "mistakes": [
    {
      "id": "…", "subjectId": "math", "examId": "m3x9a1",
      "cause": "careless",             // 错因分类
      "question": "题干/来源", "correction": "订正",
      "tags": ["函数"], "mastered": false, "createdAt": 1790000000000
    }
  ],

  "scoreData": {                       // 一分一段表，null = 未导入
    "province": "浙江", "year": 2025, "subjectType": "普通类",
    "version": "2025.06", "source": "import|paste|remote|demo",
    "controlLines": [{ "name": "一段线", "score": 495 }],
    "segments": [{ "score": 700, "count": 12, "cumulative": 120 }]
  },

  "settings": {
    "activeTermId": "t2025a",
    "viewMode": "student",             // student | parent
    "theme": "auto",                   // auto | light | dark
    "scoreMode": "raw",                // raw | weighted | assigned
    "nextExam": { "name": "", "date": "" },
    "remindDays": 7,
    "dataSource": { "url": "", "auto": true, "lastCheck": 0 },
    "province": "", "year": ""
  },

  "meta": { "createdAt": 0, "lastBackup": 0, "lastSave": 0 }
}
```

设计约束：

- **`subject.id` 是外部契约**。改名可以，改 ID 会让历史 `scores` 全部失配。自定义科目时从名称派生 ID。
- **考试不存总分**。总分永远由 `scores` 现算，避免"改了单科分数但总分没同步"的脏数据。
- **`fullScore` 在考试记录里也存一份**，因为不同考试可能满分不同（例如某次月考数学 120 分制）。

---

## 3. 存储与备份

```js
const STORE_KEY  = 'grade_tracker_v2';
const LEGACY_KEY = 'grade_tracker_data';          // v1
const BAK_KEYS   = ['grade_tracker_bak_0', '…_1', '…_2'];
const SCHEMA     = 2;
```

`saveState()` 的流程：

1. 更新 `meta.lastSave`；
2. 判断是否距上次备份超过 24 小时（`meta.lastBackup`）——是则把 `bak_0 → bak_1 → bak_2` 依次后移，当前状态写入 `bak_0`；
3. `JSON.stringify(state)` 写入主键；捕获 `QuotaExceededError` 并提示"存储空间不足"，**不抛出**；
4. 如果存在原生桥 `AndroidBridge.writeBackup`，把同一份 JSON 追加落盘（原生侧保留 5 份）。

读取走 `loadState()` → `mergeState(defaultState(), saved)`：

- 深合并是**手写**的，只对已知字段做 `Object.assign`，不递归合并任意结构；
- 缺失字段一律落回默认值，所以旧版本数据、被手工编辑过的 JSON 都不会把应用带崩；
- 老考试没有 `termId` 时自动归到最后一个学期。

### v1 → v2 迁移

`migrateV1(v1)` 只在主键不存在、且 `grade_tracker_data` 存在时执行一次：

| v1 | v2 |
|---|---|
| `subjects[i].fullScore / targetScore` | 同名映射，按 `id` 匹配，匹配不到按索引 |
| `exams[].scores` | 原样搬进 `scores`（结构兼容） |
| `exams[].totalClassRank / totalGradeRank` | 同名映射 |
| 无 | `termId` 统一填当前学期 |

迁移后写入新键，**旧键保留不删**——多一层保险，也让用户可以随时回退。回归用例 `test/migrate_test.js` 用一份真实 v1 数据做了 18 项断言（分数、班排、年排、目标分、总分 620 等）。

---

## 4. 计分体系

三种模式，由 `settings.scoreMode` 决定，`totalFor(exam, mode)` 统一出口：

| 模式 | 总分 | 满分 |
|---|---|---|
| `raw` 原始 | `Σ score` | `Σ fullScore` |
| `weighted` 加权 | `Σ score × weight` | `Σ fullScore × weight` |
| `assigned` 赋分 | `Σ assignedOf(score, full)` | 赋分科目取 `assignMax`，其余取 `fullScore` |

```js
assignedOf(s, score, full) =
  s.assign ? round(base + (max - base) × clamp(score / full, 0, 1)) : score
```

`base = assignBase`（默认 30），`max = assignMax`（默认 100）。

> ⚠️ **这是简化模型**。真实的等级赋分是按省份的分段人数比例把原始分映射到等级再赋分，和"线性得分率"不是一回事。
> 替换点很集中：只改 `assignedOf()` 一个函数即可，不需要动其他代码。

`scoredEntries(exam)` 是统计的统一入口：只返回**可见科目且分数有效**的记录，并带上该次考试的满分。所有总分、趋势、强弱都基于它。

---

## 5. 分析算法

### 5.1 上次考试

```js
prevExamOf(exam, pool) // 按日期排序后取前一场；同日多场按插入顺序
```

### 5.2 变化描述

`changeText(cur, prev, lowerIsBetter)` —— 名次类指标 `lowerIsBetter = true`，分数类为 `false`，输出带方向的 `<span class="up|down">`。

### 5.3 单科强弱（跨科可比）

绝对分数不能跨科比较（数学 134/150 与物理 82/100 谁更强？）。这里用**得分率**做标准化：

```js
subjectStats(exams) // 每科：mean(得分率), std(样本标准差), n
z = (本次得分率 − 个人均值) / std
```

样本数 < 2 时 `std` 退化为 `0.0001`，避免除零，也让"只有一次考试"时 z 恒为 0（不显示强弱，符合直觉）。

条形图按 **提分空间**（`1 − mean(得分率)`）排序，而不是按 z 值排序——z 回答"这次相对自己如何"，提分空间回答"先补哪科划算"，两者都展示。

### 5.4 位次换算

一分一段表 `segments` 按分数从高到低：

```
位次 = 该分数及以上累计人数 = cumulative(该分数)
同分人数 = count
位次区间 = [cumulative − count + 1, cumulative]
超过考生百分比 = (总人数 − cumulative) / 总人数
```

750 折算：`折算分 = 750 × (本次总分 / 本次满分)`，用**得分率**换算，而不是拿校内 1050 分制直接套高考表。

### 5.5 目标达成

```js
gap = 本次分数 − targetScore      // 正数达标
progress = clamp(本次分数 / targetScore, 0, 1)
```

---

## 6. 图表生命周期

ECharts 实例统一存在 `charts = {}` 里，键是容器 `id`：

```js
function chart(id) {
  if (charts[id]) charts[id].dispose();      // 同容器先销毁再建
  const c = echarts.init(document.getElementById(id), null, { renderer: 'canvas' });
  charts[id] = c;
  return c;
}
window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));
```

早期版本每个 `renderHome()` 都 `new ResizeObserver` 且从不解绑，切十几次视图就泄漏一批观察器和 canvas。现在：

- 切视图时 `disposeAll()`；
- 全局只有一个 `resize` 监听；
- 容器还没进 DOM（`offsetWidth === 0`）时跳过初始化，避免 ECharts 警告。

配色不硬编码，通过 `palette()` 读 CSS 变量，随 `data-theme` 切换，所以深色模式下图例、轴线、网格线都跟着变。

---

## 7. 成绩单分享图

`openShareCard(examId)` → 1080×1500 canvas 手绘：

1. 渐变头图 + 学校/考试名；
2. 总分大字 + 排名徽章（家长视图下不画排名）；
3. 各科条形（按满分归一，颜色按达标/未达标）；
4. 较上次变化 + 页脚。

导出三级降级：`AndroidBridge.saveImage`（存相册）→ `<a download>`（浏览器下载）→ 提示长按图片保存。

---

## 8. 原生桥

| 接口 | 用途 | 不在时的降级 |
|---|---|---|
| `AndroidBridge.saveImage(base64, name)` | 分享图存相册 | `<a download>` + 长按提示 |
| `AndroidBridge.saveFile(name, mime, text)` | 导出 JSON/CSV 落盘 | 弹出可全选复制的文本框 |
| `AndroidBridge.notify(title, body)` | 考试提醒系统通知 | 首页提醒条 |
| `AndroidBridge.writeBackup(json)` | 每日快照落盘 | 只写 localStorage 快照 |
| `window.appHandleBack()` | 返回键：先关弹层 → 回首页 → 退出 | 系统默认直接退出 |

`appHandleBack()` 的实现要点：先找 `.modal-overlay.show` 逐个关掉，没有弹层且当前不是首页则 `switchView('home')`，都处理完了才 `AndroidBridge.exitApp()`（如果存在）。返回布尔值表示"是否消费了这次返回"。

---

## 9. 性能与安全注意事项

- **`innerHTML` 全量重绘**：一次考试列表重绘在低端机上约 10–30 ms，可接受。搜索框做了例外——只重绘列表容器，否则中文输入法每个字都会丢焦点。
- **`esc()` 必须过**：所有用户输入、导入内容在进模板前都过 `esc()`。新增渲染代码时别忘。
- **localStorage 是同步 API**：单次 `setItem` 大对象（>1 MB）会有明显卡顿，所以只存必要字段。
- **`state` 是全局可变对象**：没有不可变约束，改完记得 `saveState()` + 重绘。
