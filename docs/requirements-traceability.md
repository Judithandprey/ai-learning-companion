# Requirements traceability

工程映射依据[主规格](requirements.md)、[做题细则](requirements/problem-solving-companion.md)、[用户意图与决定](requirements/intent-and-decisions.md)及[原目标验证](requirements/original-goal-verification.md)。本轮逐项替换旧 R01–R50 泛化追踪，主规格原 R/A 条款保留。规范采用与验收结果分开。

以下逐行追踪原始 R01–R50 与增量 R51–R59；行为摘要仅用于定位，不替代主规格原文和最新用户决定。`V-*` 对应 `requirements/original-goal-verification.md` 的原目标验证案例，决定 ID 对应 `requirements/intent-and-decisions.md`。阶段是工程安排；P0 前置、固定样例、设计交付和接口接通均不等于产品验收。每项区分已实现、已编译、自动检查、真实供应商连接和真机验证；按页面／App／设备／OS 记录支持、未验证、不支持及备选，采集证据另分结构化、外部视觉、混合与缺失／不确定。Gate 是依赖，不能独自证明整条需求。

P1 的全部退出项保留：Google Calendar、一次保存 URL、Canvas 可用连接、真实课程的 Safari／明确备选圈选、静音解释、真实语音追问、可用笔记本地保存、关闭及次日恢复来源和记忆；同时完成至少一条支持的 iPad 路径上的真实单题开始、自主尝试、请求帮助、复盘、保存及次日回查。P0-07 的点读→卡片→保存→恢复仅是早期集成探针。A45 备选可推进受支持单题闭环，不使 R59/A44 或 A46 全链路通过。

P1–P4 编号只引用[任务板已有的未派发 backlog](tasks.md#phase-backlog)，不构成新增派发；各行所列 QA 为独立验收责任，不能由实施者自评替代。

| 需求及必须行为 | 实施 owner；P0 前置 → 实际交付阶段 | 直接验收与必须覆盖的子场景 | 依赖 Gate | 真实状态／尚需证据 |
| --- | --- | --- | --- | --- |
| R01：iPad 主学习设备，保留 Safari、Canvas 原生 App、Pencil 和 Notability 使用位置；检测实际机型／OS，不要求改用电脑。 | iOS 主责，Web 页面入口；P0-03 能力调查、P0-02 探针 → P1 真实 iPad 路径。 对应 P1-02。 | A01–03/A12/A26；V-DailyResume 在实际 iPad 来源完成启动与返回，机型／OS／输入能力有记录，Windows 结果不能代替。 | G1/G2/G3，分别记录网页、原生与采集能力。 | 已有平台文档交付和桌面探针；原生未编译、iPad 实际学习入口未验收。 |
| R02：日常只需打开 App、说目标；首次连接后无需重复搬材料／链接，正常续期与真实撤权分别处理。 | Backend 来源连接器，iOS/Web 启动恢复，Learning 接续目标；P0-01/04 档案与鉴权骨架 → P1 日常闭环，P3 后台连接维护。 对应 P1-01/P3-08。 | A17/A23/A24；V-DailyResume：首次连接→退出→次日继续，恢复课程说明／位置／目标；一个连接失效不阻塞其他来源，需要新资料时提出具体连接需求。 | G4 真实授权刷新；G6 已存资料恢复；G1/G2 返回路径。 | URL／本地鉴权骨架存在；真实 bCourses/Calendar 续期和免重复搬运未验收。 |
| R03：优先留在原学习页面；确实受限才采用可用备选，不能默认改成独立 PDF 聊天。 | iOS/Web 交互，Lead 能力决策；P0-02/03，原位细化衔接 P0-11/12 → P1 支持路径；联动 R59。 对应 P1-02/P2-03/P3-02。 | A01–03/A44/A45/A46；原位可见可操作与备选分别验，一步进入／返回并保留课程位置；备选通过不关闭原位缺口。 | G1/G2/G7；涉及实际共享依赖 G3。 | 桌面自有页探针和平台调查不证明原生原位；各页面／App 的原位及备选真机状态仍待测。 |
| R04：用户可选模型；身份、历史、笔记和进度归本应用，换模型保持同伴连续；成本路由须保教学质量。 | Learning 模型适配，Backend 统一档案，iOS/Web 选择入口，Lead 集成；P0-01/04/05 → P1 模型选择／恢复，P3 受测分流。 对应 P1-04/P3-06/P4-02。 | A10/A20；V-ModelSwitchContext、V-EntitlementBudgetQuality：换可用模型仍关联同一目标／进度／源记录，关键歧义升级；成品路由与开发团队 Ultra 配置分开。 | G4 后端真实可用性；G6 记忆召回；质量另行同题验收。 | 统一档案与检索基线已有；成品模型选择、真实切换连续性及质量路由未验收。 |
| R05：接入已有工作 Agent，边工作边学习，保留工具和任务上下文；调整作用于真实任务。 | Web 的 Windows 端、Learning Agent 适配、Backend 事件与权限，Lead 集成；P0-01/04 仅基础 → P4 先官方 Codex，再 Claude Code。 对应 P4-01/P4-02。 | V-WorkAgentActualAction：运行中任务有据解释，授权 start/steer/pause/cancel 产生真实事件／回执；失败或未知如实，跨任务／模型不丢历史。 | G4 官方连接只是前置；跨设备依赖 G3，记忆依赖 G6。 | 工作 Agent 产品连接与实际动作未实现／未验收；开发会话登录不能作为产品完成证据。 |
| R06：可指选词、句、公式、图局部、字幕和板书，不限可选 DOM 文字。 | Web 选区、iOS 输入／画面；P0-02/03 → P1 实际课程选区。 对应 P1-02。 | A01/A02；逐项覆盖六类目标及相邻歧义对象，选区可调整，取到正确帧／局部且不要求用户手工上传。 | G1 原页面输入；G2 原生路径；G3 字幕／板书画面。 | 自有页面的文字／区域探针已有；真实字幕、视频 iframe、板书和 iPad 指选未验收。 |
| R07：识别板书、图示、公式并保存原始局部图；不把不确定 OCR 当唯一事实。 | Learning 视觉解释，iOS/Web 采集，Backend 原图存取；P0-01/03/04 来源基础 → P1 视觉链路。 对应 P1-02。 | A02/A12；模糊负号／符号、裁图和来源回取；低可信识别核对，没采到图或音轨标明范围，不编造。 | G1/G3；原生外部路径涉及 G2。 | 固定画面／来源契约可检查；实际视觉识别、原始局部采集及低可信交互未验收。 |
| R08：NAV/ASK/WRITE 显式区分；正常手指点击、滚缩、拖视频和 Pencil 书写不误触发解释，无 Pencil 时显式圈选。 | Web/iOS 输入路由；P0-02/03，P0-11/12 衔接原位与教学状态 → P1 真机输入。 对应 P1-02/P2-03/P3-02。 | A03/A26/A44；§11 的 100 组误触脚本；完成／取消 ASK 恢复前态，按钮可达，手指不被墨迹层截断；INTENT-INK-MODES 不与教学状态或内容用途绑定。 | G1/G2/G7；原位采集涉及 G3。 | 桌面模式探针及边界审查记录已有；Pencil／touch 真机未验收，不能从 pencilOnly 推定穿透正常。 |
| R09：点读和主动教学卡安静；用户主动开口才进入较快、可打断的语音讨论，保留选区。 | iOS 音频／生命周期，Learning 讨论，Web 静音卡；P0-02/03 仅探针／调查 → P1 真实语音。 对应 P1-03。 | A01/A05/A06/A29；老师音轨／其他设备播音不触发提问，不能分离时明确按住说话；打断停播及旧队列，§11 P95 ≤300 ms，语速可调。 | G3 音轨／麦克风与后台行为；G1 卡片入口。 | 静音 fixture 卡不等于语音讨论；真实识别、播音、打断和源声音分离均未验收。 |
| R10：课程播放由用户控制；选择绑定指选当时的画面，不因后续字幕／板书变化改指对象。 | iOS/Web 固定选区，Backend 时空来源；P0-01/02/04 → P1 动态课程。 对应 P1-02。 | A01/A02/A03；继续播放、倍速、拖动、滚页后旧选区仍指原帧／视频位置，新选择取得新帧；不代控所有播放器。 | G1/G3。 | 固定来源／帧校验和 fixture 锚点已有；真实视频动态变化与返回位置未验收。 |
| R11：按疑问选择文字、公式、图示或适合的可操作数学演示，不要求每次全出现。 | Learning 内容／确定性计算，iOS/Web 呈现，QA 正确性；P0-01 渲染契约前置 → P1 解释、P2 演示。 对应 P2-01。 | A19/A39；公式与课程对应，变量改变确实驱动图形、可复现，缺材料不伪造课程图；形式应帮助用户继续。 | G1/G2 展示路径；做题演示受 G7；数学正确性需独立验证。 | 尚无真实教学／互动演示验收；静态图和类型编译不能证明变量联动或教学有效。 |
| R12：预取当前及已取得相邻内容，缓存同时匹配课程、出现位置、个人理解与当前帮助许可。 | Learning 备课／缓存，Backend 来源／画像版本，iOS/Web 展示；P0-01 与 P0-08 设计前置 → P1/P2 产品，P3 后台扩大。 对应 P2-01/P3-03。 | V-CacheProvenanceLatency、A34：系统预测候选→点选前自动生成→随后点选，保存来源／候选依据及生成先于点选的证据；人工预塞或仅 cache 命中不通过 R12；同词跨章／帧／画像不误命中；改正、切题或撤回帮助后完整答案缓存不得外泄，联动 R53。 | G6 旧 note／依据召回；G7 披露；G4 材料连接。 | 共享缓存相关字段和设计不等于预生成；真实缓存质量及当前许可约束未验收。 |
| R13：未命中即时生成并如实提示；命中率、首个有效内容、完整解释延迟分别测量。 | Learning 生成与缓存，iOS/Web 状态与计时，Lead/QA 测量；P0-02 fixture 仅前置 → P1/P2。 对应 P2-01。 | V-CacheProvenanceLatency：命中／未命中和长尾分别报；沿用 §11 本地卡 P95 ≤300 ms、未命中状态 ≤150 ms、普通首个有效内容 P50 ≤3 s/P95 ≤6 s，动画不算解释。 | G1 展示路径、G4 真实生成；缓存相关 G6/G7。 | provider-unavailable fixture 行为已可观察；真实生成、命中率及端到端延迟目标均未验收。 |
| R14：课程需要、概念重要性、已有知识和讨论历史共同决定解释深度，短而够用或必要时完整展开。 | Learning 教学适配，QA 语义复核；P0-05 检索／P0-10 过程案例前置 → P1/P2。 对应 P2-01。 | A04、V-LearningProgress：同概念初见与后续关键章节改变深度并引用证据；默认短卡不能硬截关键推导，错误画像更正后生效。 | G6 历史证据；做题场景依赖 G7。 | 固定检索和教学案例不证明实际深度适配；真实课程／用户效果未验收。 |
| R15：有本课材料才断言后续用途；区分本课实际安排与一般学科关系。 | Learning 来源关联，Backend 材料版本，QA 依据检查；P0-04/05 档案前置 → P1/P2。 对应 P2-01。 | A04、V-FutureCourseEvidence：一例有已取得后续章节并引用定位，一例未取得只能讲一般关系；优先解释对之后理解有用的内容。 | G4 材料可得性；G6 来源召回。 | 来源结构／固定检索存在；取得后续材料及有据教学尚未验收。 |
| R16：解释后提供可多选深入方向；用户选择才展开，不用测验解锁继续看课。 | Learning 深入内容，iOS/Web 选择入口；P0-02 静音交互前置 → P1/P2。 对应 P2-01。 | A05：同时选直觉图／推导／例子／后续用途，按选择展开，未选不强制，保持静音并允许离开。 | G1/G2 真实交互路径；来源关联依赖 G6。 | 多选深入产品交互及真实内容未验收；普通卡片展示不能关闭该项。 |
| R17：讨论自动成为分类小 note，图文简短、可展开；同概念回顾和模糊线索可找回，AI note 默认可留本 App。 | Learning note／分类／检索，Backend 来源／版本，iOS/Web 展示；P0-04/05 → P1 保存回取、P2 自动图文和回顾。 对应 P1-05/P2-01。 | A04/A09/A19；有相似干扰材料时找原讨论／图，图式有用且正确，长内容按需展开，不强制把全部 AI note 灌入 Notability。 | G6；外部归档另依赖 G5，不能混作本项前提。 | 固定检索基线已有且保留失败；真实讨论自动成 note、跨课回顾与图文质量未验收。 |
| R18：参考成熟教学交互，复用合适的开源工具、SDK、API 和许可允许的提示词。 | 各实施 owner 提交复用证据，Lead 依赖／许可审核；随 P0–P4 模块推进。 | V-ReuseEvidence：说明解决的问题、候选来源／许可、复用边界和实际验证；产品展示能力不等于可嵌入 API，不强制从零或采用某框架。 | 对应复用模块的 Gate；无一个通用 Gate 可代替本项工程审核。 | 已有候选研究及锁定基础依赖；各后续模块仍须提交实际复用证据，未作全范围验收。 |
| R19：依据内容与当前目标判断离题并可语音提醒，不把离开课程 App 或查先修直接判为走神。 | Learning 监督判断，Backend 调度，iOS/Web/Windows 提供真实上下文；P0-03 采集边界 → P3。 对应 P3-04。 | A07/A15、V-SupervisionGoalHistory：相关查阅、真离题、过旧／未知画面分开；提醒能解释依据，探索试错不构成泄题或走神证据。 | G3 多源新鲜度；G2 平台限制；G7 做题帮助边界。 | 平台调查不是监督能力；真实内容判断、语音提醒和用户样例校准未验收。 |
| R20：休息回应参考会话情况，保存真实结束时间，到点提醒；墙钟学习时长与视频偏移分开。 | Backend 持久计时／提醒，Learning 结合会话回应，iOS/Web/Windows 展示；P0-01 时间字段前置 → P3，可有界前移最小计时。 对应 P3-05。 | A08/A22、V-ExitReminderTimer：对照已学习时长／会话经过的实际休息回应及依据；十分钟休息跨重启／设备／时区仍准确且去重；倍速不改变真实计时，暂停／完成取消待发。 | G3 会话生命周期；真实外部提醒通道依赖 G4。 | 时间契约与测试不等于产品计时器；持续计时、到点送达及重启恢复未验收。 |
| R21：切换目标时结合进度和日程讨论合理性；畏难仅作待核实假设，保留用户真实理由。 | Learning 目标推理，Backend 目标来源／更正历史；P0-04/05 数据前置 → P2/P3。 对应 P3-04。 | V-SupervisionGoalHistory、V-LearningProgress：日程紧迫／已完成／实际遇难分别处理，短问后按用户解释修正，不将推测写成心理事实。 | G4 日历来源；G6 目标／进度历史。 | 无真实目标切换策略验收；现有档案不证明合理劝说或原因判断。 |
| R22：显式退出结束实时监督；仍获授权的离线提醒按紧迫性／重要性调度，暂停提醒可独立生效。 | Backend 通道／去重／暂停，Learning 有据决定提醒时机／强度，iOS/Web 生命周期；P0-03 调查、P0-04 取消骨架 → P3。 对应 P3-05/P4-04。 | A14/A22、V-ExitReminderTimer：对照真实紧迫性／重要性驱动的退出后提醒时机／强度及调度依据，不止计时送达；普通切课、系统停共享、强退、结束会话分别测；停采集不自动重启，真实通知/SMS 送达与阅读分开，暂停取消待发。 | G3 生命周期；G4 实际通道；社交能力逐项核验。 | 无真实通知/SMS/社交通道验收；微信／抖音不可因产品愿望宣称可用，本行不授权现在发送消息。 |
| R23：督促认真、可劝说而耐心；严格程度可解释，依据用户反馈改进，不能固定羞辱。 | Learning 督促内容／体验，Backend 提醒回应历史，QA 用户样例复核；P0 仅保存来源前置 → P3。 对应 P3-04。 | V-SupervisionGoalHistory：说明具体目标和后果、给最小下一步，记住反馈并修订；不以人格标签或 AI 情绪要求服从。 | G6 历史依据；需要当前屏幕判断时依赖 G3。 | 待真实提醒样例与用户体验校准；字符串检查不能判措辞体验通过。 |
| R24：随口长期愿望持久保存，下次学习适时提起并有据评估优先级，不频繁推送模糊目标。 | Backend Goal 持久化，Learning 下次召回，iOS 续学入口；P0-04/05 基础 → P1 最小保存恢复、P3 主动策略。 对应 P1-04/P3-04。 | A13、V-SupervisionGoalHistory：随口补线代→跨天适时提起，说明与当前需要关系；不自动生成大量通知，用户更正保留历史。 | G6 目标召回；实际通知另依赖 G4。 | 源档案基线不能代替 Goal 产品流程；长期目标保存、提起与频率未验收。 |
| R25：对持续回避的重要学习耐心后续提起，记住既往提醒、回应和理由，不每次当新目标。 | Learning 督促策略，Backend 提醒／回应历史；P0-04/05 仅数据前置 → P3。 对应 P3-04。 | V-SupervisionGoalHistory，A13/A22 仅部分覆盖：跨多次会话引用旧理由、调整下一步，无回应不等于未完成，明确暂停后不继续追问。 | G6 历史检索；多设备提醒依赖 G3/G4。 | 持久提醒历史与反复回避场景未验收，不能用一次提醒成功代表完成。 |
| R26：按平台许可限制所选干扰 App；强制跳回课程须单独验证施加、解除和真实效果。 | iOS 与 Web/Windows 平台能力，Lead 范围／权限，QA 实测；P0-03 仅边界调查 → P4。 对应 P4-03。 | V-DistractionAppCapability：选定 App／范围／解除、公开权限与失败状态，限制和强制跳回分别取证；普通提醒不算 App 限制。 | G2/G3 相关平台能力；不能由屏幕共享推导系统控制。 | 未实现／未验收实际 App 限制；不可用路径保留限制说明，不假称已有系统控制。 |
| R27：后台保留实际用户／助手完整文字交互，可检索追溯；前台保持简洁，不保存模型内部思维作需求替代。 | Backend 对话／档案，Learning 检索，iOS/Web 简洁视图；P0-01/04/05 → P1/P2 真实交互。 对应 P1-04/P2-05。 | A10、V-ArchiveCompanionContinuity：真实原话／回答及来源可逐条回取，主界面不铺长流水，按需展开；多次压缩不丢早期一次性细节。 | G6 检索；实际采集链路涉及 G3。 | 固定源档案和检索检查存在；真实全量交互保存及前台体验未验收，不能用 fixture 替代实际采集。 |
| R28：有效讨论与画面形成分类 note，可快速回忆；课程进度可见，目标和记录自动管理。 | Learning note 分类／召回，Backend 进度与来源，iOS/Web 视图；P0-04/05 → P1 可见进度、P2 自动管理。 对应 P1-04/P1-05/P2-01。 | A09/A19/A24、V-LearningProgress：说模糊线索找原 note，显示有依据的进度与更新时间，无需手工打卡；进度不等于掌握。 | G6 召回；G4 日历关联来源。 | 固定检索支持基础回取；真实 note 自动管理和可见学习进度未验收。 |
| R29：保留老师话语、板书／图、用户原话和时间关系；无需连续 AV 回放不等于只存摘要。 | iOS/Web/Windows 采集，Backend 对齐，Learning 检索；P0-03/04/05 → P1 单路课堂、P3 多源。 对应 P1-03/P3-01/P3-07。 | A09/A12/A15、V-SourceTimeRelations、V-LongRunningCompanionship：倍速／拖动／跨午夜／掉线后能回正确原话和画面，教师与用户分源；未取得部分明确缺口。 | G3 时间／音画；G6 检索；试错过程依赖 G7。 | 固定多时钟样例已修复并检索；真实课音画对齐及短暂细节保留率未验收。 |
| R30：摘要和上下文压缩仅作派生，不覆盖旧原文、关键画面和笔迹；更正／明确删除另按版本和权限处理。 | Backend 不变源／版本／删除，Learning 可重建索引；P0-01/04/05 → P1/P2 真实源档案。 对应 P1-04/P2-05。 | A10/A11、V-ArchiveCompanionContinuity：大量后续学习、多次压缩、重启／换模型／重建后源校验不变；更正保留前后，删除后旧任务不能复活。 | G6；真实持久化与删除需 Backend 独立集成证据。 | 合成源保存／重建及领域删除测试已有；真实 PostgreSQL 仍缺验收条件，完整产品历史尚未验收。 |
| R31：避免很小固定记忆上限；容量、存储成本和服务边界透明，不能称无限或百分之百不忘。 | Backend 存储／用量，Lead 容量决策，iOS/Web 状态；P0 档案与成本基础 → P2/P3。 对应 P2-05/P3-07。 | V-MemoryCapacityTransparency：资料超过单次上下文且重建后仍回取；显示实测用量／边界，资源不足给选择，不静默截断最近 N 条或未经授权删除。 | G6 检索依赖；容量本身需实际存储与资源测量。 | 无产品容量透明或长数据量测量验收；固定样例数量不是产品记忆上限。 |
| R32：跨课、跨天、换模型仍是同一伙伴，身份／目标／偏好与历史连续，不依赖单个供应商线程。 | Backend 应用身份／档案，Learning 目标／偏好召回，iOS/Web 客户端；P0-01/04/05 → P1/P2 连续性、P3 多设备、P4 工作任务。 对应 P1-04/P2-05/P3-01/P4-01/P4-02。 | A10/A24/A38/A40、V-ArchiveCompanionContinuity、V-ModelSwitchContext：新模型／设备找回同一来源与当前问题，课程和工作不混源。 | G6；跨设备依赖 G3，真实模型依赖 G4。 | 独立档案设计及固定恢复基线存在；真实跨模型／课程／设备同伴连续未验收，登录同账号不足。 |
| R33：用户离线后主动读取已授权课程／公开资料，预习和备卡片／笔记，发现缺资料提出连接需求。 | Learning 备课，Backend worker／连接器，Lead 调度；P0-04 作业／预算骨架 → P3。 对应 P3-03/P3-08。 | A17/A18、V-AutonomousPreparationCycle：用户退出后按目标主动选资料、增量成果、缺口请求，材料未变复用、实时讨论优先，不重开屏幕采集。 | G4 已授权来源；G6 已有材料／成果回取。 | 任务、取消、预算骨架可检查；真实自主备课闭环和来源续期未验收。 |
| R34：以可观察的计划→执行→核查→调整→记忆实现自主性，不用“实现 AGI”作结论。 | Learning 规划／核查，Backend worker 检查点／执行，Lead 有界调度；P0-04 基础 → P3 学习、P4 工作。 对应 P3-03/P4-01。 | V-AutonomousPreparationCycle：缺材料、矛盾来源、任务失败后有据调整与恢复，有限重试、可暂停、成果可追溯；一次固定摘要不算完整循环。 | G4 可执行来源／工具；G6 成果和依据；工作另验真实动作。 | 尚无真实计划核查调整闭环；队列状态和人工派工不能替代自主执行证据。 |
| R35：iPad、iPhone、Windows 同会话独立来源，AI 联系跨屏课程、相关查阅和工作。 | iOS/iPhone、Web/Windows 采集，Backend 会话，Learning 联合理解；P0-03 风险调查 → P3，工作关联 P4。 对应 P3-01/P4-01。 | A15、V-MultiDeviceUnderstanding：三路保留清晰度、时间和来源；查先修不判离题，主麦／播音切换不重复，相关工作事件与课程分源。 | G3 联合输入；G6 历史关系；工作后端涉及 G4。 | 三设备联合感知与理解未验收；进同一媒体房间或单张拼图不是完成。 |
| R36：每设备共享独立启停，加入一台不默认采集其他台；过旧／失联源不继续充当实时。 | iOS/Web/Windows 控制，Backend 轨道权限／撤权；P0-03 与 P0-08 状态设计 → P3。 对应 P3-01/P3-05。 | A16/A31、V-ExitReminderTimer、V-MultiDeviceUnderstanding：停一台其他继续，旧帧失效，重连／补传不重启停止源，OS／轨道状态可核对。 | G3；同题许可同步依赖 G7。 | 契约取消及历史补传边界仅基础；三台真设备启停和竞态未验收。 |
| R37：先测资源瓶颈再建议更强服务器；采购意愿不等于购买授权，服务器不能解决客户端权限。 | Lead 容量决策，Backend 性能／负载测量，平台 owner 说明客户端限制；P0 成本方法 → P3 实际负载。 对应 P3-07。 | V-ResourceNeedEvidence：CPU／内存／带宽／延迟、瓶颈与改善对照，说明升级能解决和不能解决的部分；无新服务器仍推进可行工作。 | 无单一 Gate 直接证明资源需求；须关联 G3/G6 等实际负载，不拿提醒验收替代。 | 实际规模资源测量和购置建议未验收；本需求不授权采购，也不是当前全项目阻塞。 |
| R38：优先实际可用且官方允许的已购权益，不足再用授权 API；账号、输入能力、额度与费用分别核实。 | Backend 连接器／额度状态，Learning 模型／Agent 适配，Lead 选择；P0-01/04 G4 基础 → P3 路由、P4 工作后端。 对应 P3-06/P4-02。 | A17/A20/A21、V-EntitlementBudgetQuality：官方登录／刷新及真实最小输入，订阅不覆盖能力单列、未知配额不称免费，API 后备遵预算，不提取私有凭据。 | G4；质量和记忆分别依赖相关验证。 | 用户自述订阅不等于成品已核实权益；真实供应商连接／配额／多模态覆盖未验收。 |
| R39：API 初始月上限 1,000 元，预留／结算含全部调用和重试；订阅、服务器、短信费用分账，升级须用户选择。 | Backend 账本，Lead 价格／汇率版本，iOS/Web 用量状态；P0-01/04 ledger → P3 真实计费。 对应 P3-06。 | A21、V-EntitlementBudgetQuality、§11：并发不能超预留，未知价格／结果保留风险，低优先级先停，清楚展示余量和可用功能，不暗中买订阅或超支。 | G4 账号／计费通路是前置；原子预算需独立数据库验证。 | 领域预算测试及未知结果修复已有；真实 PostgreSQL 并发和付费账单对账未验收，未启用付费执行器。 |
| R40：长时间陪伴可持续保存真实变化；会话在线与昂贵推理分别调度，不能省费用就静默丢关键步骤。 | iOS/Web/Windows 生命周期，Backend 调度／保存，Learning 按需推理；P0-03/04 与 P0-08 设计 → P3。 对应 P3-06/P3-07。 | V-LongRunningCompanionship：长安静、笔迹突改、跨屏、休息、后台／短离线恢复；报告在线时长、覆盖缺口、保存率、调用／费用、功耗与延迟；时长目标待首轮测量。 | G3 实际持续采集；G7 关键试错；G4 真实调用成本。 | 无长会话实测；后台队列通过不证明长时间采集、陪伴或预算内体验。 |
| R41：允许 AI 劝说、追问和独立建议，但结束陪伴、暂停提醒、暂停备课、撤权各自按范围生效。 | Learning 策略，Backend 授权／停止／取消，iOS/Web 控制；P0-04 取消基础 → P3。 对应 P3-04/P3-05/P4-03。 | A14/A22、V-SupervisionGoalHistory、V-ExitReminderTimer：普通切课不误停，明确停止不再监督／补发，撤权竞态和跨设备重复检查；不同意建议不自动等于停止或新授权。 | G3 生命周期；G4 已授权通道；做题许可依赖 G7。 | 领域取消修复已有；完整交互与真实采集／提醒停止范围未验收，不能以“为你好”扩大控制。 |
| R42：成本优化维持接近旗舰体验，能力变化透明，不保证未经测试的等价或节省，不牺牲长期源记忆。 | Learning 路由／评测，QA 独立质量，Backend 成本；P0 价格／预算基础 → P3。 对应 P3-06/P4-02。 | A20、V-EntitlementBudgetQuality、V-MemoryCapacityTransparency；§11 至少 30 个真实课程问题同条件全旗舰对照，报重大错误／遗漏／召回／延迟／用户选择／成本，错误类别禁降级。 | G4 实际模型／费用；G6 记忆；同题教学质量另验。 | 尚未执行真实课程旗舰对照；单个升级规则或合成测试不能证明主观等价、成本收益。 |
| R43：独立网站与无 Canvas、老师或统一大纲的自学计划同等可用，不只支持正式课程。 | Backend LearningProject／来源，Learning 规划，iOS/Web 项目入口；P0-01/04/05 → P1 真实自学项目。 对应 P1-01。 | A23/A24、V-DailyResume：真实独立课程和机器人／AI 自学目标建立、保存、恢复；不强制 Canvas ID，也不凭模糊标题编造旧计划。 | G4 按需连接；G6 来源和进度恢复。 | 零 Canvas ID 结构和固定样例可用；实际独立网站／自学日常链路未验收。 |
| R44：URL 一次提供后持久归类，连材料版本、进度和旧讨论，跨周继续无需重发。 | Backend 来源／快照，Learning 关联／恢复，iOS/Web 入口；P0-01/04/05 → P1，P3 增量备课。 对应 P1-01/P1-04/P3-03/P3-08。 | A23/A10、V-DailyResume、V-AutonomousPreparationCycle：下周恢复、资料改版保留旧 note 锚点；稳定 URL 与临时签名 URL 分开，登记不等于已读正文。 | G4 实际获取；G6 旧记录回取。 | 来源登记／不可变快照与固定回取已有；真实网址抓取、跨周恢复和更新续用未验收。 |
| R45：Google Calendar 是核心来源，利用既有计划／截止时间并结合真实进度接续，不重建重复安排。 | Backend Calendar connector，Learning 目标／进度关联，iOS agenda；P0-01/04 仅契约 → P1 真实核心读取／恢复，P3 完整后台增量。 对应 P1-01/P3-08。 | A17/A24/A25、V-DailyResume、V-LearningProgress：多日历、分页／游标、重复实例、改期／取消、夏令时／全天日期；歧义短问，投影重建不删笔记目标，读取不自动授权改安排。 | G4 真实离线授权／续期；G6 项目历史关联。 | Calendar 真实连接／同步／接续尚未验收；P1 不能只用静音点读探针替代此退出项。 |
| R46：支持的原学习画面上用 Pencil 写，保存可编辑原笔迹、布局／版本及当时项目／图／视频／讨论，联动 R59。 | iOS/Web 墨迹，Backend 原稿／上下文；P0-02/03 与 P0-08/09/11/12 → P1 明示最小笔记范围、P2 完整手写链路、P3 Windows。 对应 P1-05/P2-03/P2-04/P3-02。 | A26/A27/A44/A46；INTENT-INK-MODES、INTENT-NOTE-CLASSIFICATION：随内容与固定屏幕两种显示均保存来源；显示／用途／去向独立，离线重开可编辑，改用途不删稿、不误挂新题，§11 笔划结束 500 ms 保存目标。 | G1/G2/G7 原位与输入；G3 上下文；外部全链路依赖 G5。 | NoteRevision 基础不等于真实墨迹持久化；两种显示和 iPad 原屏幕书写真机未验收，P1 若仅 AI 文本 note 不能关闭 R46。 |
| R47：AI 仅添加必要图／公式／课程裁图或短说明，独立可删；原笔迹、推导、错误与布局不被标准答案替换。 | Learning 必要补充，iOS/Web 独立层，Backend 原稿版本；P0-01/04 与 P0-08/10 设计 → P2。 对应 P2-04。 | A19/A27/A46；INTENT-FAITHFUL-EXPORT、INTENT-NOTE-CLASSIFICATION：真实课程图优先，AI 补画标源；用户原解即使有错也保留，建议／整理改动分开并可预览确认；不因标签推断批量改写。 | G6 来源依据；G7 过程／披露；完整外部笔记依赖 G5。 | 独立原稿／AI 层规则可检查；真实手写补图、忠实整理和用户接受度未验收。 |
| R48：自己的学习笔记按偏好归档 Notability，原稿仍可编辑；用途判别、完成询问和去向选择不混为一项。 | iOS 官方分享／导入，Backend ExportJob，Learning 上下文分类，Web 作业来源，QA 实际结果；P0-03 与 P0-08–13 设计 → P1 屏幕最终解答启用即提供整理询问／选择，P2 完善分类与外部笔记。 对应 P1-06/P2-04。 | A28/A46；INTENT-NOTE-CLASSIFICATION、INTENT-ANSWER-PROMPT、INTENT-HOMEWORK-CHOICE、INTENT-FAITHFUL-EXPORT：AI 按上下文识别笔记／草稿，不要求每笔先分类，拿不准短问且可纠正；草稿默认不送 Notability；最终屏幕解答完成即询问整理，完成不确定可一次短问确认，拒绝不重复；运行时提供实际可用的 Notability／作业文档／预览／暂不整理选项，关联课程／作业／题号／版本；保留原解与独立建议。 | G5 真实 Notability 导入／OneNote 回执；G4 授权作业来源；G7 原位和过程。 | 导出／导入、分类、整理询问均未验收；显示位置不决定用途或去向，草稿可形成最终解答。分享非导入，PDF/PNG 非原生笔划；OneNote 不自动替代偏好；打开 Notability 不等于获得内部文档修改 API；bCourses 是已授权来源而非自动提交目的地。 |
| R49：普通看课保留循循善诱的主动小卡和可跳过理解检查，跟踪进展而非永远被动等待。 | Learning 主动教学，iOS/Web 安静呈现，Backend 证据，QA 语义体验；P0-10 仅策略前置 → P1/P2。 对应 P2-01/P3-04。 | A29、V-ProactiveTeaching：相关概念重现／先修缺口触发有据小卡，跳过不判不会、不抢课程声音；“让我自己试”只限制该题帮助，不取消课堂教学／授权督促／备课。 | G6 相关历史；G7 做题范围；语音区分涉及 G3。 | 教学样例不能代表真实主动策略；正常看课及探索边界的独立语义／用户体验未验收。 |
| R50：分别存日程、内容进度和掌握证据；计划过／看过／自述懂／提示后完成／独立应用不混同。 | Learning 证据分类，Backend 分离状态，iOS/Web 可见进度；P0-01/05/10 → P1/P2 实际视图，P3 同步。 对应 P1-04/P2-02。 | A24/A29/A37、V-LearningProgress：日历结束或观看时长不升掌握，用户更正可追溯；新题独立应用有单独证据，网站正确反馈与 AI 帮助分源。 | G6 历史证据；G7 帮助程度；G4 日历来源。 | 固定资料／样例标签已有；真实进度视图及掌握分类尚未验收，正确选项且理由未知仍未知。 |
| R51：同题多入口过程保存稳定题面／尝试、版本、前后与分支；覆盖选择／取消／改选、文字公式、各类手写和重做。 | Lead P0-08，Backend P0-09，iOS P0-11/Web P0-12，Learning P0-10，QA P0-13；P0 设计／样例 → P1 真实单题与次日恢复，P3 跨设备。 对应 P1-06/P2-04/P3-01/P3-07。 | A30/A31/A38/A42/A43/A45；联动 R27/R29/R46/R48 与 V-LongRunningCompanionship。INTENT-INK-MODES、INTENT-NOTE-CLASSIFICATION、INTENT-ANSWER-PROMPT：显示变更／用途更正保留同题原稿，草稿成为最终解答后询问整理，不把整理请求当 AI 代答／提交。 | G7 主关卡；G3 采集，G6 回取。 | 已有 P0-09 设计和 P0-10 案例交付；新过程协议、真实多入口和完成询问未实现／未验收，网页答案／批改与用户推理须分源。 |
| R52：逐站区分结构化操作、外部视觉、混合和缺口；采不到步骤／理由就保留未知，不从最终答案补造。 | iOS P0-11/Web P0-12 采集，Lead P0-08，Backend P0-09，Learning P0-10，QA P0-13；P0 分路径计划 → P1 实测，P3 多设备。 对应 P1-06/P3-01/P3-07。 | A31/A36/A41/A42/A43/A44/A45；联动 R07/R12/R29/R40，V-SourceTimeRelations。DOM/input/change 逐站授权实测，canvas/iframe/shadow DOM/外部撤销栈不推定可读；INTENT-INK-MODES 两种显示均检验锚点与实际叠加可见。 | G7；G1/G2/G3 对应入口与采集。 | 只有文档／设计和部分桌面探针；关键步骤保留率、失联提示、两种显示的实际捕获未验收。 |
| R53：做题默认安静探索，明确“自己试”持续有效；局部检查不越界，提示按请求最低足够，明确要解法可直接给。 | Learning P0-10 策略，Lead P0-08 契约，Web P0-12/iOS P0-11 最终展示，Backend P0-09，QA P0-13；P0 案例 → P1，P3 跨设备许可。 对应 P1-06/P3-01。 | A32/A33/A34/A42/A43；联动 R08/R09/R12/R19/R41/R49。INTENT-ANSWER-PROMPT/INTENT-HOMEWORK-CHOICE 只问整理，不借完成确认透露答案；标题／图／缓存／通知／语音同限，停顿／擦除／WRITE 不授权提升帮助。 | G7；缓存和历史涉及 G6。 | 仅策略／案例，未有真实模型与最终呈现的独立防泄题验收；普通课堂主动教学仍保留。 |
| R54：复盘引用可证实偏差、有效修正及未知环节；区分观察、用户理由和推断，不因非标准解法判错。 | Learning P0-10，Backend P0-09 版本／依据，Lead P0-08，QA P0-13；P0 独立案例 → P1 有界复盘、P2 复杂分支。 对应 P1-06/P2-02。 | A35/A36/A38/A42/A43；联动 R14/R27/R30/R50。正确答案也检查推理，模糊符号／理由只最小询问，允许不回答；INTENT-FAITHFUL-EXPORT 禁止诊断覆盖原解，改正建议与用户原稿分开。 | G7 诊断；G6 源证据恢复。 | 案例与设计待独立语义复核；真实诊断及整理原稿保真未验收，不得声称找到未观察的绝对首次错误。 |
| R55：依据具体缺口给一项相关例子／演示／练习，区分自改、提示后改、跟解法和新题独立迁移；可跳过。 | Learning P0-10，Backend P0-09 帮助事实，Lead P0-08，QA P0-13；P0 标注／设计 → P2 针对性复习。 对应 P2-02。 | A37/A39/A42/A43、V-LearningProgress；联动 R17/R28/R49/R50。生成但未展示不算帮助，展示不等于理解；INTENT-NOTE-CLASSIFICATION 的笔记／草稿／最终解答用途不代表掌握等级。 | G7 帮助／教学；G6 历史缺口。 | 帮助证据设计和测试案例不等于练习有效；实际提示展示、独立迁移和用户效果未验收。 |
| R56：一次一个关键问题，短解释或可执行小步、具体反馈；可打断／跳过，演示确实联动，不硬截关键推导。 | Learning P0-10，iOS P0-11/Web P0-12，Lead P0-08，QA P0-13；P0 案例 → P1 局部帮助、P2 演示练习。 对应 P1-06/P2-01/P2-02。 | A33/A39；联动 R11/R14/R16/R49。INTENT-ANSWER-PROMPT/INTENT-HOMEWORK-CHOICE 用一次简短完成／整理询问和实际可用选项，拒绝后不反复；教学效果看能否独立继续，不保证快速学会。 | G7；真实语音打断涉及 G3。 | 轻量交互／演示和整理选择尚未验收；枚举与样例合规不证明数学联动或学习效果。 |
| R57：课程解释、提示、复盘、练习、语音和 note 持久 English-first，保留 technical terms，必要短中文；临时覆盖不重置默认。 | Backend P0-09 偏好，Learning P0-10，iOS P0-11/Web P0-12，Lead P0-08，QA P0-13；P0 设计 → P1 持久偏好、P3 跨设备。 对应 P1-06/P2-02/P3-01。 | A40、V-ModelSwitchContext；联动 R04/R09/R17/R32。中文问英文课、换模型／设备及一次中文覆盖后回归默认；INTENT-FAITHFUL-EXPORT 保留原语言和用户原解，整理不以语言偏好改写来源。 | G7 偏好／范围；G6 记录连续，真实模型依赖 G4。 | 英文 fixture 已有但持久偏好功能未验收；中文开发汇报不能视作更改教学默认。 |
| R58：跨天／模型回取同题尝试、原画面、提示和分支；诊断可更正、有版本，删除覆盖源及派生且不能重建复活。 | Backend P0-09，Learning P0-10，iOS P0-11/Web P0-12，Lead P0-08，QA P0-13；P0 设计 → P1 恢复、P2 诊断／笔记、P3 同步。 对应 P1-06/P2-02/P2-04/P2-05/P3-01。 | A30/A31/A38/A42/A43/A45/A46、V-ArchiveCompanionContinuity；联动 R27/R30/R32/R46–48。INTENT-NOTE-CLASSIFICATION、INTENT-HOMEWORK-CHOICE、INTENT-FAITHFUL-EXPORT：更正用途／去向仍保留原稿版本与原作业关联，不复活过时诊断或已删过程。 | G7/G6；外部归档状态依赖 G5。 | 原档案领域基线及新过程设计存在；真实跨模型过程恢复、分类更正和外部版本关系未验收。 |
| R59：显式落实 R03/R08/R46–48 原课堂目标：原页面可见可操作→本产品笔实时写→AI 实收叠加画面→可编辑原稿／来源→独立 AI 补充→实际 Notability 归档。 | iOS P0-11/Web P0-12 输入采集，Backend P0-09，Learning P0-10，Lead P0-08，QA P0-13；P0 能力／契约 → P1 支持路径分项、P2 A46 全链路、P3 Windows 桌面层。 对应 P1-02/P1-06/P2-03/P2-04/P3-02。 | A44/A46 联动 A26–28，A45 仅备选。INTENT-INK-MODES 两种显示、INTENT-NOTE-CLASSIFICATION 上下文用途与可更正、INTENT-ANSWER-PROMPT 完成即问、INTENT-HOMEWORK-CHOICE 运行时去向、INTENT-FAITHFUL-EXPORT 原解保真共同覆盖；三维独立，混写／草稿转最终解答／滚缩切题／停止共享逐项测，整理不授权代填提交。 | G7 主关卡；G1 网页、G2 原生、G3 叠加实收、G5 目标导入分别取证。 | 当前无原位完整链路验收；网页层、Windows P3、iPad/iPhone 原生层各有未验证／受限范围。画布／冻结／并排与分享弹窗不能计原位或导入成功；PDF/PNG 不替代应用持有的可编辑原稿。 |

## Problem-solving acceptance and evidence boundaries

The approved source supplement is identified by SHA-256
`f675e6ab00359b91263f21c896a4acd09177a1cae39a4357cc431ab0ceb705c1`.
Its adoption preserves the original requirements; see the formal product behavior
and numbered cases in the main specification and linked detailed supplement.
The following is an engineering allocation, not new acceptance results. **Every
A30–A46 row below is unimplemented and unaccepted; G7 is not passed.**

| Acceptance | Requirements | Primary implementation owners / independent QA | Evidence required / stage |
| --- | --- | --- | --- |
| A30 | R51/R52/R58 | Backend + iOS/Web; QA | Ordered attempts/branches, erased/undone originals and honest visual gaps; P0 cases, P1 real path |
| A31 | R51/R52/R58 | Backend + iOS/Web; QA | Human-reference rapid-edit/offline/page-change trace, missing intervals, idempotent replay and no restarted capture; P0 plan, P1 device test |
| A32 | R53 | Learning + iOS/Web; QA | "Let me try" persists; subsequent check stays local; actual content does not disclose the solution; P0 policy cases, P1 interaction |
| A33 | R53/R56 | Learning + iOS/Web; QA | Requested hint/solution scope across text, titles, diagrams, voice and cache; P0 independent semantic review, P1 behavior |
| A34 | R53/R51/R58 | Lead contracts + Backend + Learning + iOS/Web; QA | Attempt/intent/version-bound cache and queued-output invalidation after correction/topic change; P0 rules, P1 path, P3 cross-device |
| A35 | R54 | Learning; QA | Independently checked valid alternative method and invalid reasoning with correct final answer; P0 cases, P1 bounded diagnosis/P2 depth |
| A36 | R52/R54 | Learning + iOS/Web; QA | Ambiguous-symbol/missing-step/unknown-reason evidence, minimal optional clarification, no invented earliest error; P0 cases, P1 behavior |
| A37 | R55 | Learning + Backend; QA | Distinct self-correction, assisted completion and independent new-problem evidence; P0 labels, P2 practice/mastery |
| A38 | R54/R58 | Backend + Learning; QA | Original process plus versioned corrected diagnosis recovered after restart/model change, without reviving obsolete labels; P0 design, P1 recovery/P2 revisions |
| A39 | R55/R56 | Learning + iOS/Web; QA | Appropriate concise explanation, reproducible linked demonstration, optional practice and specific feedback; P0 plan, P2 teaching |
| A40 | R57 | Backend + Learning + iOS/Web; QA | Persistent English-first default/technical terms, scoped Chinese override, source language unchanged; P1 behavior, P3 multi-device verification |
| A41 | R51/R52 | iOS + Web; QA | Separate external-note/Safari/owned-canvas device traces with visible/lost steps, resolution, latency, power/cost and usable fallback; G7 investigation, P1 supported path |
| A42 | R51/R52/R53/R54/R55/R58 | Web + Backend + Learning; QA | Select/deselect/reselect and text/formula edits; identify user versus website answers/grading versus AI help, unknown reasons and missing DOM/canvas/iframe/shadow-root coverage; P0 cases, P1 measured path |
| A43 | R51/R52/R53/R54/R55/R58 | Backend + Learning + iOS/Web; QA | Link the same problem across website inputs/canvas, external notes, owned canvas and captured-frame drafts; preserve attempts/restarts and mark event/topic ambiguity; P0 vectors, P1 recovery, P3 cross-device |
| A44 | R59/R03/R08/R46/R52 | Web + iOS; Backend evidence; QA | Original page stays visible/operable while this product's pen writes; AI actually receives composite/available ink; scroll/zoom/source anchors and share-stop behavior verified per platform; supported webpage paths separately, Windows desktop P3, arbitrary iPad/iPhone native-app layers unverified/unsupported until measured |
| A45 | R51/R52/R58; R59 fallback boundary | iOS/Web + Backend; QA | Frozen/side-by-side drafts visibly distinguish frozen content from changed original page, retain source anchors and allow a one-step return; can support P1 single-problem loop, cannot pass R59/A44 |
| A46 | R03/R08/R46–48/R59/R58 | iOS/Web + Backend; Learning separate AI additions; QA | Lecture original-screen writing → editable original ink plus source/frame/video position → independent necessary AI layer → actual Notability share/import evidence; linked A26–28, P2 external-note delivery; no import claim from opening share sheet |

### Existing original-screen note requirements made explicit

R59/A44/A46 clarify an existing goal rather than introduce a new wish. The original
R01–R50 product clauses are retained; the rewritten rows above and these links
make their verification explicit:

| Existing requirements | Added acceptance | Owners and completion boundary |
| --- | --- | --- |
| Original-page navigation (R03/R08) | A44–46 | Web/iOS + QA; original page remains operable and normal finger actions work; a frozen or separate canvas is only a disclosed fallback |
| Editable original ink (R46) | A44/A46, linked A26–27 | iOS/Web + Backend + QA; retain editable original ink and source/frame/video anchors, and demonstrate AI visibility of live composite on the claimed path |
| Independent AI additions (R47) | A46 | Learning + iOS/Web + Backend + QA; AI adds only necessary material in an independent layer without replacing user ink |
| Notability archive (R48) | A46, linked A28 | iOS + Backend + QA; actual Notability share/import state; prepared/shared differs from imported, and rendered export does not replace the app's editable original |

All added links remain unimplemented and unaccepted. R59 has separate statuses for
supported webpage overlays, Windows original-desktop layers (P3, unverified), and
arbitrary iPad/iPhone native-app layers. Sharing a screen neither establishes an
overlay nor proves that the AI sees its ink. Unverified or unsupported paths keep
the requirement and an explicit limitation; they do not force indefinite waiting
for all platforms before other supported paths can progress.

G7 evaluates external-app visual observation and owned-canvas structured operation
history separately. A screen stream does not establish another app's complete undo
history; absence of a drop report does not establish complete capture. When the
platform cannot expose a step or its reason, preserve an explicit unknown/gap.
P1 can close one real-problem loop on one declared supported iPad path; every other
path keeps its actual limitation or untested state. Synthetic protocol tests and
desktop checks cannot establish external-app/Pencil/device support. R59/A44 adds
an independent original-screen criterion: a still-visible/operable source screen,
this product's live pen, and demonstrated AI receipt of the composite and available
strokes. An owned canvas or successful A45 frozen/side-by-side draft cannot satisfy
that criterion. A46 independently carries the original lecture-note chain through
Notability import; a visual capture alone cannot replace editable user originals.

R51/R52 cover option selection/deselection/reselection, text/formula changes,
website canvas, external notes, owned canvas, captured-frame drafts and transitions
among those entries. Keep user input, website answers/grading and AI help distinct;
unknown reasoning after a correct choice does not establish independent mastery.
Capturing user actions does not authorize the AI to fill in or submit answers.

P0-10 plans at least 30 labeled process cases, with P0-13 independent review.
Report step retention, ordering/branch accuracy, false rejection of valid methods,
unsupported diagnoses and actual semantic disclosure with denominators and failed
cases. Fixed-set targets for premature disclosure, fabricated steps and false
independent-mastery labels are zero; unexecuted checks are not zero failures.
Programmatic rules do not replace independent mathematical/semantic review or
real-user/device verification. Limited samples do not prove universal guarantees.

Teaching state remains independent of NAV/ASK/WRITE. Normal writing can preserve
authorized process without asking for help. R57 concerns product teaching and
persisted preference, not the language of engineering reports; original course
text, user quotes and handwriting keep their original language/content.

The staged scope is additive: P1 retains Calendar, persistent URL/Canvas access,
course point-reading, real voice discussion, usable local notes and next-day
source/memory recovery while adding start → independent attempts → requested help → review → save
→ next-day recovery for one real problem. P2 retains teaching/notes/external export
while adding targeted practice and assistance-aware mastery, and A46 preserves
the existing Notability share/import delivery. A45 fallback may advance P1 without
passing R59/A44. P3 separately includes Windows original-desktop annotation and retains original
multi-device/background/calendar/budget delivery while adding shared problem state
and help permissions; early Windows investigation does not establish delivery.

Existing P0 deliveries and repairs retain their task IDs; their actual integration
and remaining defects are recorded in the task board. The timestamp repair is
already integrated, while the latest Web repair awaits review. Exact incremental
baselines are supplied after each specification commit. Read
that SHA safely before bringing it into active worktrees; no reset or forced update.
Independent documents/test-only cases may proceed when dispatched. New protocol
implementation depends on the lead's future P0-08 contract/version commit;
v0.1.0 remains unchanged by adoption, and no new endpoint is claimed connected.
Earlier reading receipts certify only their recorded earlier SHA. Final content
baseline `a2567fa63cdc9c73e9902af57eabf5032a15e5a7` and the dispatched reading
baseline `e43293760c70364584cb597ae01d34a261cc52cf` are already on `origin/main`.
The earlier route-restoration turn observed successful native Chats list/inbox and five accepted async
notices extending existing P0-09–13 cards. The previous 403 is preserved in the
adoption record; it was not bypassed. Backend's actual reading report
`handoff_cafe35d65a3128bdc20ae0f1cfa06baf` confirms the dispatched `e432937`
baseline and supplies P0-09 follow-up `014d1807`. Subsequent actual final-SHA
reports from Learning, iOS, Web and QA are now recorded in
`verification/lead/requirements-v1.1-adoption.md`; all five reads are confirmed.
The backend design is integrated as 25 unexecuted vectors. Receipt/read/design
delivery does not establish implementation, semantic correctness or platform
acceptance. Original P0 module integration and remaining defects are recorded
separately in `verification/lead/p0-resume-integration.md`; G7/A30–A46 remain
unaccepted.

## 本次原目标与用户决定审计

本轮新增 19 个具名原目标验证案例和五个 INTENT 决定用例；均未运行／未验收。任务板保留原 P0 卡及 23 项未派发 P1–P4 backlog。两种笔迹显示、情境用途分类、最终解答及时询问与运行时整理去向已由用户答复明确，三个维度相互独立；不把旧 pending 当当前状态。

G7 及 A26–A28/A30–A46 联动 `INTENT-INK-MODES`、`INTENT-NOTE-CLASSIFICATION`、`INTENT-ANSWER-PROMPT`、`INTENT-HOMEWORK-CHOICE`、`INTENT-FAITHFUL-EXPORT`。完成询问与可用去向在 P1-06 的实际屏幕解答路径启用时即生效，P2-03/04 完善两种原屏幕笔和实际外部归档，P3-02 分别验证 Windows；不能借后续完整归档阶段推迟已启用路径的及时询问。详细证据见 [语义审计记录](verification/lead/requirements-semantic-audit.md)，旧基线的阅读回执不代表读过本次提交。
