# app/ —— 应用本体

| 文件 | 说明 |
|---|---|
| `index.html` | 全部代码（约 3,000 行）：样式 + DOM 骨架 + 脚本 |
| `legacy/index.v1.original.html` | 上一版前端，仅供对比与迁移参考，**不要**用它构建 |

## 运行

```bash
node ../scripts/fetch-vendor.js     # 首次：下载 ECharts 到 app/echarts.min.js
```

然后直接用浏览器打开 `index.html`，或：

```bash
node ../scripts/build-preview.js    # 生成 dist/preview.html（ECharts 内联，单文件）
```

> ECharts 不在仓库里（1 MB 第三方压缩代码）。缺少它时页面其余部分仍可用，只有图表区显示"图表库未加载"。

## 文件内部布局

自上而下：

| 区域 | 大致行数 | 内容 |
|---|---|---|
| `<head>` + 主题变量 | 1–40 | `:root` 与 `html[data-theme="dark"]` 两套 CSS 变量 |
| 样式 | 40–300 | 全部 CSS，无外链、无预处理器 |
| DOM 骨架 | 300–510 | 5 个 `.view` 容器 + 6 个弹层 + toast |
| 脚本 | 510–末尾 | 见下 |

脚本内部顺序（改代码时按这个顺序找）：

```
常量与工具函数 (STORE_KEY / esc / uid / fmtDate)
默认数据 (defaultSubjects / guessTerm / defaultState)
存储 (loadState / mergeState / migrateV1 / saveState)
计算 (scoredEntries / examTotals / totalFor / subjectStats / prevExamOf)
UI 基础 (toast / openModal / showAlert / showConfirm)
渲染 (switchView / renderHome / renderExams / renderAnalysis / renderMistakes / renderSettings)
图表 (chart / renderHomeChart / renderTrendCharts / renderStrengthCharts)
交互 (openExamModal / saveExam / importExamTable / exportCSV / openShareCard)
位次 (recalcRank / parseScoreTable / loadDemoScoreData)
初始化 (init / appHandleBack)
```

## 常见改动位置

| 想改什么 | 改哪里 |
|---|---|
| 配色 | `:root` 里的 CSS 变量（深色模式改 `html[data-theme="dark"]`） |
| 科目默认值 | `defaultSubjects()` |
| 新增一个功能标签 | DOM 加 `.view` → `switchView()` 加分支 → 写 `renderXxx()` |
| 新增统计指标 | 计算层加函数 → 渲染层调用；注意用 `scoredEntries()` 取数 |
| 赋分规则 | `assignedOf()`（唯一的替换点） |
| 导入格式 | `importExamTable()` |
| 分享图样式 | `openShareCard()`（Canvas 手绘，坐标是硬编码的 1080×1500） |

## 约定

- **改完 `state` 必须 `saveState()`**，否则刷新即丢。
- **所有用户输入进模板前过 `esc()`**。
- **不要新增 `fetch()`**。目前全文件只有一处（`checkScoreDataUpdate`），CI 会断言这一点。
- **图表用 `chart(id)` 创建**，不要直接 `echarts.init`，否则切视图不会 `dispose`。

## 已知坑

| 坑 | 说明 |
|---|---|
| `file://` 下 localStorage | 与 `http://localhost` 的数据不通，调试时别困惑 |
| 中文输入法 | 搜索框只重绘列表容器；新增输入框时别用整页重绘 |
| localStorage 5 MB | 错题存图片会爆，所以错题本是纯文本的 |
| `innerHTML` 重绘 | 列表超过几千条会卡，需要分页或虚拟滚动 |
