# Attendance Handler v0.2.0 — Windows x64

首个 Windows 版本，支持 Windows 10/11 64 位。

## 下载与安装

- **Attendance-Handler-0.2.0-win-x64-Setup.exe**：推荐使用，为当前用户安装，并创建开始菜单和桌面快捷方式。
- **Attendance-Handler-0.2.0-win-x64.zip**：免安装版，完整解压后运行 `Attendance Handler.exe`。系统通知建议使用安装版，以完成开始菜单注册。
- **SHA256SUMS-windows.txt**：两份安装文件的 SHA-256 校验值。

需要预先安装 Google Chrome，不需要 Node.js。支持自动查找当前用户和系统级 Chrome。通过专用 Chrome 窗口完成登录后配置课程。关闭 App 窗口后继续在系统托盘运行，双击托盘图标可重新打开，右键菜单可退出。

## Windows 适配

- 原生 Chrome 启动与用户主动触发的课堂窗口恢复，不模拟鼠标键盘。
- 系统托盘、Windows 窗口控制与通知标识。
- 使用 Electron safeStorage / Windows DPAPI 加密登录会话。
- 保留签到、答题提醒、自动 A、最小化监控、截止停止和本地课程存储。
- GitHub Actions 自动构建、测试、安装验证、隐私扫描及校验值生成。

## 验证范围与限制

在 GitHub 托管的 Windows Server 2022 x64 环境运行 22 项单元测试、15 项模拟课堂集成检查，再执行静默安装，检查已安装 App 的课程保存、Chrome 连接、原生辅助程序、模拟签到与系统加密会话。ZIP 内的应用归档与通过审计的构建逐一核对。这些自动化检查不等同于实体 Windows 10/11 验收。

Windows 包尚未代码签名，可能出现“未知发布者”或 SmartScreen 提示。通知实际显示、声音、点击恢复与前台焦点规则仍需在交互式桌面验证；ZIP 不创建开始菜单快捷方式。真实 iClicker 课堂签到和提交回执仍待联调。

原有 [macOS 通用版本](https://github.com/tzuo5/attendance-handler/releases/tag/v0.1.0) 继续提供下载，本次 Release 新增 Windows 附件。
