# APK 打包与签名详解

> 场景：你手上**只有一个 APK**（没有 Gradle 工程、没有源码），想换掉里面的前端页面并重新签出一个能装的包。
> 这不是常规做法。正规做法永远是「有工程 → `./gradlew assembleRelease`」。本文适用于"没有工程"的补救场景。

---

## 1. 为什么不用 Gradle

重新构建需要：完整工程、匹配的 AGP/Gradle/JDK、依赖能下载。如果你的目的只是"换一个 `assets/index.html`"，这些成本都是多余的。

`tools/apk_repack.py` 直接操作 ZIP 字节：

```
原 APK ──┬─ 保留 395 个条目（字节级不变，CRC 不变）
         └─ 替换 assets/index.html + 补丁 AndroidManifest.xml
              ↓
         未签名 APK ── apksig（v1+v2+v3）── 已签名 APK
```

**风险与前提**：原包的结构不能有超出预期的特殊之处（例如 APK Signing Block 之外的非常规数据）。脚本已处理 v2/v3 签名块剥离，但那意味着**必须重新签名**，不能只改内容。

---

## 2. 三步流程

```bash
# 1) 换页 + 补丁清单，输出未签名包
python tools/apk_repack.py 原包.apk app/index.html unsigned.apk

# 2) 重新签名（需要 JDK 17 + apksig.jar）
java -cp apksig.jar tools/SignApk.java sign my.jks <storepass> <alias> unsigned.apk signed.apk 21

# 3) 校验
java -cp apksig.jar tools/SignApk.java verify signed.apk
```

`SignApk.java` 是单文件、无第三方依赖（只需 `apksig.jar` 在 classpath），用 JDK 17 的单文件源码模式直接运行，不需要先 `javac`。

**获取 `apksig.jar`**（约 500 KB，不进仓库）：

```bash
# Maven Central
curl -LO https://repo1.maven.org/maven2/com/android/tools/build/apksig/8.6.1/apksig-8.6.1.jar
mv apksig-8.6.1.jar apksig.jar
```

---

## 3. 清单补丁做了什么

`patch_manifest()` 对二进制 `AndroidManifest.xml`（AXML）做**原位**修改，因此包内其余偏移全部保持不变：

| 属性 | 改为 | 原因 |
|---|---|---|
| `android:debuggable` | `false` | 否则 `adb shell run-as <包名>` 可直读私有数据，WebView 还能被 `chrome://inspect` 调试 |
| `android:allowBackup` | `false` | 否则 `adb backup` 可把整个 localStorage 明文导走 |
| `android:usesCleartextTraffic` | `false` | 只允许 HTTPS |
| `versionCode` | +1 | 覆盖安装的必要条件 |
| `versionName` | 从旧值改为新值（**等长**） | 只做同长度替换，见下文 |

`versionName` 约束：AXML 字符串池是"偏移表 + 数据区"，改变单个字符串长度就要重算所有偏移。脚本选择**只在长度相同时**原位替换（`1.3` → `2.0`），长度不同就跳过并记日志，不冒险重建池。

---

## 4. 新增 `<uses-permission>`

要让"一分一段在线更新"真正可用，得往清单里加 `INTERNET`。这一步必须**插入节点 + 重建字符串池**：

1. 在字符串池**尾部追加** `android.permission.INTERNET`（既有字符串索引全部不变）；
2. 重建池块：UTF-16、28 字节头、`styles = 0`；
3. 在 `<application>` 之前插入 `START_ELEMENT` + `END_ELEMENT`；
4. 修正根 chunk 的 `size`。

`--no-net` 参数可跳过这一步，回到零权限状态。

> **加权限的代价**：`INTERNET` 是应用级权限，一旦加上，WebView 里任何脚本都能联网。原来的"数据物理上出不去"降级为"代码自觉"。详见 [PRIVACY.md](PRIVACY.md)。

---

## 5. 三个必须知道的坑

### 5.1 属性起始偏移

AXML 元素头是 `8 字节 chunk header + 4 line + 4 comment + 4 ns + 4 name`，然后是 `attributeStart(2) + attributeSize(2) + attributeCount(2)`。

属性区起始位置是 **`pos + 16 + attributeStart`**，不是 `pos + 24`。写成 24 会读到错误的属性，表现为"改了但没生效"，且不报错。

### 5.2 2 字节的非法零填充

部分 APK 生成工具会在属性后面写 2 字节的 `00 00` 填充，不符合 AXML 规范（属性区应严格按 `attributeSize` 步进）。解析时遇到必须**丢弃**，否则后续所有属性解析错位。

### 5.3 ZIP 对齐用的是绝对偏移

`zipalign` 要求 stored（`method = 0`）条目的**数据区在文件中的绝对偏移**是 4 的倍数。计算方式：

```
absolute = len(输出缓冲) + 30 (LFH 固定长度) + nlen (文件名长度) + elen (extra 长度)
```

不是条目内的相对偏移。`resources.arsc` 必须是 stored 且对齐，否则 Android 12+ 安装会失败。

---

## 6. 签名与升级

覆盖安装要求三件事同时成立：

| 条件 | 检查方法 |
|---|---|
| 包名一致 | `aapt2 dump badging x.apk \| grep package` |
| `versionCode` 不低于已装版本 | 同上 |
| **签名证书完全一致** | `keytool -printcert -jarfile x.apk` 比对 SHA-256 |

第三条是关键。换密钥签的包无法覆盖安装，用户必须先卸载——**数据全丢**（`localStorage` 在应用私有目录里）。

所以：**第一次发布就要用正式密钥，并永久保存**。丢了就再也无法升级已发布的包。

```bash
keytool -genkeypair -v -keystore gradetracker.jks -alias gradetracker \
        -keyalg RSA -keysize 4096 -validity 10000
```

`SignApk.java` 同时签 v1（JAR）+ v2（APK Signing Block）+ v3（密钥轮换支持）。校验输出应类似：

```
verified = true
v1 = true   v2 = true   v3 = true
cert subject = CN=YourName, O=...
```

---

## 7. 验证清单

打包完成后逐条确认：

```bash
# 1) 条目数与 CRC
python -c "import zipfile;z=zipfile.ZipFile('signed.apk');print(len(z.namelist()), z.testzip())"

# 2) stored 条目对齐
python - <<'PY'
import struct
from tools.apk_repack import parse_apk
# 遍历 LFH，检查 method==0 的 data offset % 4 == 0
PY

# 3) 包内页面与源码一致
python -c "import zipfile;print(zipfile.ZipFile('signed.apk').read('assets/index.html')==open('app/index.html','rb').read())"

# 4) 清单实际值
# debuggable=false, allowBackup=false, usesCleartextTraffic=false, versionCode 已 +1
```

- [ ] `apksigner verify` v2、v3 均通过
- [ ] `aapt2 dump badging` 里**没有** `application-debuggable`
- [ ] `resources.arsc` 是 stored 且 4 字节对齐
- [ ] 覆盖安装后旧数据仍在（同签名前提下）
- [ ] 断网状态下除"数据源自动更新"外全部可用

---

## 8. 附录：工具文件

| 文件 | 用途 |
|---|---|
| `tools/apk_repack.py` | ZIP 重打包 + AXML 补丁（`Axml` 类可单独用于读取清单） |
| `tools/axml.py` | 独立 AXML 解析器，输出 XML 文本，便于肉眼核对 |
| `tools/SignApk.java` | apksig 封装：`sign` / `verify` 两个子命令 |
| `tools/dexinfo.py` | DEX 类/方法清单 |
| `tools/disasm.py` | 简易 Dalvik 反汇编（常量、方法体） |

`docs/apk-analysis-report.html` 是一次真实 APK 的静态分析报告，演示了上面这些工具能产出什么。
