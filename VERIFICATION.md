# 验证记录

## 官网与应用更新（2026-10-01）

160 项单元测试、类型检查、Universal 生产构建及公开源码检查通过。其中 25 项更新 / 发布检查覆盖数字版本比较、旧版本 / 预发布拒绝、超时（含正文卡住）、断网、错误元数据、64 KiB 限制、ETag 304、损坏缓存、检查 / 下载去重、取消、校验失败、启动弹窗至多一次、每小时静默、课堂确认 / 拒绝及下载期间新课堂重新确认、安装失败恢复调度，以及 Windows SHA-512 / NSIS 独立元数据 / macOS 固定公钥签名检查。

本机 Chrome 实际验证应用左下角入口、被动发现新版无弹窗、进度 / 取消 / 错误重试 / 手动下载入口；官网英文默认、中文切换及重载记忆、390×844 手机布局、项目路径资源、对应 v0.1.1 的实际下载 URL 和服务器异常回退均通过。官网初次构建读取当前正式 v0.1.1，不提前宣称旧安装包支持更新。

macOS Apple Silicon 上的 Universal 99.0.0 → 99.0.1 实际升级通过：错误 Ed25519 签名在安装前拒绝，旧进程保持运行；重试通过真实 Sparkle 下载 / 替换 / 自动重启，新版本和新 PID 正确，合成课程、单次定时任务、后台设置及摘要逐项一致。测试使用隔离数据、独立测试密钥和本机更新源，没有修改日常安装。第一次尝试发现 Swift `readLine()` 和 Foundation XPath 的 stdin FILE 锁死锁；改为 FileHandle 读取命令后完整升级通过。

Windows NSIS 同样的两个版本实际升级脚本已接入 Windows CI，结果待该分支执行后补充；本机 macOS 不将其视为 Windows 已验证。弹窗 / 课堂确认的业务状态通过注入依赖验证，实体系统弹窗点击、真实课程中更新、Intel Mac 运行及登录钥匙串权限保持独立交互边界。Pages 对外上线与正式 v0.1.2 发布应分别确认部署和完整草稿附件。

## Phase 5.4 离线样例与决策（2026-10-01）

新增 [单文件 HTML 原型](docs/examples/calendar-prototype.html) 和 [方案结论 / 后续检查点](docs/calendar-decision.md)。在真实本机 Chrome 中打开文件，自动点击六组逐步演练的 35 个按钮，检查首次确认、同一计划改时 / 取消、重复读取保留生效时刻、领取后跨日 / 重开至多一次、暂停恢复、重复例外与回拨第二次时刻；31 个页面产生的任务投影通过现有 Phase 4 校验器。自由尝试的非法确认、读取失败后明确重新启用通过；另外直接运行纯模型，邮件片段、全天、秒精度、未指定结束、HTML 拒绝、旧事件包和过期决定后改时保护通过。

900×640 实际页面与独立新开的 390×844 页面视觉核对通过；无脚本错误、除本地文件外的请求为零。首次同页改窄屏后全页截图出现重复拼接，新页面等待绘制后正常，DOM 只有一个 main，宽度无页面溢出；记录在方案结论中。页面全为合成数据，模拟开始只增计数，模拟重开只保留内存快照，没有真实 API、账号、磁盘事务或课堂副作用。原型不进入 App 打包；Google 完成离线模型，Apple 仍为官方研究 / 专项待验，不声称跨平台真实日历已支持。

78 处本地引用、90 文件公开审核和 diff 格式检查通过。上一提交 `5d92052` 的 Source checks / Windows CI 已成功；本次 [`b24a6f2`](https://github.com/tzuo5/attendance-handler/commit/b24a6f2) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36862290281) / [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36862290228) 于 07:39 首次全部通过，覆盖既有 135 单测、双 renderer、Chrome 回归、实际 Windows 安装版调度 / 配置 / UI / 恢复 / 向导、真实 DPAPI、源码 / 包审核及 ZIP 一致性；发布 job 跳过，未发布下载包。CI 验证 App 回归，页面模型证据来自上述本机 Chrome 演练。Phase 5 按 ideation 范围结束，后续 C1–C5 / A1 未开始，真实课堂、学校登录、Mac 钥匙串和实体睡眠保持独立待验。

## Phase 5.3 日历实例映射（2026-10-01）

新增 [映射契约](docs/calendar-mapping.md) 和 [11 组手写设计轨迹](docs/examples/calendar-mapping-traces.json)，共 36 步。一次性隔离检查将 33 个预期任务的 ISO 生效时刻转为 epoch，通过当前 `validateSchedule` / `occurrenceOnDate` 校验课程引用、UTC 单次日期、起止与 50 分钟时长；复核稳定计划 ID、无变化同步保留生效时刻、领取后原截止与至多一次决定、取消一个重复例外不影响另一节、Chicago 回拨第二个 01:30 的 UTC 07:30 投影。未指定结束 / 秒精度 / 非整数时长的预期均不生成任务；权限失败、410、本机暂停和 Apple 身份变化保留绑定并暂停。

这些是设计数据一致性与现有任务模型兼容性检查，没有运行日历同步器、真实 API、产品日历领取或课堂。当前 Phase 4 的 `scheduleId / localDate` 不能独自保护日历实例跨日改时，契约明确未来需同一次原子保存日历领取与执行事实，产品没有被接入。上一提交 `8a4dc05` 的 Source checks / Windows CI 已成功。P5.4 在下一窗口提供可执行隔离样例；真实授权、Apple 桥接和来源时序仍待验证。

65 处本地文档引用、fixture 课程引用、88 文件公开审核和 diff 格式检查通过。首次引用检查的简单正则把相邻中文链接合并成错误路径，修正后通过；随后使用平衡括号解析复核，同时把 P5.2 的来源链接统计由 37 更正为 39（原统计漏分邻接链接，官方来源内容没有改变）。

映射提交 [`7ff8107`](https://github.com/tzuo5/attendance-handler/commit/7ff8107) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36858482170) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36858482158) 首次全部通过，包含既有运行代码、实际 Windows 安装版调度 / 配置 / UI / 恢复 / 向导、真实 DPAPI、Chrome 回归和包检查。它们不代表手写状态轨迹已由日历同步器执行。

## Phase 5.2 官方接入调研（2026-10-01）

新增 [Google / Apple 接入比较](docs/calendar-provider-research.md)，只使用 Google、Apple 和 IETF 的公开原始资料，关键条件经独立复核。核实 Google 只读 scopes 与 Desktop loopback / PKCE、同步分页与 410 / 删除、重复原定实例及 push 的 HTTPS / 续期限制；核实 EventKit 无只读授权、macOS 13 / 14+ 分支、变化通知和身份限制；iCloud CalDAV 与受支持第三方授权独立评估，当前 App 接入资格仍未核实。README、设计和隐私文档明确 App 日历选择不缩小账号 / 系统权限，读取未标记文本与只读使用的边界。

没有调用真实日历 API、申请授权或创建真实任务。Apple 部分网页工具仅返回 JS 提示或拒绝 Markdown 类型，改为正常证书校验的 `curl` 读取官方 Markdown 正文；这属于资料读取，不是功能验收。未来路线和错误处理建议标为工程判断。53 处本地文档引用全部存在，调研中的 39 个不同来源链接均来自官方域名（数量在 P5.3 用平衡括号解析复核）；逐项资料复核独立于域名检查。公开数据审核 86 文件和 `git diff --check` 通过。本窗口没有修改运行代码；上一提交 `4ab37c2` 的 Source checks / Windows CI 首次全部通过。

调研提交 [`8f9ddb6`](https://github.com/tzuo5/attendance-handler/commit/8f9ddb6) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36855068291) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36855068456) 首次全部通过：既有单测、双 renderer、全部 Chrome 集成 / 生命周期 / 后台检查、实际 Windows 安装版调度 / 配置 / UI / 恢复 / 向导、真实 DPAPI、源码及包审计、ZIP 一致性。CI 验证既有运行代码回归，不代表真实日历连接或授权已验证；事件映射及隔离样例仍待 P5.3 / P5.4。

## Phase 5.1 日历语义提案（2026-10-01）

新增 [@tt 设计约定](docs/calendar-ideation.md) 与 [16 个合成事件](docs/examples/calendar-intents.json)。完成设计走查及一次性数据一致性检查：JSON 可解析、16 场景 / 事件标识唯一、四个合成课程引用有效、可提议的课程名称唯一、事件时长在 Phase 4 范围内、取消和已开始实例的原截止上下文一致。分组为待确认 4、课程需选择 3、时间需补齐 3、忽略 2、取消未来 2、保留当前 2。

这些检查验证设计数据一致性，没有调用日历 API、运行产品解析器、生成真实任务或验证真实授权。Google / Apple 接入条件待 P5.2 官方调研；P5.3 / P5.4 分别完成映射与隔离样例。本窗口没有修改运行代码，前一功能 `82b6546` 的 Source / Windows CI 首次全部通过；提案提交 [`f09f389`](https://github.com/tzuo5/attendance-handler/commit/f09f389) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36851633544) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36851633562) 首次全部通过，包含既有 135 单测、双 renderer、Chrome 回归、实际安装版调度 / 配置 / UI / 恢复 / 向导、DPAPI、包审计及 ZIP 一致性。公开源码审核 85 文件通过。CI 证明既有运行代码回归通过，不代表实际日历接入或 16 场景已由产品解析器执行。

## Phase 4.4 时间变化与中断恢复（2026-10-01）

135 单测、类型检查、生产构建、双 renderer 通过。补全每周跨日错过记录与持久扫描进度、DST / 固定时区、时钟跳变及异步检查中取消 / 暂停 / 修改 / 删除 / 手动冲突、中断领取提示与原绝对截止。旧截止定时器的回拨提前结束已通过回归复现并修正，首次新增清理次数断言失败与调整见 [定时规则记录](docs/scheduled-starts.md)。

最新 macOS 实际打包六组 `test:scheduler` 通过：单次自动后台开始保持焦点；真实 App 重开去重；每周实例经注入唤醒开始、按原截止自动结束、真实网站签到 / 答案及摘要 / 门禁核对；取消实例经唤醒不再开始；重开加注入唤醒后过期任务记为错过且不启动 Chrome；900×640 执行记录与 App / 专用 Chrome 退出清理。四组配置与多次重开、最终 App 原有课堂 UI / 人工往返 / 通知处理器 / 延长与摘要回归通过，源码审计 83 文件与包审计 16 文件通过。系统 resume 是隔离事件注入，未操作实体睡眠或系统时钟；Mac 加密为合成替代，真实学校 / 课堂、Keychain 及实体睡眠待验证。功能提交 [`82b6546`](https://github.com/tzuo5/attendance-handler/commit/82b6546) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36849699219) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36849699225) 首次全部通过：135 单测、双 renderer、25 原有 Chrome 集成、生命周期、六组模式原型、九组后台运行、实际 Windows 安装版六组调度 / 四组配置 / 原有 UI / 恢复 / 向导、真实 DPAPI、源码及包审计、ZIP 一致性。

## Phase 4.3 调度与重复保护（2026-10-01）

113 单测、类型检查、生产构建、双 renderer 和 25 原有 Chrome 集成通过。macOS 实际打包 `test:scheduler` 四组通过：自动后台启动保持原生焦点、真实模拟网站分别确认签到 / 作答、实际重开后同一开始窗口不重复、迟到沿用原结束并自动摘要 / 清除页面门禁、退出清理。领取记录先持久化再启动，磁盘失败不产生课堂副作用；并发 / 手动冲突、环境失败和启动失败分别记录。新增验收脚本的三次等待 / 模拟页面时序失败与修正保留在 [定时规则记录](docs/scheduled-starts.md)。Mac 为明确标记的隔离合成加密，真实学校 / 课堂、Keychain 和物理睡眠继续待验收；功能提交 [`a352c1a`](https://github.com/tzuo5/attendance-handler/commit/a352c1a) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36846875578) 首次通过；[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36846875613) 首次全部通过：113 单测、双 renderer、原有 Chrome 全部回归、实际 Windows 安装版四组定时调度 / 配置多次重开 / UI / 恢复 / 向导、真实 DPAPI、包审计与 ZIP 一致性。

## Phase 4.2 定时配置（2026-10-01）

101 单测、类型检查、生产构建、双 renderer 通过；macOS 实际打包新增四组 `test:schedule-config`：单次 / 每周预览、时区和 DST 拦截、900×640 保存入口、多次真实 App 重开、编辑 / 暂停 / 启用持久化、取消确认、课程关联取消及无课程禁用。新增检查的下拉框命名、稳定定位及课程删除后渲染时序失败与修正见 [定时开启规则](docs/scheduled-starts.md)。此配置检查未打开课堂或调用加密。功能提交 [`c79ca5b`](https://github.com/tzuo5/attendance-handler/commit/c79ca5b) 及修正 [`4459814`](https://github.com/tzuo5/attendance-handler/commit/4459814) 的源码 / Windows CI 均首次尝试通过；修正的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36843239848) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36843239858) 包含 101 单测、双 renderer、全部原有 Chrome 检查、实际安装版四组配置重开 / UI / 恢复 / 首次向导、真实 DPAPI、包审计和 ZIP 一致性。自动调度尚未开放。

## Phase 4.1 定时规则（2026-10-01）

94 单测（新增 21 项规则检查）、类型检查、生产构建、双 renderer 通过；覆盖单次 / 每周、城市时区、夏令时缺口 / 回拨、闰日、跨 DST 时长、迟到 / 结束边界、课堂冲突、生效时间和旧预览保护。设置页明确托盘、退出、睡眠、开机启动决策及尚未开放自动调度。详情与实际 renderer 定位失败修正见 [定时开启规则](docs/scheduled-starts.md)。功能提交 [`ccb0d80`](https://github.com/tzuo5/attendance-handler/commit/ccb0d80) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36839642506) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36839642451) 首次尝试全部通过，含 94 单测、双 renderer、全部原有 Chrome 检查、实际安装版恢复 / UI / 向导、真实 DPAPI、包审计和 ZIP 一致性；实际调度和重启去重尚属 P4.3 / P4.4。

## Phase 3.4 中断恢复与进程生命周期（2026-10-01）

- 73 单测、类型检查、生产构建和双 renderer 通过；中断恢复入口在 900×640 可见，保留原结束时间。新增最多三次后台重连、恢复不重复不确定答案、过期不启动、睡眠唤醒及停止后晚到恢复再次清除门禁。
- `tests/browser-lifecycle.test.ts` 在真实事件接口注入旧 PID 仍活着的关闭 / 重开：修正前新启动已发出，修正后等待实际退出；另覆盖启动取消后的专用进程清理。未加入产品测试开关。
- 25 原有 Chrome 集成、九组后台运行通过。生命周期改为关窗后立即重开，并通过四轮连续关窗 / 重开，核实前一个 PID 退出；有额外标签页时保留浏览器。
- 实际 macOS 打包 `test:recovery` 五组通过：强制结束 App 后显示中断并暂停遗留门禁；人工恢复保留原会话、截止和回执；强制结束后台 Chrome 后自动重连且不重答；过期中断保持结束并关闭遗留 Chrome；最终 App 和所有记录的专用 Chrome PID 退出。首次用旧构建执行时门禁断言失败，重新打包最新源码后通过。
- 最新 macOS 打包 App 的原有 UI / 人工往返回归通过，原生测试通知产生 `show`；源码审核（74 文件）与最终包审核（16 文件）通过。Mac 使用隔离合成加密；功能提交 [`60c6730`](https://github.com/tzuo5/attendance-handler/commit/60c6730) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36837581084) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36837581087) 首次尝试全部通过，包含 73 单测、全部 Chrome 检查、实际安装版五组恢复 / 人工往返 / 首次向导及真实 DPAPI。真实学校 / 课堂、Keychain、物理睡眠与真人通知继续待验收。
- P3.1 首次 Windows 超时日志定位与同类竞态复现记录见 [后台模式记录](docs/background-mode.md)。旧日志缺少 PID / 资料锁时间，无法唯一证明当次根因；不把历史重跑当作修复依据。

## Phase 3.3 人工处理与返回后台（2026-10-01）

App / 托盘新增返回后台入口；返回前验证当前课程、页面识别和网站答案回执，保留未确认题目的原窗口与草稿。详情与行为边界见 [后台模式记录](docs/background-mode.md)。

- 66 单测、类型检查、双 renderer、生产构建通过；900×640 验证可见课堂返回入口与结束按钮完整可见，返回不更改会话 / 截止时间。
- 九组 `test:background-runtime` 通过，新增草稿拦截与确认后往返、学校验证、登录过期、未知页面不抢焦点提醒、其他标签页保护；原会话 / 结束时间 / 已确认处理记录保留，无重复提交，结束后无法返回后台继续本节课。
- 25 项原有 Chrome 集成通过，覆盖登录与学校验证等待等回归。首次新增运行测试发现学校验证标记被识别为未知页面，已修正识别并通过复测。
- 最终 macOS 打包 App：向真实课堂通知实例注入点击，打开正确可见课堂；待确认时阻止返回且原输入保留；实际托盘 MenuItem 调用产生失败提示且 App 保持隐藏；手动答案按网站回执确认后，用 App 返回后台继续原节课并保留两题记录。应用与专用 CDP 连接正常退出；原生测试通知产生 `show`，无页面运行错误。
- 原有 Chrome 生命周期回归、公开源码审核（72 文件）与最终 macOS App 审核（16 文件）通过。Mac 使用明确标记的隔离合成加密，生产使用系统 `safeStorage`；功能提交 [`6ee7269`](https://github.com/tzuo5/attendance-handler/commit/6ee7269) 的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36833334278) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36833334316) 首次尝试全部通过：66 单测、双 renderer、25 原有集成、生命周期、六组模式原型、九组后台运行、实际安装版人工往返和首次向导、真实 DPAPI、包审核与 ZIP 一致性。真实课堂、学校流程、钥匙串、真人通知及实体设备仍待验收。

## Phase 3.2 后台设置与运行（2026-10-01）

默认有窗口，保存的后台偏好从下次上课生效；本节按实际模式显示 App 与托盘状态。完整实现和边界见 [后台模式记录](docs/background-mode.md)。

- 64 项单元测试通过：新增旧资料默认模式、设置重读，以及切换期间暂停检查、保留处理记录/截止时间、停止中断和结束后的显式查看。
- 六组 `test:background-runtime` 通过：加密失败保留当前可用窗口、按偏好启动真正 Headless Chrome、登录恢复、签到与单次确认作答不抢焦点、偏好仅下次生效、查看原课堂保留记录与截止时间、受控时钟到期后页面动作门禁为零。
- 双 renderer 通过；900×640 中模式偏好、实际后台状态、最小化入口隐藏和结束按钮可见。原有 25 项集成、生命周期及六组模式往返原型通过。
- macOS 实际打包 App 通过课程与原有课堂回归，后台设置保存、系统可见 Chrome 窗口为零、关闭主界面继续 Headless 监控并确认单次答案、人工题状态，以及恢复 App。托盘菜单和提示文字通过实际 `Tray` 方法调用采集，验证课程、正常状态、后台模式、查看与结束入口；未声称真人点击了系统托盘。原生测试通知产生 `show`；首次向导与五步退出重开回归通过。
- macOS 继续使用隔离测试进程的合成 AES 加密替代，生产代码使用系统 `safeStorage`；系统钥匙串与真实学校课堂仍待验收。功能提交 `fe68166` 的 [源码 CI](https://github.com/tzuo5/attendance-handler/actions/runs/36830875081) 和 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36830875240) 全部通过：64 单测、双 renderer、25 原有集成、生命周期、六组模式原型、六组后台运行、实际安装版后台 UI / 向导、真实 DPAPI、包审核和 ZIP 一致性；本次首次尝试成功。
- 界面修正 `52813d5` 使设置页回到课程页后回到顶部；900×640 的检查要求结束按钮上下边界完整落在视口内，避免负位置误判。类型、生产构建与 renderer 通过，修正提交的 [Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36831375609) 与 [Windows 安装版 CI](https://github.com/tzuo5/attendance-handler/actions/runs/36831375710) 均已通过。

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

macOS 原有实际打包课堂 UI 回归通过，包含后台监控、通知处理器、草稿保护、回执确认返回后台、原截止与去重及退出清理；该课堂回归仍使用明确标记的隔离合成加密，未验证 Mac 钥匙串。源码审计 80 文件、包审计 16 文件通过。

P4.2 最终复核曾因课程删除 IPC 返回早于 React 渲染而过早读取按钮失败；当次检查顺序未阻止提交。后续单独修正测试为等待空课程界面，再核实禁用；最新打包四组通过。见定时规则记录，原失败未删除。

P4.3 最新打包配置回归 `test:schedule-config` 四组及多次真实 App 重开通过，未来任务在配置流程中未误触发课堂；源码公开审核 83 文件、包审核 16 文件通过。
