# 参与贡献

感谢你愿意花时间。这个项目很小，规则也简单。

---

## 最快的参与方式

1. **真机反馈**：装上跑一遍，报告在哪台机器、哪个页面出了什么问题（附机型 / Android 版本 / WebView 版本）。这是目前最有价值的贡献——开发环境没有真机。
2. **数据格式**：如果你所在省份的一分一段表导出格式和 [README](README.md#一分一段数据json) 里的不一样，贴一段样例（脱敏）来。
3. **赋分规则**：你所在省份的等级赋分规则（等级数、比例、赋分区间）。这是 [ROADMAP](docs/ROADMAP.md) 里的第一项。

---

## 开发环境

```bash
git clone https://github.com/axsdfg/GradeTracker.git
cd GradeTracker
node scripts/fetch-vendor.js      # 拉 ECharts 到 app/echarts.min.js
node test/harness.js              # 34 步回归
node test/migrate_test.js         # 迁移断言
```

改完 `app/index.html` 后直接刷新浏览器即可看到效果，**没有构建步骤**。

需要 Node 18+（脚本用了内置 `fetch`）。没有 npm 依赖，不需要 `npm install`。

---

## 提交前请确认

- [ ] `node test/harness.js` 无错误输出
- [ ] `node test/migrate_test.js` 失败项为 0
- [ ] 新增的渲染代码里，用户输入都过了 `esc()`
- [ ] 没有引入 `http://` 明文地址、外链脚本、`XMLHttpRequest`/`WebSocket`（CI 会拦）
- [ ] `fetch(` 仍然只有一处（`checkScoreDataUpdate`）
- [ ] 没有提交 keystore、APK、`apksig.jar`（`.gitignore` 已覆盖）

---

## 代码约定

沿用一个文件里的既有风格，别引入新范式：

| 项 | 约定 |
|---|---|
| 缩进 | 2 空格 |
| 引号 | 单引号（HTML 属性里用双引号） |
| 命名 | `renderXxx` 渲染、`openXxx` 打开弹层、`saveXxx` 写入、`calc/xxxOf` 纯计算 |
| 字符串拼接 | 模板字符串拼 HTML，不用 DOM API 逐个 `createElement` |
| 注释 | 中文，写"为什么"不写"做了什么" |
| 状态修改 | 改完 `state` 必须 `saveState()`，再 `renderXxx()` |

**不要**：引入框架、引入构建工具（除非按 [ROADMAP](docs/ROADMAP.md) 第 2 项那样只加拼接脚本）、引入 npm 运行时依赖。

---

## 提交信息

```
<类型>: <一句话说明>

类型：feat / fix / docs / refactor / test / chore
例：fix: 搜索框输入不再整页重绘，避免打断中文输入法
```

---

## Pull Request

- 一个 PR 做一件事。顺手重构请单独提。
- 说明**为什么**改，而不只是改了什么。
- 涉及界面变化请附截图或短视频（真机最佳）。
- 涉及数据结构的改动，必须同时更新 `test/migrate_test.js` 的断言。

---

## Issue

请包含：

- 复现步骤（能稳定复现最好）
- 期望行为 vs 实际行为
- 机型 / Android 版本 / WebView 版本（设置页底部有 WebView 版本，或 `chrome://version`）
- 是否用了原生桥（即是否改过 `MainActivity`）

> 报告 bug 时**不要**贴真实成绩数据。用示例数据或自己编的数字。

---

## 许可

提交 PR 即表示你同意以 [MIT 许可证](LICENSE) 授权你的贡献。
