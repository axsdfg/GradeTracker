# android/ —— 原生壳参考实现

这里不是完整的 Android 工程，而是**把 `app/index.html` 接进 Android 需要的那部分代码**。放进你已有的工程即可，或者照着抄。

| 文件 | 说明 |
|---|---|
| `MainActivity.java` | WebView 宿主：AssetLoader、文件选择、下载、JS 桥、返回键 |
| `res/xml/network_security_config.xml` | 只允许 HTTPS |
| `res/xml/data_extraction_rules.xml` | Android 12+ 备份/迁移排除规则 |

完整说明见 [docs/ANDROID-INTEGRATION.md](../docs/ANDROID-INTEGRATION.md)。

## 核心结构

```
MainActivity
├── WebViewAssetLoader        → 用 https://appassets.androidplatform.net 替代 file://
├── WebChromeClient
│   └── onShowFileChooser()   → 让 <input type=file> 能用
├── DownloadListener          → 让 <a download> 能用
├── Bridge（@JavascriptInterface，名 "AndroidBridge"）
│   ├── saveImage(base64, name)   → 分享图存相册
│   ├── saveFile(name, mime, text) → 导出 JSON/CSV
│   ├── notify(title, body)        → 考试提醒
│   ├── writeBackup(json)          → 每日快照落盘，保留 5 份
│   └── exitApp()                  → appHandleBack 处理完之后才退出
└── OnBackPressedDispatcher   → evaluateJavascript("appHandleBack()")
```

## JS 桥的约定

前端调用一律先判存在：

```js
if (window.AndroidBridge && AndroidBridge.saveImage) { … } else { /* 降级 */ }
```

所以桥可以只实现一部分，不会导致崩溃。返回 `true` 表示"我处理了"，前端据此决定是否再走降级路径。

## 注意

- `addJavascriptInterface` 只在**加载完成前**注册才稳定；
- Android 7.0+ 才有 `WebViewAssetLoader`（`androidx.webkit`），更低的版本退回 `file://` 并接受 localStorage 的坑；
- `POST_NOTIFICATIONS` 在 Android 13+ 是运行时权限，`notify()` 前要检查并请求；
- 存相册在 Android 10+ 用 `MediaStore`，不要用 `WRITE_EXTERNAL_STORAGE`（仅 `maxSdkVersion=28` 有效）；
- 别在 `Bridge` 里暴露任何能读写任意文件的接口，WebView 里的 JS 一旦被注入就能调它。
