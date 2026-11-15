# 隐私与数据流

> 一句话：**默认配置下，这个应用没有任何联网能力。**

---

## 1. 数据存在哪

| 位置 | 内容 | 谁能读到 |
|---|---|---|
| WebView `localStorage`（`grade_tracker_v2`） | 全部成绩、错题、设置 | 应用自身；root 设备；有物理访问权并开了 USB 调试的人（若 `debuggable=true`） |
| `grade_tracker_bak_0/1/2` | 最近 3 天的整份快照 | 同上 |
| `grade_tracker_data` | v1 旧数据，迁移后**保留不删** | 同上 |
| `files/backups/`（需原生桥） | 最近 5 份整份快照 | 应用私有目录 |

格式全部是**明文 JSON**。没有加密——用加密就要处理密钥保管，对"本地单机工具"来说收益不抵复杂度。

---

## 2. 网络行为

### 2.1 默认：零网络

原 APK 的清单里**没有 `INTERNET` 权限**。Android 的权限模型是应用级的：没有这条权限，WebView 里任何代码都发不出请求，包括被替换掉的 `echarts.min.js`。

这不是"我们承诺不上传"，而是**操作系统保证发不出去**。

### 2.2 代码层面的唯一网络出口

```js
// checkScoreDataUpdate() 内，全文件唯一一处 fetch
const resp = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
```

触发条件（满足任一）：

1. 你在设置页填了数据源 URL，并点了「立即拉取」；
2. 你开启了「每 24 小时检查」，且距上次检查 > 24 小时，且你打开了应用。

没有埋点、没有崩溃上报、没有第三方 SDK、没有 `WebView` 远程调试钩子（release 包 `debuggable=false` 时 `chrome://inspect` 不可用）。

### 2.3 加上 `INTERNET` 之后

`tools/apk_repack.py` 默认会加这条权限（为了让在线更新可用），代价是：

| 之前 | 之后 |
|---|---|
| 数据物理上出不去 | 靠代码自觉不发送 |
| 可审计：`aapt2 dump permissions` 一看就懂 | 需读代码确认 `fetch` 只出现在一处 |

自己复核的方法：

```bash
# 1) 确认只有一处网络调用
grep -n "fetch(" app/index.html

# 2) 确认没有外链脚本
grep -n '<script src="http' app/index.html

# 3) 确认没有明文 HTTP
grep -n "http://" app/index.html
```

不加这条权限：

```bash
python tools/apk_repack.py 原包.apk app/index.html out.apk --no-net
```

---

## 3. 威胁模型

| 威胁 | 是否防护 | 说明 |
|---|---|---|
| 应用偷偷上传数据 | ✅（零权限时）/ ⚠️（有权限时靠审计） | 见上 |
| 第三方 SDK 收集 | ✅ | 没有任何第三方库，唯一依赖 ECharts 只做图表绘制 |
| `adb backup` 整包导出 | ✅ | `allowBackup=false` + `dataExtractionRules` |
| `adb shell run-as` 读私有目录 | ✅ | `debuggable=false` |
| 中间人窃听 | ✅ | `usesCleartextTraffic=false`，只允许 HTTPS |
| 设备被 root / 物理接触 | ❌ | localStorage 明文，root 后可读。**不要在里存身份证号等敏感信息** |
| 分享图泄漏 | ⚠️ | 分享图含成绩与排名，发出去就是发出去了，注意接收方 |

---

## 4. 数据删除

- 应用内「清空数据」会删主键与快照键；
- 卸载应用会删除整个私有目录（包括 `localStorage` 与 `files/backups/`）；
- 导出的 JSON/CSV 与分享图在公共目录，需自行删除。

---

## 5. 关于本仓库的示例数据

`app/index.html` 里的一分一段示例数据是**程序生成的合成数据**，不对应任何真实省份的分数分布，界面与结果均强制标注「示例数据 · 不可用于真实填报」。

`app/legacy/index.v1.original.html` 是上一版前端，仅用于对比与迁移参考，同样不含真实用户数据。仓库内**不含**任何真实成绩记录。
