# test/ —— 无浏览器回归测试

这个项目原开发环境没有可用的浏览器内核（也没有 Android 真机），所以测试方案是：**用最小 DOM 桩把整个应用跑在 Node 里**。

| 文件 | 内容 |
|---|---|
| `harness.js` | DOM 桩 + 34 步回归 |
| `migrate_test.js` | v1 → v2 数据迁移，18 项断言 |

```bash
node test/harness.js            # 跑一遍，最后打印「错误汇总」
node test/harness.js --dump     # 额外输出状态与渲染结果摘要，便于人工核对
node test/migrate_test.js       # 迁移断言
```

## harness.js 怎么工作

1. 读 `app/index.html`，用正则抽出所有**内联** `<script>` 块（`<script src=...>` 会被跳过）；
2. 拼成一段代码，追加一个 `__t` 导出对象（暴露 `state`、`exams()` 等内部结构）；
3. 用 `vm` 在沙箱里执行，全局注入桩对象：`document`、`window`、`localStorage`、`canvas`、`requestAnimationFrame` 等；
4. 逐个执行 `step('名字', fn)`，把抛出的异常收进 `errors`；
5. 最后打印「✓ 名字」或「✗ 名字 + 错误」，以及错误汇总。

`step` 覆盖的路径：

```
renderHome → renderExams → analysis(trend/strength/rank) → 位次换算 → 错题 → 设置
→ 弹层（考试/详情/学期/数据/错题）→ 分享卡 → 导入导出 → 三种计分模式
→ 深色模式 → 家长视图 → 保存考试 → 返回键
```

## 能抓到什么

- 函数名拼错、变量未定义、`null` 属性访问；
- 渲染函数对空数据/异常数据崩溃；
- 模板字符串里用到不存在的 `state` 字段；
- 导入导出、迁移等纯逻辑回归。

## 抓不到什么

- **真实渲染**：布局、样式、溢出、层级（DOM 桩的 `innerHTML` 只是存字符串）；
- **触摸手势**：滑动、长按、滚轮选择器；
- **Canvas 像素**：分享图的 `getContext` 全是 noop；
- **ECharts 行为**：`typeof echarts === 'undefined'` 时走的是降级分支。

要覆盖这些，需要 Playwright 或真机，见 [docs/ROADMAP.md](../docs/ROADMAP.md) 第 3 项。

## 新增一个步骤

```js
step('我的新功能', () => {
  ctx.switchView('home');            // ctx 是沙箱全局对象
  ctx.__t.setTab('rank');            // 通过 __t 访问内部状态
  ctx.recalcRank();
});
```

需要新的内部访问器时，在 `harness.js` 顶部的 `__t` 对象里加一行。别把桩写得太复杂——桩越像浏览器，测试就越容易和实现细节绑死。
