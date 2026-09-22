# Attendance Handler v0.1.0

保留可见、可操作 iClicker Chrome 窗口的 macOS 课堂助手。

## 下载与安装

1. 下载下方的 **Attendance-Handler-0.1.0-mac-universal.dmg**，不要选择 GitHub 自动生成的 Source code。
2. 打开 DMG，把 **Attendance Handler** 拖到 **Applications**。
3. 需要 macOS 13 或更新版本，支持 Apple Silicon 与 Intel。请先把 Google Chrome 安装到 `/Applications`，不需要 Node.js。
4. 首次启动时完成 iClicker 登录、学校验证和通知授权。安装包不含账号、课程或位置。

同时提供 ZIP 备用包，`SHA256SUMS.txt` 提供文件校验值。

## 签名状态

此版本使用 ad-hoc 签名，**尚未经过 Apple 公证**。macOS 可能要求首次手动允许。确认来源可信后，在 **系统设置 → 隐私与安全性** 中允许打开。不要全局关闭 macOS 安全保护，也不要绕过“App 已损坏”或恶意软件警告。

未来配置 Developer ID 和 Apple 公证后，可以去掉首次启动提示。本安装包不含安装脚本，也不会修改系统安全设置。

## 包含功能

- 本地课程配置、每 5 秒检查和同时运行一门课。
- 可见的独立 Chrome 窗口，最小化后继续监控。
- 对识别出的实时单选题自动选择 A，并确认题目回执。
- 题目开放且未完成时立即提醒，每 30 秒重复提醒。
- 菜单栏运行、防闲置睡眠，到时清除位置覆盖。
- 加密保存登录会话，不保存密码。

## 验证与限制

仓库包含 22 项单元测试和 15 项本地模拟课堂集成检查。已在 Apple Silicon 上验证打包 App、系统通知、DMG 结构、通用架构和公开数据扫描。通用包中的 Intel 部分为交叉编译，尚未在实体 Intel Mac 上验证。

真实 iClicker 签到和答题回执仍需在课堂中完成最终验收。网站结构变化可能影响识别。首次真实使用请保留人工确认，不要把这个预览版本作为唯一签到保障。

[English](https://github.com/tzuo5/attendance-handler/blob/main/docs/RELEASE-v0.1.0.md) · [隐私边界](https://github.com/tzuo5/attendance-handler/blob/main/PRIVACY.md) · [项目首页](https://github.com/tzuo5/attendance-handler/blob/main/README.md)
