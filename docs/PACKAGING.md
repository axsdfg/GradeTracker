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
# 1) 换页 + 补丁清单，输出未签名包（版本号可显式指定）
python tools/apk_repack.py 原包.apk app/index.html unsigned.apk \
       --version-code 6 --version-name 2.2

# 2) 重新签名（需要 JDK 17 + apksig.jar；keystore 必须是 PKCS12）
java -cp apksig.jar tools/SignApk.java sign release.p12 <pass> <alias> unsigned.apk signed.apk 21

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
| `versionCode` | 缺省 +1，可用 `--version-code` 指定 | 覆盖安装的必要条件 |
| `versionName` | 用 `--version-name` 指定（**等长**） | 只做同长度替换，见下文 |

`versionName` 约束：AXML 字符串池是"偏移表 + 数据区"，改变单个字符串长度就要重算所有偏移。脚本选择**只在长度相同时**原位替换（`2.1` → `2.2`），长度不同就跳过并记日志，不冒险重建池。不传 `--version-name` 时保持原值。

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

`SignApk.java` 同时签 v1（JAR）+ v2（APK Signing Block）+ v3（密钥轮换支持）。校验输出应类似：

```
verified = true
v1 = true   v2 = true   v3 = true
cert subject = CN=YourName, O=...
```

---

## 6.1 换成你自己的正式密钥重建

### 三个容易踩的坑（均已实测）

| 限制 | 硬限制？ | 说明 |
|---|---|---|
| **库口令必须等于密钥口令** | 是 | 代码用同一个 `storePass` 去取私钥（`ks.getKey(alias, storePass)`）。两者不同会抛 `UnrecoverableKeyException: Cannot recover key` |
| 口令至少 6 位 | 是（`keytool` 层） | 少于 6 位 `keytool` 直接拒绝生成，且不报错到明显处，容易误判为"库没生成" |
| 密钥库格式 | **否** | PKCS12 与 JKS 实际都能读：JDK 默认 `keystore.type.compat=true`，`KeyStore.getInstance("PKCS12")` 也能打开 JKS。但仍建议 PKCS12——JKS 是专有格式，`keytool` 每次都会警告要你迁移 |

从 JDK 9 起 `keytool` 默认生成 PKCS12，照下面的命令写就不用管格式问题。

### 第 1 步：生成密钥库

```bash
# 只做一次。生成后立刻备份到两处以上（U 盘 + 密码管理器）
keytool -genkeypair -v \
        -keystore gradetracker-release.p12 \
        -storetype PKCS12 \
        -alias gradetracker \
        -keyalg RSA -keysize 4096 -validity 10000 \
        -dname "CN=你的名字, O=你的组织, C=CN"
```

- `-validity 10000` 约 27 年。Google Play 要求至少到 2033 年，自己分发也建议够长。
- 两个口令（库口令、密钥口令）**填同一个**，见上表。
- 口令别写进任何脚本或 `.gitignore` 之外的文本文件；Shell 里用环境变量传。

### 第 2 步：重打包并递增版本号

```bash
python tools/apk_repack.py 原包.apk app/index.html unsigned.apk \
       --version-code 6 --version-name 2.2
```

- `--version-code` 缺省为「当前值 + 1」，显式指定时必须**大于**当前值，否则脚本直接退出。
- `--version-name` 必须与原值**等长**（`2.1` → `2.2` 可以，`2.1` → `2.10` 不行）。长度不同脚本会跳过并记日志，因为 AXML 字符串池要重建，风险大于收益。
- 从旧包升级时以**最近一次发布的包**为 `原包.apk`，而不是最初那个 1.3，这样 `classes.dex`、资源、图标都保持原样。

### 第 3 步：签名

```bash
export KS_PASS='你的口令'
java -cp apksig.jar tools/SignApk.java sign \
     gradetracker-release.p12 "$KS_PASS" gradetracker \
     unsigned.apk GradeTracker_v2.2.0.apk 21
```

最后一个参数是最低 SDK（21），影响 v1 签名的摘要算法选择，对本项目保持 21 即可。

### 第 4 步：核对证书指纹

```bash
keytool -printcert -jarfile GradeTracker_v2.2.0.apk | grep SHA256
```

输出必须是你自己证书的指纹，而不再是 `52:81:39:28:…:B8`（那是调试证书 `CN=Android Debug`）。

### 从调试签名迁移到正式签名

这是一次性的断层，**不能覆盖安装**。老用户（包括你自己）按这个顺序操作，数据不会丢：

1. 打开应用 → 设置 → 数据 → **导出 JSON**，把文件存到手机存储或发给自己；
2. 卸载旧版（调试签名那个）；
3. 安装正式签名的新包；
4. 设置 → 数据 → **导入 JSON**，选刚才那个文件。

导出的格式是完整快照（学期、考试、科目配置、错题本全在内），导入后和原来一致。CSV 只含成绩表，不含错题和设置，迁移请用 JSON。

### 一个必须记住的事实

正式密钥丢了，**这个应用就再也无法升级**——已装的用户只能卸载重装，数据同样要手动导出导入。所以第 1 步生成的 `.p12` 文件：

- 备份至少两份，其中一份离线（U 盘）；
- 口令单独记在密码管理器里，不要和文件放一起；
- **永远不要**提交到仓库，`.gitignore` 已包含 `*.p12` / `*.jks` / `*.keystore`。

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
