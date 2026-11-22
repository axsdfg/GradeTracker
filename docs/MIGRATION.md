# 从 v2.1.0 及更早版本升级到 v2.1.1

> English summary: v2.1.1 is signed with a new certificate, so it cannot be installed
> over an older build. Back up your data, uninstall the old version, install v2.1.1,
> then restore the backup. Uninstalling without a backup permanently deletes your data.

## 为什么不能直接升级

Android 只允许「同一个签名证书」的安装包覆盖升级。v2.1.1 起项目改用新的发布证书，
与 v2.1.0 及更早版本不是同一张证书，因此系统会拒绝覆盖安装，报「应用未安装」或
「签名不一致」。

这不是版本号问题，改版本号也无法绕过——只能卸载重装。

## 升级步骤（顺序不能颠倒）

1. **导出备份**
   打开旧版 → 设置 → 导出备份 → 把生成的备份文件保存到手机「下载」目录，或发给自己。
   这个文件包含全部成绩、科目设置与学期配置。
2. **卸载旧版**
   确认备份文件已经存好并且能打开，再卸载旧版。
3. **安装 v2.1.1**
   从 [Releases](https://github.com/axsdfg/GradeTracker/releases/latest) 下载
   `GradeTracker_v2.1.1.apk` 并安装。
4. **导入备份**
   打开新版 → 设置 → 导入备份 → 选中第 1 步导出的文件。

跳过第 1 步直接卸载，数据无法恢复。应用的所有数据都保存在设备本地，
没有云端副本，卸载即清除。

## 首次安装

以前没有装过任何版本，直接安装 v2.1.1 即可，不需要上面的步骤。

## 之后的版本

从 v2.1.1 起，后续版本都用同一张证书签名，可以正常覆盖升级，不再需要卸载重装。
