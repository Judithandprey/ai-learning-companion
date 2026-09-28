# 需求语义审计与正式采用记录

日期：2026-09-28 UTC。采用前 main 为 `da4bb080ab655d19583c686c33a10a1bd0afc44d`。
本次只修改文档，不回退其后的 P0 成果，不变更协议 0.1.0、代码、依赖、运行模型／effort、权限、预算或仓库公开状态。

## 依据与修复范围

用户要求全面检查并修正压缩／交接造成的需求失真，随后明确授权按完整本地合入文件修复、提交、推送并通知现有角色。已完整读取合入文件、两份独立审计及决定记录草案；审计建议按原始规格与后续实际答复核对，没有把建议直接变成新用户要求。

| 读取依据 | SHA-256／固定版本 |
| --- | --- |
| 原始 `docs/requirements.md` | `git show 9e1163b97972bf1a3ce492d271f269691db67c65:docs/requirements.md` 实际哈希为 `c764160cde78c74d7dd76a950d593ecab45b390c7d9991b4db8ed5ad7f5dc9e4` |
| `work/requirements-audit-integration.md` 最后完整读取版本 | `611e110dc155379ca9786778f81adeb591a2d2432e12d66ede42bbfe51e72386`；工作期间末尾增加运行补充，先前读到的 `ac60656…` 不是此最终版本 |
| `work/audit-learning-flow.md` | `1420893dc64061a11be0c534bfcad932530ea5b1e5004507110344773383e67d` |
| `work/audit-memory-autonomy.md` | `64a905c2bec41d66c9ff489c2c7d0c510e22326e9e4c1b94b3ab2a324ec851f1` |
| `work/audit-drafts/intent-and-decisions.md` | `0f23134906bc3d98c1e0830ac54d092cfc38f1cd1d0698f6165101f7813ffa5e`；已审阅调整为正式规范，草案状态不带入 |

以上 `work/` 位于用户本轮指定的本地审计目录；正式产品规则已进入仓库，不要求开发者依赖该外部 Windows 路径。

- 重写 R01–R50 的原泛化映射，并逐条核对 R51–R59：实际行为、owner、阶段、直接验证与未验收状态分别记录，Gate 仅作能力前置。
- 新增规范性 [19 个原目标验证案例](../../requirements/original-goal-verification.md)，涵盖真实日常续学、模型／同伴连续、工作 Agent 实际动作、缓存延迟、未来材料、监督、停止、源档案、容量、自主循环、长会话、权益质量、App 限制、资源、学习进展、主动教学和多设备理解。所有案例均未运行／未验收；沿用原 §11 数值，新增参数标工程默认。
- 新增 [决定记录](../../requirements/intent-and-decisions.md)，并同步主规格 §6–12、做题细则、G7、任务和所有角色读取入口。记录两种笔迹显示、情境用途分类、最终屏幕解答及时整理选择及原稿保真；显示／用途／目的地独立。
- 原 13 张 P0 主任务保留；补 23 项未派发 P1–P4 backlog，每项有负责人、前置和完成证据。P0-07 探针不替代 P1 Calendar、URL/Canvas 连接、真实语音、本地笔记与单题闭环。P2 仍包含 OneNote 连接器，不能因 Notability 偏好而漏掉。
- `development-team.md` 标为历史，旧启动／effort 模板不再作为现行指令；README、TEAM、AGENTS、CLAUDE 和六个角色链接规范入口。PONYTAIL LITE 不减少需求／必要测试、不改变 Astra ultra／Claude ultracode，也不代表实测节省。
- 永久保留逐项语义核对、来源回读、真实／备选分开和交接后持续推进规则；不能只用 R 原文未删或编号齐全证明需求没有缩水。

## 产品决定与运行事实

完整合入文件包含晚于初始“两个 pending”的三项实际答案：Q-INK-DISPLAY、Q-NOTE-EXPORT-SCOPE、Q-HOMEWORK-DESTINATION 均已回答；D-FINAL-ANSWER 也已明确。本组当前没有待用户再答的问题。工程实现与尚未实测的平台能力仍未确认，不能把它们变成重复询问原意。

Claude 的历史 monthly spend/session-reset 错误及旧 403 通信记录保留在[原采用记录](requirements-v1.1-adoption.md)与 [P0 恢复记录](p0-resume-integration.md)。配置助手报告用户补充额度；本轮实际收到 Web、QA 交付证明这些交付已成功，不保证未来无限可用。没有重试风暴、模型切换或采购。

本轮原生 Chats list 实际只返回既有 backend、learning、ios、web、qa 五个 worker 路由，inbox/read 正常；没有根据文档中 07 的描述越权通信或登记新角色。支持角色留待带有效路由的正常正式交接。Ponytail 两个本地技能文件哈希已核对，七角色持久规则安装范围是配置助手 manifest 的报告，不等于本轮有第六个 worker 路由。既有额度恢复程序由配置助手维护，本轮未安装／修改／运行另一个程序。

末尾新增的有界跨模型难题排查与云 Mac 建议仅记录协调边界：保留复现，由原 owner 集成并用实测判断；不宣称候选专家模型已接入。无需先买实体 Mac，但实际 macOS/Xcode、签名和设备链路仍需建立与验证；本轮没有开户、购买或配置云构建。

## 本轮实际 P0 来信

下列均由 native inbox/read 读取，未把投递或作者测试当 main 通过；精确提交存在及审查／集成分开处理。

| 来源与消息 ID | 交付及当前处理 |
| --- | --- |
| Web `handoff_e38e1c4b6e64a0f7501e23d5a4568b66` | `cdc354c15c6382db4410045b54cdb36073c8e62b`，六项 P0-02 修复回交；待 Astra 复审与总工集成，P0-12 保留 |
| Learning `handoff_1df53405404af015f49beeabb981690e` | `fd5162b9d1d3c10420e26f51b7d4b680a9d0769f`，25/25 P0-09 向量消费者审查；C1–C4 涉及八例的补充断言，0 事务执行；转现有 Backend 卡接续 |
| Backend `handoff_4bdf285f72aeb186a030e4f90a4cbc2e` | `30dc33d8b5d0bae9a108e9b6328b036622484ffa`，65/65 案例复核，32 拒绝／33 在限定合成条件保留；指出文本语义绕过结构探针，非产品通过 |
| QA `handoff_d11f00227f0b4440670f9df265db7a7e` | `4e0dff99e75e0c162e76ddaedc6907e854180edf`，对 7367c2c 的 QA-01/02 独立复测，新增 QA-12 深层 JSON 递归异常及 QA-13 过宽 OSError 捕获；混合工作树测试计数不当作精确 main 计数 |
| QA `handoff_5fd59ec910ad0b916bcee2358dd97567` | `25c63b6b2e5fa153387801f86ce195f728e0dd2e`，原 37 例语义审查及 21 行 A/G 矩阵；p29/p37 泄题、p06 缺口及标签／探针问题未解决，另 28 例待续；仍未通过 G7 |

报告中模型间判断有差异时保留原材料与分歧，做有界复现／修复，不能多数投票判真。P0-08 契约设计、真实 PostgreSQL、供应商连接、macOS/Xcode 和设备／Notability 证据缺口继续明确保留。

## 校验与采用回执

提交前执行文档结构／引用／原文保持检查及 `git diff --check`，结果、提交推送与五角色实际通知将在下列记录中补齐。仅文档修订不重复整套应用测试，不冒用历史 407 pass/13 xfail 或 CI 成功作为本轮应用验收。

文档交叉复核发现 P2 OneNote 连接器在 backlog 被弱化为普通选项；已补回原 P2-04 卡中 Backend 责任和真实读写／未知结果／重试证据。其余原目标、三维独立、P1 退出、原位备选和完整保留边界逐项核对。当前记录尚不声称最终规范已投递或被读；只有后续实际回执才能更新。

### 提交前实际文档检查

- 原始规格哈希一致；原 R01–R50/A01–A29 与 `9e1163b` 逐行一致；当前 R01–R59/A01–A46、七个 G 行及原 §11 测量条目与 `da4bb08` 一致。
- 59 条唯一行为追踪、19 个 V 定义、五个 INTENT 定义、23 个唯一阶段 backlog 与原 13 个 P0 主卡检查通过；引用的案例／阶段 ID 都有定义。
- AGENTS、TEAM、CLAUDE 和六角色共九个必读入口已链接决定及原目标验证；本地 Markdown 路径和标题／显式锚点检查无断链。
- 两个有界文档复核分别核对完整需求语义及读取／调度入口。修正 P2-04 OneNote 交付弱化、旧“review 未完成”状态，并补入已报告的有界联合排查／云构建边界；复核没有执行产品验收。
- `git diff --check` 通过。结构结果保存于 [document-checks.json](semantic-audit/document-checks.json)；检查脚本实际在 `/tmp/validate-semantic-audit.py` 执行，校验原文／ID／链接而非应用行为。未重复应用测试。

### 正式提交、推送及通知

规范提交 **`44e60ec289717e155fb0f4374784c791bf23689c`** 已正常推送 `origin/main`。
推送前 fetch 显示 main/origin 为 0/0；推送输出 `da4bb08..44e60ec`，随后
`git ls-remote origin refs/heads/main` 与本地完整 SHA 一致，工作树干净。
没有 amend 或 force push。

再次 native Chats list 仍只返回原五路由。以下五封实际 async 通知均
`accepted=true`、`duplicate=false`，即时回执为 `state=unread`、
`execution_started=false`；这不是角色已读或已经执行的证明。
原始 JSON 见 [native-notices.json](semantic-audit/native-notices.json)。

| 角色 | 实际通知消息 ID | 同一任务的下一段 |
| --- | --- | --- |
| Backend | `handoff_dde3b19ac5710e515136d7a5d17df4d3` | P0-09 接续 fd5162b 的 C1–C4 与本次决定，设计范围不改共享协议 |
| Learning | `handoff_6a874bd3db9edb6175c615e5636d9912` | 先复审 Web cdc354c 六修复，再衔接现 P0-10 的独立语义分歧 |
| iOS | `handoff_6641724e4cba96f38a6ef5ece160f943` | 保留 P0-11，两种显示／原位证据、实际去向与云构建必要条件调查 |
| Web | `handoff_aff69d6a39f7692ac51edc09a8f149c2` | 六修复待复审，保留 P0-12 当前计划与未提交工作 |
| QA | `handoff_b440dc3b1ba17db7a08e6ea333e265f9` | 继续已有 28 例独立审查；原矩阵衔接 V/INTENT，不重复旧任务 |

各通知都要求安全边界读完整精确 SHA，脏工作树可先 git show；一次实际
阅读回信报告条款及下一步。通知含原屏幕目标、三维独立、真实用户答案和
原 P0 衔接。没有联系第七角色或其他收件人，没有等待／循环确认；后续
阅读回执在收到并读取后另记。本次规范采用完成不等待全部应用功能完成。

### 已读取的本次规范回信

Web 的实际消息 `handoff_95b6c68d278cd2b92dd70363a8724c23` 回复上述通知，
由 native read 读取，明确确认 `44e60ec289717e155fb0f4374784c791bf23689c`。
它列出决定记录、相关 V 案例、任务板和角色文件，说明两种显示、三维独立、
最终解答及时选择、不自动提交及下一段 P0-12。此为实际阅读确认，不是投递回执。
当前其他四位仍不能由接收回执推断已读。Web 自报的未提交探针检查尚不作 main 验收。

通知证据提交 `22957552ade15bf0bb7e3044de7a046df65607d8` 已推送，
`git ls-remote` 与本地 SHA 一致。规范本身仍以 `44e60ec` 为读取基线。
之后 P0-06A 原始复测已正常 cherry-pick 为 `6673a3d`；它携带两个真实 QA-12
严格 xfail，历史报告保持不改。共享校验器修复另行进行，不能倒写为本次文档检查成果。
