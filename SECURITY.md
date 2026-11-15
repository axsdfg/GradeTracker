# 安全策略

## 报告安全问题

如果你发现了安全问题，**请通过 GitHub 的私密漏洞报告**（Security → Report a vulnerability）提交，不要开公开 issue。

也可以直接发邮件给仓库维护者（见 GitHub 个人主页）。请在报告中包含：

- 受影响的文件与行号
- 复现步骤
- 影响范围（例如"可以让页面执行任意脚本"或"可以让数据外发"）
- 你建议的修复方式（如果有）

一般情况下 7 天内会给第一次回复。

## 支持范围

| 版本 | 是否接受安全更新 |
|---|---|
| 2.x | ✅ |
| 1.x | ❌（未开源，且已知存在 debug 签名等问题） |

## 有意为之的设计（不算漏洞）

以下几项是明确的取舍，不是缺陷，报告前请先看 [docs/PRIVACY.md](docs/PRIVACY.md)：

| 现象 | 说明 |
|---|---|
| `localStorage` 明文存储 | 本地单机工具，加密会引入口令丢失风险。见 ROADMAP「数据加密」 |
| `INTERNET` 权限（重打包默认开启） | 为了"一分一段在线更新"，可用 `--no-net` 关闭 |
| 示例数据是合成的 | 界面已强制标注「不可用于真实填报」 |
| 无 CSP `meta` 标签 | 单文件应用，所有脚本内联；如需要可在原生侧 `WebView` 配置 CSP |
| 赋分是线性近似 | 已知限制，见 ROADMAP 第 1 项 |

## 如果你要自己构建发布

- 用**正式密钥**签名，不要用 debug key；
- 保持 `debuggable=false`、`allowBackup=false`、`usesCleartextTraffic=false`；
- 不要提交 keystore 与口令；
- 如果你不打算用在线更新，用 `--no-net` 打包，保住零权限。

## 供应链

本仓库的运行时依赖只有一个：**ECharts**（Apache-2.0），通过 `scripts/fetch-vendor.js` 从 jsDelivr / unpkg 下载，不随仓库分发。
构建工具链用到 **apksig**（Google 官方，Apache-2.0），从 Maven Central 获取。

建议核对下载文件的哈希，或使用 `npm pack echarts@5.6.0` 从 npm registry 获取。
