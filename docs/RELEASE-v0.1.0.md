# Attendance Handler v0.1.0

macOS 中文课堂助手，保留可操作的 iClicker Chrome 窗口。

## 下载与安装

1. 下载下方的 **Attendance-Handler-0.1.0-mac-universal.dmg**，不要选择 GitHub 自动生成的 Source code。
2. 打开 DMG，将 **Attendance Handler** 拖到 **Applications**，再从 Applications 启动。
3. 需要 **macOS 13 或更新版本**，支持 Apple Silicon 和 Intel。请先把 Google Chrome 安装到 Applications。无需安装 Node.js。
4. 首次运行由用户完成 iClicker 登录、学校验证和通知授权；安装包不含任何预设账号、个人课程或个人位置。

提供 ZIP 作为备用下载，以及 SHA256SUMS.txt 用于校验。

## 签名状态：未公证

此版本为 ad-hoc 签名，**没有 Apple Developer ID 签名或 Apple 公证**。首次打开可能被 Gatekeeper 拦截，无法承诺“下载后无提示启动”。确认下载来源可信后，可参考 [Apple 官方打开说明](https://support.apple.com/102445)，在“系统设置 → 隐私与安全性”中手动允许此 App。不要关闭系统整体安全保护。如果是损坏或恶意软件警告，请停止运行并报告，不要强行绕过。

后续无此类首次启动警告的发行版需要配置 Developer ID 证书并完成公证。本版本没有捆绑安装脚本，不会自动修改系统安全设置。

## 功能

- 课程导入与本机配置、每 5 秒检查、单门课倒计时。
- 可见专用 Chrome 窗口，最小化后继续监控。
- 可识别实时单选题的自动 A；其他题型和不确定状态提醒人工处理。
- 手动作答模式每 30 秒提醒，点击通知回到课堂。
- 菜单栏后台运行、防闲置睡眠、结束后解除定位覆盖。
- 登录会话加密保存；公开代码和安装包不含个人数据，课程列表不直接显示坐标。

## 验证与限制

22 项单元测试、15 项本机模拟集成检查通过；Apple Silicon 上验证了打包 App、原生通知送达及界面。Intel 版本为通用二进制中的交叉编译构建，未在实体 Intel Mac 上实测。

真实 iClicker 课堂的签到及提交回执尚未完成最终验收；网站结构变化可能影响识别。请在允许的课堂规则下使用，首次使用时保留人工确认，不要把它作为唯一签到保障。
