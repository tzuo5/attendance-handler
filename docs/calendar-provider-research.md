# 日历接入官方调研（P5.2）

调研日期：2026-10-01。本文是 Phase 5 的接入决策依据；当前 App 没有日历连接、授权或同步功能。本轮只阅读 Google、Apple 和 IETF 的公开资料，没有访问任何人的日历或账号。使用语义见 [calendar-ideation.md](calendar-ideation.md)；事件到任务的详细映射留给 P5.3。

**建议先用合成 Google 响应验证读取、分页、取消和去重，再单独验证 macOS EventKit。** 这是本项目的工程判断：Google 有真正的只读 OAuth scope 和桌面跨平台授权路径；EventKit 读取必须申请系统的完整日历权限。Apple Calendar 客户端、EventKit 本机事件库、iCloud 服务应分别评估，不能把三者视为同一个 API。依据分别是 [Google scopes](https://developers.google.com/workspace/calendar/api/auth)、[桌面 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app#loopback-ip-address)、[EventKit 权限](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)和 [Mac 日历账号](https://support.apple.com/en-gb/guide/calendar/icl4308d6701/mac)。

## 能力与权限比较

| 路线 | 能读取什么 | 权限和用户选定日历 | 本项目平台判断 |
| --- | --- | --- | --- |
| Google Calendar REST API | 事件的标题、描述、起止时间和取消状态；描述可含 HTML。[Events](https://developers.google.com/workspace/calendar/api/v3/reference/events) | 建议仅请求 `calendar.events.readonly` 和用于列出日历的 `calendar.calendarlist.readonly`。scope 的范围并不因 App 只勾选一两个日历而缩小；选择日历是 App 的读取约束。[Scopes](https://developers.google.com/workspace/calendar/api/auth) | 官方 Desktop app 的 loopback 授权路线覆盖 macOS 和 Windows 桌面应用；推断可作为 macOS 13+ / Windows 10 x64 的共同路线，但本 App 的实际授权、安装包和防火墙兼容性尚未验证。[Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app#loopback-ip-address) |
| Apple Calendar / EventKit | Calendar 是客户端，可包含 iCloud 和其他 CalDAV 账号；EventKit 读取本机 Calendar 数据库，不直接等于云端实时读取。[账号](https://support.apple.com/en-gb/guide/calendar/icl4308d6701/mac)、[事件读取](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders) | 不能申请只读权限；读现有事件需要 full access。write-only 不能读取，日历列表还会返回虚拟日历。App 选定日历是查询过滤，不是系统按日历授权。[权限](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)、[查询](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders) | EventKit 官方可用平台包含 macOS，未提供 Windows；本项目需单独的原生桥接。macOS 13 与 14+ 的授权 API 必须分支验证。[EventKit](https://developer.apple.com/documentation/eventkit)、[迁移说明](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels) |
| iCloud Calendar / CalDAV | Apple 确认 iCloud 日历基于 CalDAV；CalDAV 是 HTTP/WebDAV 日历协议，与 EventKit 不同。[Apple 数据概览](https://support.apple.com/en-gb/102651)、[RFC 4791](https://www.rfc-editor.org/rfc/rfc4791.html) | Apple 支持部分第三方应用通过 Apple Account 授权；不支持时可使用 app-specific password。不能据此承诺本 App 可申请相同授权，也没有核实日历专属只读 scope。[第三方接入](https://support.apple.com/en-us/121539) | 协议层跨平台是推断。服务器发现、认证资格、限流、重复例外及撤销的真实行为仍待隔离验证；不是现阶段已支持的 Windows Apple 日历方案。 |

`@tt` 保持为 App 自己识别的普通文本标记。Google 对应标题 / 描述，EventKit 对应 `title` / `notes`；这些字段提供文本读取能力。没有在本轮核实可将任意昵称注册为平台原生 agent 提及的 API，不能把文本识别描述为“邀请 @tt 即授权”。[Google Events](https://developers.google.com/workspace/calendar/api/v3/reference/events)、[Apple title](https://developer.apple.com/documentation/eventkit/ekcalendaritem/title)、[Apple notes](https://developer.apple.com/documentation/eventkit/ekcalendaritem/notes)

读取到起止字段仍需检查实际含义：Google 的 `endTimeUnspecified=true` 表示结束时间未指定，兼容用的 `end` 不能当作明确课堂时长；全天事件的日期字段也不是定时课堂。描述允许 HTML，本项目提案应先转换为普通文本，只识别标记与课程，不执行 HTML 或加载外部内容。这些条件留给后续映射和样例验证。[Events 时间与描述](https://developers.google.com/workspace/calendar/api/v3/reference/events#resource)

本项目的设计约束是只读取选择的日历，不写事件、不改参与者、不发送邀请。Google 可用 scope 限制写入能力；EventKit 的“只读使用”只能靠本 App 不调用写 API，系统授予的权限仍包含写入。授权页面必须坦白解释这一区别。[Google scopes](https://developers.google.com/workspace/calendar/api/auth)、[EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)

## Google：修改、重复和同步

普通事件的 `id` 在单个日历内唯一，不能只用标题或当前开始时间当身份。重复事件的各实例有不同 `id`，共用 `iCalUID`；实例的 `recurringEventId` 与不可变的 `originalStartTime` 可区分原定实例，即使该实例改了时间。账户、日历和实例的组合及迁移策略在 P5.3 定义。[Events 身份字段](https://developers.google.com/workspace/calendar/api/v3/reference/events#resource)

OAuth scope 不会增加用户在某个日历上的实际访问权；free/busy 或受限的私人事件可能无法提供识别文本。工程判断：权限 / 文本不可见不能被误判为用户移除了 `@tt`，应暂停待核实。[Events list 的 accessRole](https://developers.google.com/workspace/calendar/api/v3/reference/events/list#response)

默认 `events.list` 返回单次事件、重复母事件和例外，不返回普通重复实例；`singleEvents=true` 才展开实例且不返回母事件。不能直接把任意日历重复规则简化成现有每周任务；应使用来源展开的实例或明确拒绝尚不支持的规则。[Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents#access-instances)

取消记录可能缺少标题与时间。取消的重复例外只保证实例 ID、母事件 ID 和原定时间；普通删除只保证 ID，且删除记录不会永久保留。因此收到取消记录时应查已有绑定，不能要求它仍带 `@tt` 才处理取消。[Events 取消状态](https://developers.google.com/workspace/calendar/api/v3/reference/events#resource)

增量同步至少要满足以下条件：

1. 首次完整同步，逐页取完结果后保存最终页的 `nextSyncToken`；增量也可能分页，必须保持原查询和 sync token，跟随 page token 到最终页。中途失败不能把局部页面当完整快照。[同步流程](https://developers.google.com/workspace/calendar/api/guides/sync)
2. `syncToken` 不能与全文搜索、时间上下界、更新时间下界、排序、iCalendar UID 或扩展属性过滤同时使用；其他参数应与首次同步一致。不能每次增量都增加滚动时间范围，也不能用 `q=@tt` 取代本地标记识别。[Events list 参数](https://developers.google.com/workspace/calendar/api/v3/reference/events/list#parameters)
3. 增量包含已删除记录，不能关闭 deleted；失效 token 返回 410，应清理来源同步缓存并重新完整同步。[Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list#parameters)、[完整重建](https://developers.google.com/workspace/calendar/api/guides/sync#full_sync_required_by_server)

工程判断：来源缓存重建与本 App 的绑定、暂停选择及已执行记录应分开。410 或断网不意味着用户取消全部课堂，也不能抹掉去重历史。若首个隔离验证采用固定时间范围的完整快照，应明确它不是增量同步；只有取完全部页且查询范围和权限有效时，才具备比较同一范围内缺失事件的条件。

Google push 使用每资源的 watch channel 和有效证书的 HTTPS 回调。通知不包含具体事件，仍需 API 读取；channel 不会自动续期，需替换并处理重叠；通知也可能丢失。桌面 OAuth 的 loopback 回调不能当作公网 push 服务器。初期建议本机有限轮询与手动刷新，避免为设想增加服务器；用户规模增长后再评估 push 的服务端成本和可靠性。[Push notifications](https://developers.google.com/workspace/calendar/api/guides/push)

## Google：授权、撤销与维护

未来接入提案使用 Desktop app OAuth client、系统浏览器、随机 loopback 端口、PKCE（S256）和校验 state。官方当前的 redirect 章节不再支持 custom URI schemes，OOB 手工复制验证码也已停止；嵌入式浏览器可能被拒绝。实际授权窗口仍需真人隔离验收。[Installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)

用户可在 Google 账号撤销授权，App 也可以调用 revoke endpoint。官方说明撤销会移除同一 Google Cloud 项目此前授予的全部 scopes，并使该项目下全部 clients 的令牌失效；不能承诺只影响当前设备的一门课。项目应隔离用途，连接撤销应说明影响范围。本机“断开”还应停止读取、清除令牌并暂停未来日历计划；真实课堂回执和已经开始的课堂按既有规则保留。[OAuth revoke](https://developers.google.com/identity/protocols/oauth2/native-app#tokenrevoke)

公开应用的数据 scopes 可能需要验证，Workspace 管理员也可限制第三方授权。首次接入不能保证“点允许就一定成功”；需要拒绝、策略禁止、令牌失效的明白提示。[Scopes 验证](https://developers.google.com/workspace/calendar/api/auth)、[OAuth 常见错误](https://developers.google.com/identity/protocols/oauth2/native-app#errors)

外部用户项目处于 Testing 时，包含日历 scope 的 refresh token 通常七天到期；转为正式发布仍需考虑验证及其他失效条件。测试用连接不能承诺长期自动续用，恢复入口应区分重新授权与普通断网重试。[Refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)

成本应按当前项目配额评估：官方在 2026 年更新了配额模型，标准用量目前无额外费用，并计划在 2026 年稍后对超限收费、提前通知；不能承诺 API 永久免费。维护工作包括配额监控、403 / 429 退避、轮询量、授权和失效重建；push 另需 HTTPS 服务及 channel 管理。这些是维护成本判断，没有估算未经验证的金额。[Usage limits / Pricing](https://developers.google.com/workspace/calendar/api/guides/quota)

## Apple：本机权限与事件身份

macOS 14+ 使用 `requestFullAccessToEvents`，对应 `NSCalendarsFullAccessUsageDescription`，并区分 full access 与 write-only。为支持 macOS 13，应保留旧的 `NSCalendarsUsageDescription`，在旧系统路径使用 `requestAccess(to: .event)`；不能仅用旧回调的 granted/authorized 当作现代系统读权限。新 SDK 与旧 SDK 在新系统上的行为不同，官方要求逐主要 OS 版本测试。[新 API 的可用版本](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents(completion:))、[旧 API](https://developer.apple.com/documentation/eventkit/ekeventstore/requestaccess(to:completion:))、[TN3152](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels)、[TN3153](https://developer.apple.com/documentation/technotes/tn3153-adopting-api-changes-for-eventkit-in-ios-macos-and-watchos)

沙盒 macOS 应用需要 calendars entitlement；这不是只读 entitlement，也不代替用户许可。用户可到“系统设置 → 隐私与安全性 → 日历”关闭 App 访问。权限被撤销、账号停用或读失败时应标为同步不可用，不能把空结果当删除。[EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)、[Mac 日历权限](https://support.apple.com/en-eg/guide/mac-help/mh43710/mac)

EventKit 可按日期范围和选定 `EKCalendar` 查询，查询结果不保证按时间排序；传入所有日历与用户选择少数日历不同。其变化通知只表示库发生添加、修改或删除，不描述每个变化，应重新取所需日期范围。工程判断：需要确认完整查询与权限有效后才比较快照；通知本身不是删除回执，更不是 iCloud 云端同步完成证明。[Retrieving events](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders)、[Updating with notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications)

身份必须允许重新核对，不能承诺某一个 Apple ID 字段永久稳定：

- `eventIdentifier` 在事件换日历时很可能变化；本机 `calendarItemIdentifier` 在日历完整同步后可能丢失。[eventIdentifier](https://developer.apple.com/documentation/eventkit/ekevent/eventidentifier)、[calendarItemIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier)
- `calendarItemExternalIdentifier` 来自服务器，但不同日历 / 来源可能有重复副本，重复系列各实例还共用该值；Exchange 的跨设备情况也有差异。[External identifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier)
- 重复实例的 `occurrenceDate` 表示原定时间，即使 detached 后改开始时间仍不变；`isDetached` 可表示改过属性的例外。[occurrenceDate](https://developer.apple.com/documentation/eventkit/ekevent/occurrencedate)、[isDetached](https://developer.apple.com/documentation/eventkit/ekevent/isdetached)

工程判断：已读取重复实例应保留原定实例线索，换日历、完整同步或身份冲突时暂停未来绑定并要求确认，不能凭新时间 / 新标题自动当成另一节课。macOS 13 还改变了按 ID 查询某些重复例外的行为，真实验证必须包含改首个实例、移动日历及重新同步。[TN3130](https://developer.apple.com/documentation/technotes/tn3130-changes-to-eventkit-in-macos13-ventura)

## iCloud / CalDAV：候选路线与未核实项

CalDAV 规定按日历资源查询、ETag 及重复数据；iCalendar 用 UID 和 RECURRENCE-ID 表示事件与原定实例。WebDAV Sync 是另一个扩展，规定同步 token 与删除资源的报告。标准说明协议应如何工作，不证明 iCloud 为本 App 提供全部扩展、固定限流或稳定发现地址；本轮不把任何未经 Apple 官方确认的服务地址写成产品配置。[RFC 4791](https://www.rfc-editor.org/rfc/rfc4791.html)、[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.4.4)、[RFC 6578](https://www.rfc-editor.org/rfc/rfc6578.html)

Apple 官方目前允许受支持的第三方 App 用 Apple Account 授权；本项目是否有资格、公开开发者接入步骤、权限粒度仍未核实，不能断言“iCloud 没有授权路线”。app-specific password 是官方说明的替代方式，要求双重认证；可以逐个撤销，修改主密码会撤销全部 app-specific passwords。支持文章没有说明能用该密码请求日历专属只读权限，因此应把权限粒度视为待验证。[第三方 App 授权](https://support.apple.com/en-us/121539)、[App-specific passwords](https://support.apple.com/en-gb/102654)

受支持应用的 Apple Account 授权可在账号网页的 Sign-In and Security → Account Data Sharing 中 Remove access；撤销后需再次授权才能读取。本机断开与服务器撤销应分别说明，不能把仅删除本机连接说成已撤销账号权限。[撤销授权](https://support.apple.com/en-us/121539)

本项目判断：CalDAV 候选比 EventKit 增加协议、发现、凭据、重复规则和平台兼容的维护量，暂不优先。不得要求用户提供 Apple 主密码，也不建议将私人日历发布成公共链接来绕过授权。这里只作接入选择，没有申请资格、生成密码、写入凭据或测试服务器。

## 下一步隔离验证入口

1. **P5.3 / P5.4 本轮继续使用合成事件。** 首先固定来源读取契约及身份依据，再制作离线样例：普通事件、重复改时、取消例外、移除标记、分页中断、token 失效、权限撤销。样例不得请求真实 API，也不启动课堂。
2. **未来首个真实连接候选：Google，只读桌面授权。** 在独立测试项目、专用合成日历和已说明授权范围的环境中，先验证“读取 → 预览 → 手动确认”。完整分页、取消和撤销验证通过后，才评估与调度连接。此条是推荐路线，本轮尚未创建项目或授权。
3. **Apple 本机路线另验。** macOS 13 与 14+ 分别验完整权限、拒绝 / 撤销、单日历过滤、重复例外和身份变化；真实数据最小化、原生桥接及签名沙盒边界通过后再考虑产品入口。Windows Apple 路线继续待研究。

来源限制：Google 页面可直接读取；部分 Apple Developer 页面在网页读取工具中只返回 JavaScript 提示，其官方 Markdown 链接被工具拒绝了内容类型。本轮用系统 `curl` 正常校验证书读取这些官方 `.md` 页面，确认 API 可用版本和正文；未从论坛或第三方教程补事实。官方资料无法替代当前 App 的真人授权、实体 OS 升级、账号同步时序和实际服务行为验收。
