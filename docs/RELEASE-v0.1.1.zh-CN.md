# Attendance Handler v0.1.1 — 修复专用 Chrome 无法退出

此修复版解决关闭最后一个专用 Chrome 窗口后浏览器进程仍留在后台的问题。退出 Attendance Handler 时也会关闭它的专用 Chrome，不影响其他 Chrome 资料目录。

## 下载

| 系统 | 推荐下载 | 备用下载 |
| --- | --- | --- |
| Windows 10/11 x64 | [Windows 安装包（EXE）](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-win-x64-Setup.exe) | [免安装 ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-win-x64.zip) |
| macOS 13+，Apple Silicon / Intel | [通用 DMG](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-mac-universal.dmg) | [通用 ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-mac-universal.zip) |

[全部下载的 SHA-256 校验值](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/SHA256SUMS.txt)。请下载程序包，不要选择 GitHub 自动生成的源码压缩包。

## 修复内容

- 关闭专用 Chrome 的最后一个标签页或窗口后，该 Chrome 进程会退出；还有其他标签页时不会误关。
- 点击 **登录** 或 **查看课堂** 可按需重开。关闭课堂窗口后监控暂停，主动重开后恢复。
- 退出 Attendance Handler 会关闭专用 Chrome；只关闭 App 窗口时仍在 macOS 菜单栏或 Windows 系统托盘继续运行。

现有签到、答题、通知和加密会话逻辑未改动。从 v0.1.0 升级会保留本机课程设置和 Chrome 资料目录。

## 安装与验证

先安装 Google Chrome，macOS 上需位于 `/Applications`。macOS 用户打开 DMG，将新版本替换 Applications 中的旧版；Windows 用户运行安装包，免安装 ZIP 需完整解压。

修复已通过 22 项单元测试、15 项模拟课堂集成检查、专用 Chrome 进程生命周期测试及打包后的 macOS App 检查。Windows 发布工作流会在附加 Windows 文件前构建并检查安装包、Chrome 集成和打包 App。测试使用本机模拟课堂，真实 iClicker 回执仍待验证。

Windows 安装包未签名；macOS 使用 ad-hoc 签名，尚未经过 Apple 公证，首次打开可能需要在“系统设置 → 隐私与安全性”允许。实体 Windows 和 Intel Mac 验证仍待完成。

[English](https://github.com/tzuo5/attendance-handler/blob/main/docs/RELEASE-v0.1.1.md) · [隐私边界](https://github.com/tzuo5/attendance-handler/blob/main/PRIVACY.md)
