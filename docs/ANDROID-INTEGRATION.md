# Android 集成指南

> 目标读者：手上有 Android 工程（或有能力建一个），想把 `app/index.html` 接进去并补齐原生能力。
> 如果你只想改一个已有 APK，看 [PACKAGING.md](PACKAGING.md)。

---

## 1. 放资源

```
app/src/main/assets/
├── index.html          ← 用本仓库 app/index.html
└── echarts.min.js      ← node scripts/fetch-vendor.js 生成，或 ECharts 定制构建
```

体积参考：`echarts.min.js` 全量包 1.0 MB，实际只用到 `line / bar / radar / tooltip`。官方在线定制构建可压到约 300 KB，冷启动渲染大约快一倍。

---

## 2. 清单改动

```xml
<uses-permission android:name="android.permission.INTERNET" />

<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
                 android:maxSdkVersion="28" />

<application
    android:allowBackup="false"
    android:fullBackupContent="false"
    android:dataExtractionRules="@xml/data_extraction_rules"
    android:usesCleartextTraffic="false"
    android:networkSecurityConfig="@xml/network_security_config"
    android:hardwareAccelerated="true"
    ... >
```

| 项 | 建议值 | 为什么 |
|---|---|---|
| `allowBackup` | `false` | localStorage 是明文，允许备份等于允许导出成绩库 |
| `debuggable` | 不写（release 默认 `false`） | 否则 `adb shell run-as` 可直读数据 |
| `usesCleartextTraffic` | `false` | 只允许 HTTPS |
| `INTERNET` | **可选项**，见下 | 加了才能用「数据源在线更新」 |

`res/xml/network_security_config.xml`（仓库内已提供）：

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">your-data-host.example.com</domain>
    </domain-config>
</network-security-config>
```

> `INTERNET` 是**应用级**权限：一旦加上，WebView 里任何脚本都能联网，"数据出不去"从系统级保证降级为代码约定。
> 建议先用导入模式发版，确有用户抱怨再开。

---

## 3. MainActivity

参考实现见 [`android/MainActivity.java`](../android/MainActivity.java)，相比"三行 `loadUrl("file://...")`"补齐了：

| 能力 | 对应前端功能 |
|---|---|
| `WebViewAssetLoader`（`https://appassets.androidplatform.net`）替代 `file://` | localStorage 更稳定（`file://` 的 origin 在不同 WebView 版本下行为不一致），安全配置可收紧 |
| `onShowFileChooser` | 「导入备份」「导入分数线数据」真正能选文件 |
| `DownloadListener` | 兼容页面里的 `<a download>` |
| JS 桥 `AndroidBridge.saveImage` | 成绩单卡片存相册 |
| JS 桥 `AndroidBridge.saveFile` | 导出 JSON / CSV 到下载目录 |
| JS 桥 `AndroidBridge.notify` | 考试提醒本地通知 |
| JS 桥 `AndroidBridge.writeBackup` | 每日快照落盘到 `files/backups/`（保留 5 份） |
| `OnBackPressedDispatcher` + `evaluateJavascript("appHandleBack()")` | 返回键先关弹层、再回首页、最后退出 |

桥的注册方式：

```java
webView.addJavascriptInterface(new Bridge(this), "AndroidBridge");
webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
```

前端全部按"桥不存在就降级"写，所以**不接这些也不会崩**：

- 没有 `saveImage` → 保存图片退回 `<a download>`，并提示长按保存；
- 没有 `saveFile` → 导出时弹可全选复制的文本框；
- 没有 `notify` → 只在首页显示提醒条；
- 没有返回键桥 → 系统默认行为（直接退出）。

---

## 4. 正式签名

调试密钥（`CN=Android Debug`）签出来的包：无身份背书、不能上架、换正式签名后**无法覆盖安装**（用户必须先卸载，数据全丢）。

```bash
keytool -genkeypair -v -keystore gradetracker.jks -alias gradetracker \
        -keyalg RSA -keysize 4096 -validity 10000
```

```gradle
android {
    signingConfigs {
        release {
            storeFile file("../keystore/gradetracker.jks")
            storePassword System.getenv("GT_STORE_PASS")
            keyAlias "gradetracker"
            keyPassword System.getenv("GT_KEY_PASS")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
        }
    }
}
```

口令走环境变量，**不要写进 `build.gradle`**，更不要提交 keystore。

```bash
./gradlew clean assembleRelease
apksigner verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
# 期望：Verified using v2 scheme: true / v3 scheme: true / CN=你的名字
```

---

## 5. 验证清单

- [ ] `apksigner verify` 显示 v2、v3 均通过，证书不是 `CN=Android Debug`
- [ ] `aapt2 dump badging` 里没有 `application-debuggable`
- [ ] 设置页「导出备份」能落地成文件（或弹文本框）
- [ ] 「导入备份」能选到文件（`onShowFileChooser` 生效）
- [ ] 成绩单卡片保存后能在相册看到
- [ ] 详情页按返回键回到列表而不是退出
- [ ] 断网状态下所有功能仍可用（除「数据源自动更新」）
- [ ] 覆盖安装后旧数据仍在（同签名前提下）

---

## 6. 需要注意的 WebView 差异

| 问题 | 表现 | 处理 |
|---|---|---|
| `file://` 下 localStorage 不稳定 | 部分机型数据"存了但下次打开没了" | 用 `WebViewAssetLoader` |
| `<a download>` 无响应 | 导出点了没反应 | `DownloadListener` + 前端弹文本框兜底 |
| `input type=file` 无响应 | 选择文件没反应 | `onShowFileChooser` |
| 深色模式 | 页面自己的主题与系统状态栏不一致 | 页面用 `data-theme` 自管，原生侧同步设置状态栏颜色 |
| `async/await` | 老机器白屏 | WebView 55+（约 Android 7.0+），低版本需要降低语法 |
