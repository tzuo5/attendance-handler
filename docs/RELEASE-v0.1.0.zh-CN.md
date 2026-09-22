# Attendance Handler v0.1.0 — macOS + Windows

面向 iClicker 的本地优先课堂助手，两个系统统一使用 v0.1.0，保留可见的专用 Chrome 课堂窗口。

## 下载

| 系统 | 推荐下载 | 备用下载 |
| --- | --- | --- |
| Windows 10/11 x64 | [Windows 安装包（EXE）](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-win-x64-Setup.exe) | [免安装 ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-win-x64.zip) |
| macOS 13+，Apple Silicon / Intel | [通用 DMG](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.dmg) | [通用 ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.zip) |

[全部下载的 SHA-256 校验值](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/SHA256SUMS.txt)。请下载上表中的程序包，不要选择 GitHub 自动生成的源码压缩包。

## 安装

- **Windows：**运行安装包，从开始菜单启动。免安装版需要完整解压后运行 `Attendance Handler.exe`；系统通知建议使用安装版，以完成开始菜单注册。
- **macOS：**打开 DMG，将 Attendance Handler 拖入 Applications 后启动。
- 两个系统都需要预先安装 Google Chrome，macOS 上需安装在 `/Applications`，不需要 Node.js。在专用 Chrome 窗口完成登录及学校验证后配置课程。

关闭 App 窗口后继续在 macOS 菜单栏或 Windows 系统托盘运行，可通过菜单退出；Windows 支持双击托盘图标重新打开 App。

## 功能与版本

- 本地课程配置、每 5 秒检查、截止停止、防止闲置睡眠。
- 签到确认、符合条件的单选题自动 A、手动作答提醒。
- 专用 Chrome 资料目录、最小化监控和用户主动触发的课堂窗口恢复。
- 通过 Electron safeStorage 加密登录会话，使用 macOS 钥匙串或 Windows DPAPI；App 不保存密码。
- 两个系统的程序版本、界面显示和下载文件名统一为 **v0.1.0**。

## 验证范围与限制

Windows 工作流运行 22 项单元测试、15 项模拟课堂检查，安装最终 EXE 并检查课程保存、Chrome 连接、原生辅助程序、模拟签到、系统加密和正常退出，同时完成安装包隐私审计及 ZIP 内容核对。自动化环境为 Windows Server 2022 x64，实体 Windows 10/11 验收仍待完成。

macOS 通用包包含 Apple Silicon 与 Intel 架构，运行检查在 Apple Silicon 上进行，实体 Intel 验证仍待完成。两个系统均检查程序内版本号及公开数据边界。

Windows 包尚未代码签名，可能显示“未知发布者”或 SmartScreen 提示；macOS 使用 ad-hoc 签名，尚未经过 Apple 公证，首次运行可能需要在“系统设置 → 隐私与安全性”允许打开。通知声音、点击恢复、睡眠唤醒及真实 iClicker 课堂回执仍需交互式验证，请在真实课堂中确认签到和提交结果。

[English](https://github.com/tzuo5/attendance-handler/blob/main/docs/RELEASE-v0.1.0.md) · [隐私边界](https://github.com/tzuo5/attendance-handler/blob/main/PRIVACY.md) · [验证记录](https://github.com/tzuo5/attendance-handler/blob/main/VERIFICATION.md)
