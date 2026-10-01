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
| P4.2–P5.4 | 等待各自窗口 | 尚未开始 |
