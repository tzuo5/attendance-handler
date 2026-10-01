# 免费官网与应用更新

官网地址为 `https://tzuo5.github.io/attendance-handler/`。静态网页使用 GitHub Pages，安装包使用 GitHub Releases；无需域名、服务器或收费 Apple Developer 账号。网页代码在 `docs/site/`，默认跟随浏览器语言，中英切换会保存在本机。

## 使用者流程

界面加载后才异步检查，3 秒总超时包含响应正文，检查失败不会阻塞使用或显示“已是最新版”。每个进程启动检查一次，之后每小时静默检查；ETag 缓存在用户数据目录的 `update-cache.json`，重复检查合并为一次请求。

完全退出再启动时，启动检查发现新版只弹一次“下载更新 / 稍后”。关闭主窗口、托盘重开、切回 App 和每小时检查均不会弹更新窗口。新版版本号、下载进度、取消和重试入口在左下角；选择“稍后”仍可在那里下载。

点击下载后自动校验、安装并重启。上课时先确认，下载期间继续监控；失败或取消不结束课堂。下载期间新开始了另一节课，安装前再次确认。安装阶段停止调度并限制新的课堂操作，保存本机数据、结束监控并关闭专用 Chrome，再交接安装。

Windows 安装版使用 electron-updater / NSIS；关闭自动下载和退出时自动安装。Windows ZIP 版提供手动下载入口。macOS 使用 Sparkle 2.10.0 和独立 Swift 更新辅助程序，更新 ZIP 在解压前验证 Ed25519 签名；需安装在当前用户可写的应用目录，DMG 卷或 App Translocation 中的应用使用手动入口。

应用标识仍为 `com.attendancehandler.desktop`，数据目录仍为 `Attendance Handler`。课程、定时任务、记录、专用 Chrome 资料和加密登录数据保留。免费版本使用 ad-hoc macOS 签名及未签名 Windows 安装包：首次安装或系统权限检查仍可能要求确认，macOS 升级后钥匙串也可能重新请求权限。`v0.1.1` 不包含更新器，需手动安装一次含更新器的版本。

## 发布端配置

1. GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**。`pages.yml` 在官网变更、正式 Release 发布或手动触发时部署；跳过草稿和预发布。
2. 固定更新公钥保存在 `package.json` 的 `build.mac.extendInfo.SUPublicEDKey`。对应私钥保存在开发者 macOS 钥匙串的 Sparkle 账户 `com.attendancehandler.updates`；正常发布不重新生成密钥。
3. CI 使用仓库 Actions Secret `ATTENDANCE_SPARKLE_PRIVATE_KEY`。用 Sparkle `generate_keys --account com.attendancehandler.updates -x <临时文件>` 导出，直接把文件作为 `gh secret set ATTENDANCE_SPARKLE_PRIVATE_KEY` 的标准输入，随后删除临时文件。禁止把私钥写进仓库、输出到日志或上传为 artifact；保留独立安全备份，丢失私钥会中断现有安装的信任链。
4. 更新 `package.json` 和 lockfile 的版本，准备 `docs/RELEASE-v<版本>.md`，推送对应正式版本 tag。
5. `release.yml` 等待 Windows 和 macOS 构建及实际升级测试。Windows 元数据仅保留 NSIS 安装包；macOS ZIP 用固定私钥签名。聚合任务验证四个安装包 / ZIP、全部 SHA-256、Windows SHA-512、版本 / URL，以及 macOS 签名与内置公钥一致，然后创建完整 **草稿 Release**。
6. 检查草稿附件和 Actions 成功后公开 Release。公开事件触发 Pages，网页下载、`version.json`、`updates/appcast.xml` 与 `updates/windows/latest.yml` 全部来自同一正式版本。上传未完整的 Release 会使网页构建失败，保留之前的部署。

更新时应用优先使用正式版本的不可变 Release 元数据链接，避免网页切换版本期间下载到另一个版本。网页初次上线可介绍现有 `v0.1.1`，其下载页不会宣称旧包支持自动更新。Release 更新说明入口直接指向该版本 GitHub 页面。

## 本机检查

```sh
npm run build:site            # 从最新正式 Release 构建 .site-build/
npm run test:updates          # 网络、版本、缓存、课堂确认及发布校验
npm run test:update-renderer  # 应用入口与双语 / 手机 / 项目路径网页
ATTENDANCE_UNIVERSAL=1 npm run build  # macOS Universal 辅助程序
npm run test:update-native    # 本平台两个测试版本的真实安装升级
```

实际升级测试生成隔离的 99.0.0 / 99.0.1 应用、临时数据和独立测试签名密钥，不更新日常使用的安装。先拒绝损坏的包，再检查替换、重启和数据保留；Windows 使用实际 NSIS 安装，Mac 使用 Universal 应用。报告在被忽略的 `.test-artifacts/` 中，详细边界见 [验证记录](../VERIFICATION.md)。

实现依据：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[electron-updater](https://www.electron.build/v26/docs/features/auto-update/)、[Sparkle 自定义界面](https://sparkle-project.org/documentation/customization/)、[Sparkle 更新签名](https://sparkle-project.org/documentation/)。
