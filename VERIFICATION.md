# 验证记录

## Phase 3.2 后台设置与运行（2026-10-01）

默认有窗口，保存的后台偏好从下次上课生效；本节按实际模式显示 App 与托盘状态。完整实现和边界见 [后台模式记录](docs/background-mode.md)。

- 64 项单元测试通过：新增旧资料默认模式、设置重读，以及切换期间暂停检查、保留处理记录/截止时间、停止中断和结束后的显式查看。
- 六组 `test:background-runtime` 通过：加密失败保留当前可用窗口、按偏好启动真正 Headless Chrome、登录恢复、签到与单次确认作答不抢焦点、偏好仅下次生效、查看原课堂保留记录与截止时间、受控时钟到期后页面动作门禁为零。
- 双 renderer 通过；900×640 中模式偏好、实际后台状态、最小化入口隐藏和结束按钮可见。原有 25 项集成、生命周期及六组模式往返原型通过。
- macOS 实际打包 App 通过课程与原有课堂回归，后台设置保存、系统可见 Chrome 窗口为零、关闭主界面继续 Headless 监控并确认单次答案、人工题状态，以及恢复 App。托盘菜单和提示文字通过实际 `Tray` 方法调用采集，验证课程、正常状态、后台模式、查看与结束入口；未声称真人点击了系统托盘。原生测试通知产生 `show`；首次向导与五步退出重开回归通过。
- macOS 继续使用隔离测试进程的合成 AES 加密替代，生产代码使用系统 `safeStorage`；系统钥匙串与真实学校课堂仍待验收。功能提交 `fe68166` 的 [源码 CI](https://github.com/tzuo5/attendance-handler/actions/runs/36830875081) 和 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36830875240) 全部通过：64 单测、双 renderer、25 原有集成、生命周期、六组模式原型、六组后台运行、实际安装版后台 UI / 向导、真实 DPAPI、包审核和 ZIP 一致性；本次首次尝试成功。
- 界面修正 `52813d5` 使设置页回到课程页后回到顶部；900×640 的检查要求结束按钮上下边界完整落在视口内，避免负位置误判。类型、生产构建与 renderer 通过，修正提交的新 CI 待完成；不把此前功能提交的 CI 说成该修正的结果。

## Phase 3.1 模式切换原型（2026-10-01）

Apple Silicon macOS / Chrome 154.0.8037.58 的 `npm run test:background-feasibility` 通过六组隔离检查：有窗口登录、Headless 签到与确认作答、转回有窗口人工处理、返回 Headless、相同资料的 Cookie 与加密会话恢复、原会话/截止时间/去重记录保留、无可见后台窗口、自动模式切换保持焦点及四个浏览器进程退出。方案与完整证据见 [后台模式记录](docs/background-mode.md)。

60 项单元测试、类型检查、生产构建、原有 25 项课堂集成及专用 Chrome 生命周期回归通过。功能提交 `334b2fb` 的 [源码 CI](https://github.com/tzuo5/attendance-handler/actions/runs/36827376632) 通过；[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36827376760) 第二次尝试全部通过，包含同一模式往返原型和实际安装版 UI、首次向导、DPAPI 及包审核。第一次尝试在原有关窗恢复步骤出现 Chrome 连接超时，尚未进入新原型；重跑通过不代表该偶发时序问题已修复，P3.4 继续处理生命周期边界。

真实课堂与系统钥匙串范围仍待验证。该原型只交付底层可行性，正式 App 开关和恢复路径按 [分时执行记录](docs/overnight-execution.md) 在后续窗口完成；不把它列作已发布功能。

## Phase 2 源码验收（2026-10-01）

对应 [开发计划](dev-plans.md) 的 P2.1–P2.4，功能提交为 `81f7306`、`0fd6253`、`10644ff`、`b387bae`：环境检查、可恢复首次向导、实际页面登录确认与课程导入、提醒确认及完成摘要。此前 `v0.1.1` 下载包未更新；本节记录当前源码和本机重新打包结果。

### 自动化验证

- 60 项单元测试：环境缺少 Chrome、连接失败、数据不可写和加密不可用；进度保存、旧版本升级及步骤门禁；空课程证据与缓存清理；通知发送失败、展示事件、超时、未收到、人工确认选择、明确延期、旧尝试事件隔离及重启恢复。
- TypeScript、生产构建、原有 renderer 回归和 `npm run test:setup-renderer` 通过。首次向导在 900×640 验证五步重载、学校登录未确认拦截、导入表单复用、空列表/读取失败、提醒修复入口、完成摘要及首节课入口。
- 25 项专用 Chrome 集成通过，包括 Phase 1 回执、去重和焦点回归，以及学校验证等待、登录过期、取消登录、实际页面确认、空账号、读取失败、缓存清理及修复后重试。专用浏览器生命周期通过。
- macOS Apple Silicon 打包 App 的 `npm run test:setup` 使用全新临时资料：在五个步骤分别退出并重开；保存课程和登录；通知发送失败、系统接受但用户未确认、未收到、稍后处理及确认收到分别保存；完成后直接开始首节模拟课；完成后重开进入课程页，设置页重新打开向导。
- 本机最终打包 App 的原有课堂 UI 回归亦通过；原生测试通知返回 `show` 并出现在 macOS 通知历史中。
- 通知失败与展示结果通过隔离测试进程的事件注入验证，确认按钮由自动化模拟用户点击。这验证状态和交互，不证明真人看到了系统通知。默认 `test:ui` 的原生通知结果单独记录。
- 源码与最终 macOS App 公开数据审核通过；测试只用合成课堂、零值坐标和临时资料。

### Windows 与加密边界

[P2.1 Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36822185956)、[P2.2 Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36822869748) 与 [P2.3 Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36823502721) 已通过。P2.2 起在实际安装版中验证全新资料和每步退出重开；默认使用真实 Windows DPAPI。[最终 P2.4 Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36824918135) 与 [同一功能提交的源码检查](https://github.com/tzuo5/attendance-handler/actions/runs/36824918084) 亦全部通过：60 项单元测试、双套 renderer、25 项 Chrome 集成、生命周期、包审核、实际安装版的原有课堂回归及首次向导（包含通知失败注入和用户确认选择）、真实 DPAPI 会话重启恢复、ZIP 一致性及校验值。运行环境为 GitHub 托管 Windows Server 2022 x64。

macOS 使用 `ATTENDANCE_UI_CIPHER=synthetic npm run test:setup` 与 `test:ui` 完成隔离 App 验收。原因是本机系统钥匙串调用等待授权；该替代只存在于测试脚本控制的演示进程，生产代码仍使用 `safeStorage`。环境检查确认加密服务可用性，不会把它显示为已验证保存真实登录。

### Phase 2 待完成的交互验收

- macOS 系统钥匙串授权及真实学校登录、真实课程导入；实体 Windows 10/11 与 Intel Mac。
- 邀请不熟悉电脑操作的使用者在干净资料中走完整流程，记录环境错误提示、学校验证、课程位置填写、系统通知与中断后继续的卡点。
- 使用者实际看到测试提醒并点击“我收到了”，包括系统权限、专注/勿扰模式及通知声音。

四项 MVP 已实现；上述真人走查未进行，阶段出口仍保留待验收标记。2026-10-01 用户追加授权自动继续 Phase 3–5，模拟实现可继续，真人和真实平台出口不据自动化结果虚报通过。

## Phase 1 源码验收（2026-09-30）

本次实现对应 [开发计划](dev-plans.md) 的 P1.1–P1.7，功能提交为 `1ff62c8`、`5098c72`、`d75229a`、`6476323`、`d448bac`、`adccb5f`、`0629977`，回归修复为 `e9b8949` 与 `a28135f`。下载页中的 `v0.1.1` 安装包尚未包含这些改动。

### 本机通过

- 44 项单元测试及 TypeScript 检查：状态与故障分类、题目回执及去重、保留签到确认、关题后的迟到回执、结构化日志、旧数据读取、脱敏及保留数量、摘要统计、配置校验、延长截止时间、结束并发及唤醒后的到期门禁。
- `npm run test:renderer`：在 macOS Chrome 的 900×640 视口验证状态文字、颜色和恢复按钮，保证结束按钮可见；验证日志筛选、搜索和新增事件的阅读位置（包含同时清理旧事件），题目尝试/确认/关闭、摘要关联本节日志，以及课程导入、手动添加、位置复用、字段提示、编辑原值、Escape 和焦点管理。
- `npm run test:integration`：17 项专用 Chrome 模拟课堂检查，包括网站签到与答案确认、后台焦点保持、最小化监控、关窗恢复、延长时浏览器门禁同步、结束摘要及加密会话重启恢复。
- `npm run test:chrome-lifecycle`：最后一个专用窗口关闭和退出 App 均清理 Chrome，保留其他窗口并支持再次打开。
- `npm run package` 与打包 App 的模拟课堂：课程保存、重复课程拦截、实际 IPC 延长、摘要持久化、设置页、专用 Chrome、原生辅助程序、退出清理；无页面运行错误。系统测试通知产生 `show` 事件并出现在 macOS 通知历史中。
- 公开源码和最终 macOS `.app` 的白名单及隐私审计通过。仅合成课堂、零值坐标和临时资料用于测试。

### 加密与平台边界

本次 macOS 打包 App 的默认加密检查在系统钥匙串调用中等待本机授权，未取得本次成功结果。为完成其余 UI 验收，使用 `ATTENDANCE_UI_CIPHER=synthetic npm run test:ui`；该选项只在测试脚本控制的隔离演示进程中替换加密方法，报告明确标记合成加密，不验证系统钥匙串。生产代码和默认 `npm run test:ui` 继续使用 Electron `safeStorage`。

Windows CI 默认使用真实 DPAPI。[最终功能提交 `a28135f` 的 Windows 执行记录](https://github.com/tzuo5/attendance-handler/actions/runs/36813357714) 已全部通过：44 项单元测试、生产构建、最小窗口 renderer 验收（包含日志保留上限）、17 项 Chrome 集成、生命周期、包审计、实际安装版 UI、摘要与延长、加密往返和 ZIP 一致性检查。[同一提交的源码检查](https://github.com/tzuo5/attendance-handler/actions/runs/36813357712) 亦通过。Windows 自动化平台为 GitHub 托管 Windows Server 2022 x64；[此前回归提交 `e9b8949` 的执行记录](https://github.com/tzuo5/attendance-handler/actions/runs/36813091969) 同样通过。

真实 iClicker / 学校登录、用户点击系统通知、实体 Windows 10/11、Intel Mac 及实际合盖睡眠等交互验收仍沿用下方已有待验证范围。测试中的唤醒检查使用可控时钟；未将模拟课堂结果视为真实签到或作答证明。

## Windows v0.1.0

构建目标为 Windows 10/11 x64，提供 NSIS 安装包和 ZIP；固定标识 `com.attendancehandler.desktop`，未代码签名。自动化运行环境为 GitHub 托管的 Windows Server 2022 x64；执行记录见 [Windows 构建工作流](https://github.com/tzuo5/attendance-handler/actions/workflows/windows.yml)。

发布流程必须通过以下检查，才会上传 Release 附件：

- 22 项单元测试、TypeScript 检查、生产构建及公开源码隐私扫描。
- 15 项独立 Chrome 模拟课堂检查，包括后台启动、最小化答题、完整浏览器重启和加密会话恢复。
- 对 `win-unpacked` 的应用归档和文件进行公开数据审计。
- 静默安装最终 EXE，验证已安装程序与审计包的应用归档一致。
- 启动已安装 App，检查课程列表、表单保存、设置页、专用 Chrome、解包后的原生辅助程序、模拟签到，以及 safeStorage / Windows DPAPI 加密和解密。
- 解压最终 ZIP，核对应用归档一致性，生成 EXE 和 ZIP 的 SHA-256 校验值。

Windows 10/11 实体设备、系统通知显示和声音、点击通知后的焦点恢复、睡眠唤醒及真实课堂仍需交互式验证。CI 的通知事件单独记录，不把系统未展示通知判定为课堂流程通过。ZIP 不注册开始菜单快捷方式，系统通知建议使用安装版。

## macOS v0.1.0 本机验证

构建目标：macOS 13+ 通用包（Apple Silicon / Intel）；固定标识 `com.attendancehandler.desktop`；ad-hoc 签名，未公证。运行时验证在 Apple Silicon 上进行，尚无实体 Intel Mac 验证。

## 已验证

- TypeScript 类型检查、生产构建及签名校验。
- 22 项单元测试：题目去重、已有答案保护、不确定状态转人工、30 秒提醒、到期停止、停止后的迟到操作、断网退避、窗口关闭、课程切换，以及异常通知持续可点击。
- 15 项专用 Chrome 模拟集成检查：后台启动及自动答题不改变前台 App、定位、签到回执、单次提交及确认、最小化监控、非单选提醒、关闭暂停与手动恢复、截止门禁、提醒模式、课程导入、会话加密、完整浏览器重启恢复、主动退出后不恢复旧凭据。
- 打包 App 的课程列表、表单保存、设置页及页面运行错误检查。
- 打包 App 的原生通知已收到 `show` 事件，并出现在 macOS 通知历史中。
- 公开源码白名单、隐私扫描及坐标占位值检查；个人应用数据、浏览器资料、原始测试报告与截图不公开。

测试报告和截图见 `.test-artifacts/`。所有课堂提交测试均指向本机模拟服务，不是真实签到记录。

## 尚待用户配合完成

- 真实账号的首次登录／学校验证、真实课程导入、过期会话恢复。
- 有真实课堂开放时的签到回执、题目标识、自动 A 提交回执和真实题型适配。
- 用户实际点击系统题目通知后，恢复同一个课堂窗口。
- 在其他应用连续输入、全屏使用时的焦点行为；合盖／手动睡眠后的实际唤醒验证。
- 正式系统通知授权、提示音及勿扰设置下的体验确认。

模拟通过不等同于真实课堂验收完成。未取得真实签到和提交回执前，不应把 App 作为唯一签到保障。
