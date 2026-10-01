# Attendance Handler v0.1.2

加入免费中英双语官网及应用内更新，并包含 v0.1.1 之后开发的课堂反馈、首次向导、后台监控与定时开启。

- 界面加载后异步检查更新，3 秒总超时。启动发现新版最多弹一次；托盘重开及每小时检查仅更新左下角入口。
- 点击“下载更新”后下载、校验、安装并重启。下载期间继续监控，上课时需确认；下载期间新开始的课堂在安装前再次确认。
- Windows NSIS 安装版接入 electron-updater；安装到可写目录的 macOS 版使用 Sparkle 2.10.0、固定 Ed25519 公钥及独立 Universal 辅助程序。Windows ZIP 版仍手动更新。
- 保持应用标识和数据目录，保留课程、定时任务、记录、专用浏览器资料及加密登录数据。
- 官网对应最新正式 Release，提供 macOS Universal / Windows x64 下载、安装步骤、隐私说明及中英文切换。

v0.1.1 没有更新器，需要先手动安装本版一次。系统要求为 macOS 13+ 或 Windows 10/11 x64，并需要 Google Chrome。免费构建仍使用 macOS ad-hoc 签名和未签名 Windows 安装包；首次安装或系统权限检查可能要求确认，macOS 升级后也可能再次请求钥匙串权限。

发布流程等待附件完整、版本 / 校验值 / 更新签名匹配及两个版本实际升级测试，再生成草稿 Release。实体 Intel Mac / Windows、真实学校登录及课堂仍独立待验，详见 [验证记录](../VERIFICATION.md) 和 [更新发布流程](updates-and-website.md)。
