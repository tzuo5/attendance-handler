# Phase 3–5 分时执行记录

用户已确认本次截止时间为 **2026-10-01 08:00 America/Chicago（13:00 UTC）**，目标 07:40 完成，07:40–07:55 留给必要验收、修复与推送。每个 MVP 单独验证、commit 和 push，不提前集中完成整个阶段。

| 时间（America/Chicago） | MVP | 本窗口交付 |
| --- | --- | --- |
| 01:40–02:10 | P3.1 | 可见与无窗口往返的隔离可行性验证 |
| 02:10–02:40 | P3.2 | 后台模式设置与运行 |
| 02:40–03:10 | P3.3 | 人工处理与返回后台 |
| 03:10–03:40 | P3.4 | 崩溃、重启恢复与退出清理 |
| 03:40–04:10 | P4.1 | 定时规则、时区和触发策略 |
| 04:10–04:40 | P4.2 | 定时任务配置、预览与持久化 |
| 04:40–05:10 | P4.3 | 调度与重复触发保护 |
| 05:10–05:40 | P4.4 | 时间变化、错过任务与恢复 |
| 05:40–06:10 | P5.1 | 日历场景及 `@tt` 语义 |
| 06:10–06:40 | P5.2 | Google / Apple 官方接入调研 |
| 06:40–07:10 | P5.3 | 日历事件与定时任务映射 |
| 07:10–07:40 | P5.4 | 隔离样例、方案决策与后续范围 |
| 07:40–07:55 | 收尾 | 必要修复、最终验证与汇总 |

Phase 5 保持 [开发计划](../dev-plans.md) 中的 ideation 范围，交付方案和合成样例，不声称真实日历授权或接入已完成。用户已授权继续 Phase 3/4 的自动实现；现有真人验收缺失不会阻止模拟环境中的开发，真实学校登录、真实课堂、macOS 钥匙串授权和实体设备行为继续独立标为待验证。

执行采用当前聊天的临时自动续做任务，约每 30 分钟继续。每轮先检查当前时间、Git 状态和进度，避免重复改动；完成当前检查点及必要回归后再进入下一时间窗口。若测试失败，先修复实际问题，不勾选未通过的检查点。不得为了赶截止时间跳过验证或伪造记录。到截止时间停止新增范围并如实报告实际结果。

本机自动任务依赖电脑和 Codex 持续运行、仓库可用及网络可用；计划时间不是对外部服务或机器故障的保证。完成后移除临时续做任务。

## 进度

| MVP | 状态 | 提交与证据 |
| --- | --- | --- |
| P3.1 | 完成（01:55 提交；02:06 平台验收） | [`334b2fb`](https://github.com/tzuo5/attendance-handler/commit/334b2fb) · `feat: validate dedicated Chrome background mode round trips`；macOS 与 Windows 六组隔离模式往返、60 单测、25 原有集成及生命周期通过，[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36827376760) 第二次尝试全部通过；首次关窗恢复超时及剩余边界见 [后台模式记录](background-mode.md) |
| P3.2 | 完成（02:32 提交；02:37 平台验收） | [`fe68166`](https://github.com/tzuo5/attendance-handler/commit/fe68166) · `feat: add saved background mode and headless classroom monitoring`；64 单测、六组后台运行、双 renderer、25 原有集成、生命周期、实际打包 App / 向导及 [Windows 安装版 CI](https://github.com/tzuo5/attendance-handler/actions/runs/36830875240) 全部通过；界面滚动修正 [`52813d5`](https://github.com/tzuo5/attendance-handler/commit/52813d5) 本机及新 Windows CI 通过，见 [后台模式记录](background-mode.md) |
| P3.3 | 完成（02:57 提交；03:03 平台验收） | [`6ee7269`](https://github.com/tzuo5/attendance-handler/commit/6ee7269) · `feat: return human-handled classrooms to background safely`；66 单测、双 renderer、九组后台运行、25 原有集成、macOS 实际打包 UI / 通知处理器 / 托盘失败提示通过，[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36833334316) 首次尝试全部通过，含实际安装版、首次向导和真实 DPAPI |
| P3.4 | 完成（03:38 提交；03:44 平台验收） | [`60c6730`](https://github.com/tzuo5/attendance-handler/commit/60c6730) · `feat: recover interrupted classrooms and wait for Chrome process exit`；73 单测、双 renderer、25 原有集成、九组后台运行、四轮立即重开、macOS 实际打包五组恢复通过；[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36837581087) 首次尝试全部通过，含实际安装版五组恢复及 DPAPI |
| P4.1 | 完成（03:57 提交；04:04 平台验收） | [`ccb0d80`](https://github.com/tzuo5/attendance-handler/commit/ccb0d80) · `feat: define timezone-aware scheduled start rules and runtime guidance`； 单次 / 每周、城市时区与夏令时、迟到原截止、冲突、任务生效规则与设置说明；94 单测、构建、双 renderer 通过，见 [定时开启规则](scheduled-starts.md)；[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36839642451) 首次尝试全部通过，含原有 Chrome 与实际安装版回归 |
| P4.2 | 完成（04:29 功能提交；04:37 平台验收） | [`c79ca5b`](https://github.com/tzuo5/attendance-handler/commit/c79ca5b) · `feat: configure and persist single and weekly classroom schedules`；测试时序修正 [`4459814`](https://github.com/tzuo5/attendance-handler/commit/4459814)； 独立页面、单次 / 每周表单、下一次与三次预览、编辑 / 暂停 / 启用 / 取消、关联删除、本机持久化；101 单测、双 renderer、构建、macOS 实际打包四组及多次重开通过；[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36843239858) 首次尝试全部通过，含实际安装版配置重开、课堂 / 恢复 / 向导与 DPAPI |
| P4.3 | 完成（05:05 提交；05:13 平台验收） | [`a352c1a`](https://github.com/tzuo5/attendance-handler/commit/a352c1a) · `feat: dispatch scheduled classrooms with durable execution claims`；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36846875578) 首次通过，[Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36846875613) 首次全部通过，包含实际安装版调度与真实 DPAPI；主进程持久领取、五秒调度、共用启动、原截止与日志；113 单测、双 renderer、25 原有集成、macOS 实际打包四组调度通过；脚本等待与模拟页面顺序失败已修正并保留 |
| P4.4 | 完成（05:32 提交；05:39 平台验收） | [`82b6546`](https://github.com/tzuo5/attendance-handler/commit/82b6546) · `feat: recover scheduled starts across clock changes and interrupted scans`；135 单测、双 renderer、macOS 实际打包六组调度 / 四组配置 / 原有 UI 通过；旧截止回拨提前结束已复现并修正；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36849699219) 与 [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36849699225) 首次全部通过，含安装版六组、真实 DPAPI 与 ZIP 一致性；实体睡眠仍待验收 |
| P5.1 | 完成（05:50 提交；05:57 回归 CI 验收） | [`f09f389`](https://github.com/tzuo5/attendance-handler/commit/f09f389) · `docs: define calendar agent intents and synthetic acceptance scenarios`；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36851633544) / [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36851633562) 首次全部通过； `@tt` 独立文本、首次绑定确认、时间 / 时区、歧义、取消和原截止语义；16 场景分组、JSON 与引用 / 时长一致性通过；没有实际日历连接或执行 |
| P5.2 | 完成（06:23 提交；06:31 回归 CI 验收） | [`8f9ddb6`](https://github.com/tzuo5/attendance-handler/commit/8f9ddb6) · `docs: compare official Google and Apple calendar access paths`；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36855068291) / [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36855068456) 首次全部通过；[官方接入调研](calendar-provider-research.md) 对比只读 Google / full access EventKit / 候选 iCloud CalDAV，授权 / 撤销、变更、重复例外、稳定身份、维护成本与推荐隔离路线；53 处本地引用和 86 文件公开审核通过；没有真实连接或授权 |
| P5.3 | 完成（06:56 提交；07:04 回归 CI 验收） | [`7ff8107`](https://github.com/tzuo5/attendance-handler/commit/7ff8107) · `docs: specify calendar instance mapping and durable execution boundaries`；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36858482170) / [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36858482158) 首次全部通过；[映射契约](calendar-mapping.md) 与 11 组 / 36 步轨迹、33 个当前 Phase 4 校验通过的任务投影；稳定身份、UTC 回拨实例、原截止 / 用户选择保护；产品日历原子领取未实现 |
| P5.4 | 完成（07:31 提交；07:39 回归 CI 验收） | [`b24a6f2`](https://github.com/tzuo5/attendance-handler/commit/b24a6f2) · `feat: add isolated calendar mapping prototype and feasibility decision`；[Source checks](https://github.com/tzuo5/attendance-handler/actions/runs/36862290281) / [Windows CI](https://github.com/tzuo5/attendance-handler/actions/runs/36862290228) 首次全部通过；[可运行样例](examples/calendar-prototype.html) 六组 / 35 次按钮点击，31 个 Phase 4 校验通过的投影；[方案决策](calendar-decision.md) 和后续实现门槛；无真实授权、持久保存或课堂调用 |

## 最终验收（07:40 起）

Phase 3、4、5 共 12 个 MVP 已逐项完成独立提交，并确认全部位于远端 main；提交时刻分布见上表。P3.4 和 P4.3 的平台验收延续到下一窗口，先完成前一检查点验证再推进，没有省略检查。最后功能提交 `b24a6f2` 于 07:39 完成源码与 Windows 首次 CI，12 项开发 / ideation 交付均在 07:40 前完成。

本轮收尾只校正计划与中英文 README 的过时进度、补齐验证证据，不新增功能。最后 CI 覆盖既有 135 单测、双 renderer、25 项 Chrome 集成、生命周期、六组后台原型、九组后台运行，以及 Windows 实际安装版调度 / 配置 / UI / 恢复 / 首次向导、DPAPI、源码 / 包审核与 ZIP 一致性。日历页面另经本机实际 HTML 的 35 次按钮操作与 31 个投影核验；CI 不证明真实日历已接入。

Phase 5 未修改生产源码、依赖、测试或工作流，HTML 不进入 App 打包。90 文件公开审核及本地文档引用检查通过。历史测试失败和修正仍保留在验证 / 各阶段记录，P3.1 的第二次通过未改写为首次成功。macOS 系统钥匙串、真实学校 / 课堂、新手真人走查、实体睡眠及日历实际授权继续待验；没有发布新下载包。后续真实日历开发仅列 C1–C5 / A1，尚未开始。

记录补充提交推送后再核对该提交的 Source checks 与 Windows CI，确认工作区和远端一致；完成后移除临时自动任务，并在核对命令后结束仅用于本轮的防闲置睡眠进程。
