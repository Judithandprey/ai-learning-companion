# 七角色登记与语义审计窄补

2026-09-28 UTC。起点是已推送、工作树干净的
`37456ac5f72bd11e858eed98e93ae6ea6ddae5a9`；不回退此前规范或代码。
用户本轮明确要求登记已创建的 07、实际派发一次有界风险诊断，并补两处
原目标验收。三项产品决定在 44e60ec 已采用，本次不重问或重复新建业务任务。

## 实际来源与配置核对

完整重读指定合入文件及 support-role.md、support-role-registration.json，
核对最新 state.json 和 team-state-live-metadata-refresh.json；读取七角色
额度恢复结果报告。最终读取合入文件 SHA-256 为
`cfe784f6beafe36c5c88c5cfcb32397289a55f8f78afe1746b13915eb7347a40`，
state.json 为 `8fec07040fce0a2c7b4b36004e523e793b167430180aacc0a9a6c7c3a577fa94`。
这些来自用户指定的本地 work/team-setup，而非新外部操作指令。

- 本轮 native Chats list 实际返回 backend、learning、ios、web、qa、support 六路；旧五路保留。support 使用返回的 `route_0763b88061a34dacb7d18151be41f746`，没有猜测路由或复用上轮没有的权限。
- inbox/read 实际读到 07 就绪消息 `handoff_c86e699cc58fc2e3f2ea0523f1b3782b` 与后续协调消息 `handoff_10cf1995ad8f62a179f9d2d04bf6e30a`；只据已授权范围使用。其历史 403 保留，已恢复的本轮不把历史拒绝说成成功。
- 只读核验 wt-support：`team/support`、HEAD `8b9cbef747b6b4ca04c6c72f3a17c04368cb1f2e`、状态干净。目录中的 session/worktree/model/branch 与配置记录一致；未修改该工作区。
- 两个 Ponytail SKILL 哈希均仍为 `1316a2f3f95741d2300b116fe0c2d81ce4a9568656ed0a62643f54aaf09957f2`，上游固定 e3ba2aa6；沿用完整需求优先的 LITE 覆盖，无 hooks、无收益百分比或模型降档。
- 更新机器可读目录：原六角色只改已陈旧的 effort 描述，Astra ultra／Claude ultracode；原身份、模型、目录和分支不变。新增 support 元数据，正式 role/TEAM/读取及调度说明已同步，不操作运行时模型或权限。
- 配置助手已安装的 quota 程序报告七个显式角色、83 测试、timer active/waiting，代码哈希 `3800cda5e38a1c20b41861863603ae3d82211f5968f3359e9e6a11952668b00b`。此处记录其安装证据来源，不声称总工重跑验证；本轮没有安装、运行、修改第二个恢复程序。
- 有界跨模型会诊保留：实际可用性先核实、各自提出假设、用实测判断、原 owner 集成；不因候选模型名字就宣称 Fable 可调用，不增加常驻第八角色。云 Mac 是可评估的构建资源路径，不意味着已购买／已配置／真机通过。

## 两处原目标补充

`V-CacheProvenanceLatency` 现从未预填的新课程片段测系统主动预测／选择候选、
点选前自动生成，再测随后点选；保留来源和个人状态依据、生成产物与可验证
的先后顺序。人工填 cache 或点选后生成不能通过 R12。对应 R12 追踪和
P2-01 backlog 同步，联用自主备课案例，既有测量目标未改。

`V-ExitReminderTimer` 增加不同已学习时长／会话经过的实际休息回应，以及
真实紧迫性／重要性对退出后提醒时机和强度的对照；保留实际决策、调度、
回应与依据。R20/R22 追踪和 P3-05 backlog 同步。不臆造疲劳、截止时间、
未完成事实或新硬阈值，退出／暂停／取消仍按范围生效。

原 59 个 R、46 个 A、七个 G、19 个 V、五个 INTENT 和 23 项阶段 backlog
保持；新增的是支援 SUP-01 技术研究卡，不是重复业务任务或已验收功能。
相关文档通过语义、链接／ID／元数据与 git diff --check 后正常提交；不为
本次文档更改重跑应用大套测试。原代码 37456ac 的两路 CI 已实际成功，
见 [QA-12/13 记录](qa-12-13.md)，独立 QA 与设备验收仍单列；新读到的 QA 62e5ab9 已确认两项修复，附加测试待正常审查合入。

文档检查实际通过，结果见 [checks.json](support-registration/checks.json)。有界独立文档复核确认两处案例、追踪／backlog、七角色元数据及 07 所有权边界一致；该复核未运行应用验收。

## 派发与阅读

正式文档／角色／任务提交为 **`9ce270cc747676889797199b7e8455ccfef07a5f`**。
正常 push 输出 `37456ac..9ce270c main -> main`，随后 `git ls-remote origin refs/heads/main`
与完整本地 SHA 一致。未改写历史，工作树在发送前干净。

已通过当前 native support route 实际发送一次精确 SHA 与 SUP-01 卡。
角色交付应包含实际规范阅读、技能／连接核验、六类跨模块风险的最小区分
实验、原 owner 与下一步，不重复 iOS/Web 已有能力报告。按需交付后闲置，
不循环研究或模型查额度。实际通知／阅读回执只在收到后追加，不预记成功。

以下六个回执均为 `accepted=true`、`duplicate=false`、`state=unread`、
`execution_started=false`；不是已读或执行完成。原始投递回执见
[native-notices.json](support-registration/native-notices.json)。

| 角色 | 实际消息 ID | 既有工作接续 |
| --- | --- | --- |
| Support | `handoff_9821e42804842efa185e6512b054fc82` | 首次 SUP-01，最多六项跨模块风险／最小探针路线，交付后闲置 |
| Backend | `handoff_84bccfda04803512c49a3a72c0e47cea` | 14d5a7c 已收；只核对 Learning 新增版本／INTENT 的证据关系，不重做原65例 |
| Learning | `handoff_4969a9fdd526ce8054968de32618565d` | 7da2298 已收；只对照 Backend 新 C1–C4／INTENT 接续，不重做原25例 |
| iOS | `handoff_212cdb047c2f7b7ccf04676093cc9118` | 保留 P0-11 当前报告／能力及构建路径调查 |
| Web | `handoff_4cf289193dec140ac5bd1294f341bfe6` | 8a32a8a 已收待审；保留 P0-08 接口依赖，不重复本段探针 |
| QA | `handoff_38c6f87ab7979736a1cf33b880344583` | 62e5ab9／b2c63d1／e4feafd 已收；复核 7da2298 增量，保持原独立判断 |

没有创建新业务任务、改生产所有权、切换模型或重复额度恢复程序。新版本
实际阅读报告尚待后续有用交付，不等待／轮询，不向完成回执再发确认。

既有五角色 44e60ec 通知、五个实际已读回执及后续 P0 交付仍见
[语义审计记录](requirements-semantic-audit.md)。本轮窄补不使旧回执自动证明
已读新修订；给相关 owner 的后续通知只增量说明，不重复派发原任务。


### First actual reading report for 9ce270c

iOS `handoff_055e9793db7a105dce4a4ac5150cab76` explicitly confirms reading the
relevant 9ce270c delta after its previous full relevant 44e60ec reading. Its P0-11
commit b284db1 and corrected 19-mutation count are recorded in the
[delivery triage](p0-11-delivery-review.md). Other new-version reads remain
unconfirmed at this record; no repeated acknowledgement was sent.

Backend `handoff_84475408a4b2bf6796cd6d32bafc64bc` subsequently confirms actual
9ce270c source/task/role reading, including both narrow V refinements and their
unchanged stage boundaries. Its 45b6085 consumer increment and lead static checks
are recorded in [P0-08 review inputs](../../adr/p0-08-consumer-review-inputs.md).
Thus iOS and Backend have actual new-version reading reports at this record;
other roles are not inferred read from their accepted notifications.

Learning `handoff_68513b95ab7ff15a32af4a6a8e982363` also explicitly confirms
9ce270c reading in its 53300c8 delivery; the later 45ce567 adds actual cross-review
references. iOS, Backend and Learning now have new-version reading reports.
Their design results remain distinct from product or independent QA acceptance.

QA `handoff_c11f47fe31b32f6c59efc8b61da498b0` and Support
`handoff_32978ddb6e0ab283ba855418122a642a` now explicitly confirm the actual
9ce270c reading, including R12/R20/R22 and the support registration. Five workers
(iOS, Backend, Learning, QA, Support) have reported reading this revision; Web's
specific 9ce270c reading remains unconfirmed. Support's SUP-01 report is delivered
and integrated, with six experiments still unexecuted; it is idle rather than
continuously researching. See [integration evidence](p0-review-integration.md).
