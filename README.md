# Attendance Handler

macOS 课堂助手。保留一个可见的专用 Chrome 窗口，在后台检查 iClicker 签到与课堂题目。

## Mac 下载与安装

**[下载 macOS 通用安装包（DMG）](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.dmg)** · [全部下载与更新说明](https://github.com/tzuo5/attendance-handler/releases)

支持 macOS 13+，Apple Silicon 与 Intel。打开 DMG，把 App 拖入 Applications 后启动；请预先安装 Google Chrome，无需 Node.js。

**当前版本未公证**：采用 ad-hoc 签名，没有 Developer ID 证书。首次打开可能被 macOS 拦截；确认来源可信后，按 [Apple 官方说明](https://support.apple.com/102445) 在“隐私与安全性”中允许打开。不要关闭系统整体安全保护。真正无此类警告的发行版仍需 Developer ID 签名与 Apple 公证。

这是第一版预览质量的软件，真实课堂签到和提交回执尚待最终验收。Intel 包含在通用构建中，但尚未在实体 Intel Mac 上实测。

## 使用

1. 打开已安装的 Attendance Handler；本机构建也可打开 `release/mac-arm64/Attendance Handler.app`。
2. 点击 **登录 iClicker**，在专用 Chrome 窗口中登录并完成学校验证。
3. 在 **连接与提醒** 中发送测试通知，并在 macOS 设置中允许通知和声音。
4. **从 iClicker 导入** 课程，或者手动填写课程页面链接。设置经纬度、课程时长和答题方式。
5. 点击 **开始上课**。Chrome 保持可见；切换应用、遮挡或最小化窗口后仍持续监控。

自动 A 模式仅适用于已识别的实时单选投票。有其他题型、已有选择或不确定的提交结果时，会提醒用户处理。提醒模式每 30 秒提醒未作答且仍开放的题目，点击通知显示原窗口。

关闭 App 主窗口会驻留菜单栏。关闭课堂标签页会暂停自动操作，点击 **查看课堂** 恢复。到时或结束上课后，停止监控并解除定位覆盖，但保留浏览器窗口。菜单栏中的 **退出** 会停止 App。

## 开发与验证

需要 macOS、Apple Command Line Tools、Node.js 22.12+，以及 `/Applications/Google Chrome.app`。

```sh
npm install
npm run dev
npm test
npm run build
npm run test:integration
npm run package
npm run dist:mac
npm run audit:public
```

`npm run demo` 启动完全本地的模拟课堂和独立演示 App 数据。模拟页面底部提供教师控制台，可开课、发单选／填空题和结束题目。演示模式不会访问真实 iClicker。

集成测试使用独立临时 Chrome 资料目录，测试结束仅关闭测试浏览器。测试报告与截图写入 `.test-artifacts/`，临时目录路径记录在报告中。模拟测试不能替代实际账号、学校 SSO 和正在进行的课堂验收。

`npm run dist:mac` 在 `release-public/` 生成通用 DMG 和 ZIP。原生辅助程序也同时编译为 arm64/x86_64，最低 macOS 13；打包使用白名单并排除源码映射。公开源码及模拟数据不包含真实坐标。发布前还需对安装包中的 App 运行隐私扫描，详见 [隐私说明](PRIVACY.md)。

## 结构

- `src/renderer`：React 课程管理、监控状态和连接设置。
- `src/main/browser.ts`：专用 Chrome 生命周期、CDP、定位、加密会话及用户触发的窗口操作。
- `src/main/iclicker.ts`：DOM 检测与被动网络证据，基于公开前端中可确认的 Join、单选及答案回执结构。
- `src/main/watchdog.ts`：5 秒检查、截止时间、提交去重、30 秒通知及异常恢复。
- `scripts/mock-classroom.mjs`：本机模拟课堂；`scripts/native.swift`：指定浏览器进程激活与焦点测试。

Chrome 先以 `--no-startup-window` 后台启动，再通过 CDP 创建 `background: true` 的有窗口页面，避免 Chrome 启动时主动激活。只有“登录”“查看课堂”或通知点击会显式激活 App 专用 Chrome 进程。

## 本地数据与运行边界

正式数据存放在 `~/Library/Application Support/Attendance Handler/`，包含课程和最近 400 条事件、专用 `chrome-profile`、以及使用 Electron `safeStorage`／macOS 钥匙串加密的 `session.enc`。App 不保存密码，不把会话令牌写入日志或源码。课程在设备本地保存，不提供云同步。

- 同时监控一门课。默认 50 分钟，可设为 1–720 分钟；截止时间包含等待开课、登录和暂停的时间。
- 定位精度默认 10 米，覆盖仅用于专用浏览器。停止时清除覆盖和临时地理位置授权。
- 启动、重试和恢复都不会延长截止时间。App 重启后保留上次记录，但需要重新点击开始。
- 课程期间阻止闲置睡眠，屏幕可以熄灭；合盖或主动睡眠期间无法检查。系统勿扰、通知设置和网络状态仍影响提醒送达。
- 学校登录失效或 MFA 仍需用户完成。iClicker 页面结构改变、蓝牙签到、无法可靠识别的题目会暂停自动提交并提示检查。
- 题目 ID 优先使用页面实际标识和页面接收到的课堂事件。缺少稳定标识时只提醒，不猜测重复题。
- `.app` 为本机 ad-hoc 签名构建。对外分发需要 Developer ID 签名及公证；重新签名后钥匙串或通知权限可能需要重新授权。

## 真实课堂验收

在用户完成登录并有课堂开放时，检查：课程导入、经纬度、真实签到回执、每种所用题型、已接收答案、最小化运行、通知送达及点击、到期停止。未完成这些检查之前，只能认定本机模拟流程已验证。
