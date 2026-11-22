# tools/ —— APK 分析与重打包工具链

全部脚本**无第三方 Python 依赖**（只用标准库），Java 部分只需 `apksig.jar`。这样做的原因很实际：分析现场往往没有 pip 可用、装 androguard 会超时。

| 文件 | 语言 | 作用 |
|---|---|---|
| `apk_repack.py` | Python 3 | 重打包：替换 assets、字节级补丁 AXML、ZIP 重对齐 |
| `axml.py` | Python 3 | 二进制 `AndroidManifest.xml` 解析，输出可读 XML |
| `dexinfo.py` | Python 3 | DEX 里的类与方法清单 |
| `disasm.py` | Python 3 | 简易 Dalvik 反汇编（常量、方法体） |
| `SignApk.java` | Java 17 | apksig 的 `sign` / `verify` 封装，单文件可直接运行 |

---

## 1. 先看包里有什么

```bash
python tools/axml.py 目标.apk                 # 打印清单（权限、组件、SDK 版本）
python tools/dexinfo.py 目标.apk              # 类清单（哪些是第三方 SDK 一目了然）
python tools/disasm.py 目标.apk com.example.MainActivity   # 反汇编某个方法
```

`dexinfo.py` 的输出很适合做"有没有第三方 SDK"的判断：包名前缀集中在 `androidx.*` 通常是纯原生，出现 `com.umeng` / `com.tencent.stat` 之类就要注意。

## 2. 重打包

```bash
# 版本号缺省为「当前 +1」，也可显式指定
python tools/apk_repack.py 原包.apk app/index.html unsigned.apk \
       --version-code 6 --version-name 2.2
```

参数：

| 参数 | 作用 |
|---|---|
| `<原包.apk>` | 作为壳的 APK（必须有可用的 `assets/index.html`） |
| `<新页面.html>` | 要放进去的前端 |
| `<输出.apk>` | 未签名输出 |
| `--no-net` | **不**添加 `INTERNET` 权限（回到零权限） |
| `--version-code N` | 指定 `versionCode`；缺省为当前值 +1，小于等于当前值会直接退出 |
| `--version-name X.Y` | 指定 `versionName`；必须与原值等长，否则跳过并记日志 |

会做的事：

1. 替换 `assets/index.html`；
2. 补丁清单：`debuggable=false`、`allowBackup=false`、`usesCleartextTraffic=false`、`versionCode` 递增（缺省 +1，`--version-code` 可指定）、`versionName` 等长替换（`--version-name`，缺省不动）；
3. 默认插入 `<uses-permission android:name="android.permission.INTERNET"/>`（`--no-net` 跳过）；
4. stored 条目重做 4 字节对齐；
5. 剔除旧的 v1 签名文件（`META-INF/*.SF|*.RSA|*.MF`）。

其余条目**逐字节保留**，CRC 不变。

## 3. 签名与校验

```bash
# 取 apksig.jar（约 500 KB，不进仓库）
curl -LO https://repo1.maven.org/maven2/com/android/tools/build/apksig/8.6.1/apksig-8.6.1.jar
mv apksig-8.6.1.jar apksig.jar

# 签名：v1 + v2 + v3
java -cp apksig.jar tools/SignApk.java sign my.jks <storepass> <alias> unsigned.apk signed.apk 21

# 校验
java -cp apksig.jar tools/SignApk.java verify signed.apk
```

期望输出：

```
verified = true
v1 = true   v2 = true   v3 = true
```

## 4. 作为库用

`apk_repack.py` 里的两个类可以单独 import：

```python
from tools.apk_repack import Axml, parse_apk

ax = Axml(open('AndroidManifest.xml', 'rb').read())
print(ax.strings[:20])            # 字符串池
print([e['tag'] for e in ax.elems])  # 元素序列
ax.set_bool('application', 'debuggable', False)   # 原位改 bool
```

`axml.py` 是同一套解析逻辑的可读版（带输出），适合先看再用。

---

## 已知限制

- `replace_string()` 只支持**等长**替换（AXML 字符串池重建成本高、风险大）；
- 不支持修改 `<application>` 的 `android:name`（会改变启动类，需同步 dex）；
- 不支持 split APK（`.apks` / `.xapk`），只处理单个 base APK；
- `disasm.py` 是"够用就好"的实现，不保证所有指令都能解码。
