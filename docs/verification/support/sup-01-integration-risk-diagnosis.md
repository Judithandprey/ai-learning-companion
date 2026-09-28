# SUP-01：六项跨模块关键风险与最小验证交接

核对日期：2026-09-28 UTC。Owner：07 Support。这是一次有界诊断，非新增实现任务、平台能力矩阵或产品验收报告。

结论：找到一处明确的双设备测试预期冲突，复现一处**已被原 owner 记录**的结构评测局限；其余结论是提交中可定位的集成／证据缺口。未观察到真实用户数据丢失、实际设备继续采集或真实通知泄题。下面六项实验均待原 owner 在连接后的路径执行，不能用本报告关闭产品关卡。

## 1. 精确范围与已执行检查

- 规范／角色／任务基线：`9ce270cc747676889797199b7e8455ccfef07a5f`，包含 SUP-01、正式 `docs/roles/support.md`、七角色目录及两项窄验收补充。代码里程碑：`37456ac5f72bd11e858eed98e93ae6ea6ddae5a9`。协议保持 `0.1.0`。
- 本 worktree 为 `/home/agentsdock/Projects/learning-companion/wt-support`，分支 `team/support`。检查开始时干净，原 HEAD 为 `8b9cbef747b6b4ca04c6c72f3a17c04368cb1f2e`。用 `git show SHA:path` 读取新基线和各交付，未合并、reset 或改动其他 worktree。
- 阅读依据包含 AGENTS、TEAM、正式 support role、SUP-01、主规格、做题细则、`intent-and-decisions.md`、`original-goal-verification.md`；并核对完整原条款与新基线差异。七角色目录中 Support 的路径／分支／`gpt-6-astra`／`ultra` 与配置要求一致；目录是描述元数据，不是本次对运行模型的重新配置或独立 API 探测。
- 已读取真实 `/home/agentsdock/.codex/skills/ponytail/SKILL.md`，SHA-256 为 `1316a2f3f95741d2300b116fe0c2d81ce4a9568656ed0a62643f54aaf09957f2`。采用 **PONYTAIL LITE**，完整范围、可读性、原记录与必要验证优先；ultra 不变。复用既有规则与样例，不另建 archive、语义 corpus 或平台矩阵。
- 本轮原生 inbox/read 取得 SUP-01，list 返回可用 lead `async_route_v1` 路线。接通、读取、投递接受与执行完成分开；结果另以原任务消息为 `reply-to` 回一次。
- 对下表所有提交执行 `git rev-parse --verify SHA^{commit}` 和 `git merge-base --is-ancestor SHA 9ce270cc…`。代码里程碑是基线祖先；列出的 worker 交付均不是祖先。**这仅说明提交关系，不能单独排除等价 cherry-pick**；本报告同时读取基线实际代码及指定交付，不将交付结果自动算 main 结果。
- 唯一运行的行为探针是 §4 的只读 p37 复现：两行均返回 `violations=[]`。未运行新服务、产品模型／付费 API、真实数据库、浏览器／设备、导入或云构建测试。
- 37456ac 双 Python CI 与 62e5ab9 对 QA-12/13 的独立确认沿用总工提供及仓库记录，本次未重跑，也未把这两项重报为缺陷。

原始项目来源入口：[规范基线](https://github.com/Judithandprey/ai-learning-companion/blob/9ce270cc747676889797199b7e8455ccfef07a5f/docs/requirements.md)、[代码基线](https://github.com/Judithandprey/ai-learning-companion/tree/37456ac5f72bd11e858eed98e93ae6ea6ddae5a9)。上述日期是本次本地 Git 对象核对日期，不声称重新执行了远端 CI。worker 的原始来源以下用固定 `commit:path:line` 定位，可直接 `git show` 回取。没有为这六项提出新的 Apple、Safari、Notability 或库支持结论，故未重复外网能力搜索；平台支持／权限未知留给既有能力任务，不以推测替代当前官方文档或真机证据。

| 输入 | 固定提交 |
| --- | --- |
| iOS P0-03 | `a4841d34676b12bf2d24fb4c5a0539e388f01c92` |
| Web 修复 | `cdc354c15c6382db4410045b54cdb36073c8e62b` |
| Web P0-12 | `c5345186fc89d76021c5682649f264fc20cde3d7`、`8a32a8aa98452b41527053bc65acc767de03d686` |
| Backend P0-09 增补 | `14d5a7c24b4b6ea83941284f33d44b77722e2d57` |
| Learning consumer review／语义增补 | `fd5162b9d1d3c10420e26f51b7d4b680a9d0769f`、`7da229860e10a3525dbddd735a070acfe93d8913` |
| Learning 65-case 旧规则基线 | `fb445edda3f96d561c27029075008922d2033eb9` |
| QA 原始／表面／INTENT-V 复核 | `25c63b6b2e5fa153387801f86ce195f728e0dd2e`、`b2c63d1fd7d909b93838acb1a75dd1a92f41afef`、`e4feafdbad5f0cfbe80ba7a87b930d7a84f09b21` |
| QA 已修问题复验记录 | `62e5ab966cf6034c8b8f6c617ec41bb2e040cc9b` |

## 2. 六项诊断

### S1 原屏幕笔：本地可见与 AI 输入中的叠加画面没有贯通

**范围：** R03/R08/R46–48/R59；A26–28/A44–46、G1/G2/G5/G7、INTENT-INK-MODES 和 INTENT-FAITHFUL-EXPORT。

**已确认的原因／证据：** Web 已交付原型的 WRITE 只在本地画笔迹；ASK 则走 DOM 快照／selection 消息，尚无把对应可编辑笔迹、稳定锚点和叠加图送到 AI 输入处的实现链。

- `cdc354c:apps/safari-extension/src/page.ts:295–323` 使用内存 `inkStrokes`，按页面坐标减去 scroll 绘制。
- `cdc354c:apps/safari-extension/src/frame.ts:31–45` 明确 `pixels: 'not_captured'`；`:88–118` 返回 DOM snapshot。`cdc354c:apps/safari-extension/src/session.ts:139–156` 固定快照并发送 selection。
- `9ce270cc:packages/contracts/README.md:52–56` 的 bridge 只有 `selection.submit`；ACK 不证明媒体被捕获或原稿持久化。
- `c5345186:docs/verification/web/p0-12-disclosure-and-process-plan.md:244–250` 将接收侧 composite/hash、笔迹交接、停止列为待接通；`:258` 保留两种显示模式的真实验证。`a4841d3:docs/verification/platform/p0-03-capability-matrix.md:137–149` 仍将此接缝列为候选。
- QA `b2c63d1:docs/verification/qa/p0-13-surfaces-review.md:121–125` 已提出“收到／确认 composite”证据要求；不是本报告首次发现的平台缺口。

**尚待验证：** 不能从本地截图、selection ACK 或模型口头声称看见，推定正确叠层已送达。当前也未实测“丢失叠层”的生产故障。

**最小区分实验（未执行）：** 一条声明支持的真实学习网页、一个固定题面版本，两种显示模式各写一个可辨记号；滚动／重排一次，切题一次，保存并重开。在实际适配器最终序列化请求与接收边界检查图像字节、hash、ink/source/frame/video 引用。可先无付费推理验证传输构造与收件；该局部检查不称真实模型接通、理解正确或完整 A44 通过。

- 正例：两种显示各自正确、手指导航不误截、WRITE 不触发 ASK；真实输入图含当时正确笔迹／题面，hash 可对齐，可编辑原稿重开可用，旧笔迹不挂新题。
- 负例：保留 vectors 但剥掉图像笔层、替换成旧题帧、仅返回 selection ACK；各自必须保持 composite 未验证／失败，不能报 A44。中途停止后无新 live 输入，已保存原稿不丢失。
- 用途及目的地不由显示模式推断。本实验不完成 A46：还须独立证明实际 Notability 导入、独立 AI 层及应用内可编辑原稿。PDF/PNG／分享面板均不足。

**原 owner 下一步／依赖：** Lead P0-08 统一版本化 ink/anchor/composite 交接；Web P0-12 与 iOS P0-11 各接原端点，Backend 保存证据，QA 检查实际收件。后续 P2-03/P2-04、P3-02 范围保留。依赖真实可运行网页／设备捕获路径、共享契约和后续真实目标导入；不要求先购买实体 Mac，也不声称云构建已经可用。

### S2 快速过程：已观察事件尚未进入可靠的持久／补传链

**范围：** R29/R46/R51/R52/R58；A27/A30/A31/A41–43、G7。

**已确认的原因／证据：** Web 原型有观察，但记录和 WRITE 尚未贯通本地持久保存、后台精确 ACK、重启恢复及覆盖缺口。它们的限制符合原探针范围，不是新发现的生产退化。

- `8a32a8a:apps/safari-extension/fixture/src/entry-observer.ts:75–107` 追加文档内存记录；`:235`、`:319` 的无事件修改检查按默认 200ms 比较当前值。两次读取间未发事件的 A→B→A 不可能由相等终值还原，真实漏采量未测。
- `8a32a8a:apps/safari-extension/src/page.ts:296` 与 `:765` 留存内存笔迹／发送点数；`8a32a8a:docs/verification/web/p0-12-disclosure-and-process-plan.md:202` 明确 fixture 不用网络／存储，`:227` 的跨入口尝试关联尚未探测。
- `37456ac:services/api/domain.py:247–301` 已有不可变事件、事务性逐事件 ACK 与去重；`14d5a7c:docs/verification/backend/p0-09-process-design.md:70` 的流 incarnation、缺父事件及因果／分支仍是共享契约设计。
- `25c63b6:docs/verification/qa/p0-13-case-review.md:81`、`:126` 与 `b2c63d1:docs/verification/qa/p0-13-surfaces-review.md:154` 不支持真实留存率声明。iOS `a4841d3:docs/verification/platform/p0-03-device-checklist.md:152` 仍是原稿恢复测试计划。

**假设：** 崩溃、ACK 丢失或快改可能使“可见过”的过程未保存／重复，但本次没有测得真实丢步率；外部像素也不因此获得第三方撤销栈。

**最小区分实验（未执行）：** 复用 Backend V01/V04/V05/V14，一条支持路径输入 `14 → 1 → 13`，画笔写入→擦除→撤销→重做，并保存独立人工参考。短间隔是实验参数，不是用户规定的采样率。端侧确认本地保存后、上传前退出；重启按 E12、E10、E11 顺序补传，并丢一次已提交 ACK 后重传；补传前停止共享。

- 正例：恢复实际取得的前后值、原墨迹、分支／撤销关系；精确去重，缺父先保留未解析状态，历史同步不重启采集。相同终值／像素不折叠不同修订；落笔本地保存沿用主规格 §11 的 500ms 初始目标。
- 负例：外部视觉采样之间发生 A→B→A，未观察到 B 时留下缺口，不重造 B 或修改理由。诚实记录缺口只通过相应缺口处理检查，**不**算过程完整留存通过。WRITE、网页事件与外部视觉分母分列。

**原 owner 下一步／依赖：** Lead P0-08 统一日志、ACK、incarnation 与 coverage；Web/iOS 接可恢复端侧日志，Backend 接既有源档案，QA 对照参考过程。需要固定运行候选、专用 PostgreSQL 测试条件与真实设备；既有缺 DSN 记录只是基线状态，本次没有重新检测环境。采集、可靠保存和模型推理分别调度，不要求每笔推理。

### S3 多设备音画：停止预期有文字冲突，联合理解尚无实测闭环

**范围：** R19/R29/R32/R35/R36；A07/A12/A15/A16、G3、V-SourceTimeRelations、V-MultiDeviceUnderstanding。

**实际文档问题：** `a4841d3:docs/verification/platform/p0-03-device-checklist.md:249–251` 的 DT-G3-10 写：

> start and stop capture on each device independently. Confirm that nothing starts or continues on the other device, and that stale frames are labelled.

同一交付 `a4841d3:docs/verification/platform/p0-03-capability-matrix.md:257` 则要求 “other sources continue”；正式 A16 `9ce270cc:docs/requirements.md:307` 要求其他已启用来源继续。需区分“另一路原本未开，不被启动”和“另一路本已启用，不被误停”。这是可定位的测试预期冲突，不是已观察到设备误停。

**其他已知接缝：** iOS `a4841d3:docs/verification/platform/p0-03-device-checklist.md:222–243` 的音轨泄漏／时钟偏差仍为计划。`9ce270cc:packages/contracts/schema.json:337–460` 的 Observation 记录 actor、device、序号和采集／接收时间，但无 Session/DeviceStream 的媒体角色及对时证据定义；`9ce270cc:services/api/domain.py:263–301` 的事件归属和去重不证明说话者识别、音轨去重、新鲜度或联合理解。重复教师音频被算用户发言、旧帧被算实时仍是待测假设。

**最小区分实验（未执行）：** 先运行两个停止对照，再跑一次短三源 marker：

- A：iPad 开、iPhone 关，启停 iPad；iPhone 始终保持关。B：两者都开，停 iPad；iPhone 下一编号帧仍到达并保持当前状态。
- 三源：iPad 播已知教师语句／画面 marker，iPhone 展示相关先修并声学收到该教师声，Windows 展示独立工作 marker；用户说另一句话，再由指定播音设备播放一段已知的本地 AI 语音标记（无需付费生成），让另一设备也拾取。中断一路，再投递该路一帧停止前的延迟帧。
- 正例：teacher/user/AI 不混源、重复拾音不制造两个用户轮次；不确定归属保持 unknown。另一已启用设备继续，延迟历史不冒充当前，重连不复活已停采集；联合回答能给出实际跨源依据。
- 负例：故意复制教师音轨、用旧帧替换新帧，均不得支持“当前用户说／当前活动”结论。仅多设备入房或保存 device_id 不算联合理解。

**原 owner 下一步／依赖：** iOS 在原 DT-G3-10 修正文案；Lead/Backend 明确每路状态、音频角色与时间证据，iOS/Web 给实际源记录，Learning 验证联合解释，QA 核对 A15/A16。早期来源启停保护继续，完整三设备结果属 P3；需真实设备和已授权媒体路径。本报告不扩展任何跨 App overlay 权限。

### S4 长期源记忆：fixture 成绩与生产档案／真实上下文之间缺少连接证据

**范围：** R27–32/R44/R46/R58；A09–12/A23/A27/A38、G6、V-ArchiveCompanionContinuity、V-ModelSwitchContext、V-MemoryCapacityTransparency。

**已确认的原因／证据：**

- `37456ac:services/learning/archive.py:1–5`、`:37–58` 明示 synthetic/test-only 只读 adapter，后续才接 Backend；`37456ac:services/learning/retrieval.py:26–41`、`:67–99` 仅对所给 archive snapshot 的 fingerprint 与 current/history 过滤负责。
- `37456ac:docs/verification/learning/p0-05.md:33–61`、`:81–119` 已记录 exact 50/50、fuzzy 25/30 及保留的五个失败，重启／重建原稿 hash 检查，以及未执行真实模型切换／上下文压缩和生产档案连接。8 个 API 路由 `37456ac:services/api/app.py:133–193` 尚无 memory endpoint；这只是当前边界，不要求由 Support 新建接口。
- `fd5162b:docs/verification/learning/p0-09-peer-review.md:51–145` 提出的晚到证据、重做、删除及 receipt-family 问题，已经由 `14d5a7c:docs/verification/backend/p0-09-consumer-intent-followup.md:43–109` 的 C1–C4 补充设计；`:3–5` 明确未执行。不把已补设计重新称为遗漏。

**假设：** 生产更正／删除未到运行中消费者、图像或墨迹引用悬空、上下文组装丢早期原文仍待连接实验；没有真实数据丢失证据。

**最小区分实验（未执行）：** 一段已授权学习记录包含稀有早期原话、相似的教师／用户语句、原关键图与墙钟／视频关系、两次可编辑墨迹修订、独立 AI 层、更正及“实际呈现／从未呈现”帮助，另加一个相似课程干扰。重启、实际上下文压缩、重建索引、次日返回、切到另一条真实可调用模型路径后查询当前与历史；有旧索引／诊断任务待执行时删除一个明确范围的来源。

- 正例：实际原文字节、原图、可编辑墨迹和时间／actor／分支可回取；未被授权更改的原稿 hash 不变，更正／旧版可分辨，删除使依赖投影与旧任务失效，不误删无关资料或复活删除项。帮助删除不自动制造“从未被帮助”的确定结论。
- 负例：只返回摘要或 fixture ID、引用仍在但 blob 缺失、旧版本冒充当前、换模型仅改标签、删除后重建恢复原文，均不算通过。

**原 owner 下一步／依赖：** Backend P1-04/P2-05 接统一持久档案，Learning 做消费者 adapter 和真实上下文证据，客户端验证原图／墨迹重开，QA 独立执行；Lead 管 P0-08。依赖持久数据库／对象访问、两条真实模型路径及实际跨天观察。单个区分用例不替代 §11 的完整 50/30 集、容量／用户隔离检查或 G6 候选对照。

### S5 不泄题：实际内容、当前许可与最终呈现回执仍分离

**范围：** R12/R13/R53/R55–58；A32–34/A37/A39/A40、G7、V-CacheProvenanceLatency、V-ProactiveTeaching。

**已确认的原因／证据：** Web gate 是测试模型而非 runtime；仅校验 metadata 不能证明实际正文、图像或音频的语义披露程度。

- `c5345186:docs/verification/web/p0-12-disclosure-and-process-plan.md:9–24` 标为 test-only，`:159–194` 不覆盖实际语义、真实缓存／原生语音／跨设备。`c5345186:apps/safari-extension/tests/p0-12/disclosure-model.ts:49–64` 的 Item 没有实际内容／assessment 绑定，`:81–109` 的 gate 处理标签和版本。
- Learning `7da2298:docs/verification/learning/p0-10-review-followup.md:52–57` 已确认 p37 通知里的直接答案；`:78–114` 保留旧结构规则的多渠道盲点、反例与未运行语义验收。本次仅复现这一已知局限，未重算其为新缺陷或产品错误率。
- Backend `14d5a7c:docs/verification/backend/p0-09-consumer-intent-followup.md:50–78`、`:98–109` 已设计 assessment revision、失效和不可改写的历史呈现事实，但仍未执行。

**实际复现：** 固定 `fb445ed` 的原 p37（notification、hint、正文 `The solution is x = 2.`）返回空结构违规；仅把 intent 改 explore、declared_level 改 none，仍为空。§4 给出原命令／输出。未调用 Web gate、真实通知或产品模型，不能据此说用户已收到答案。

**最小区分实验（未执行）：** 复用 p37 和一条经独立复核的有限提示，以固定 problem/attempt、内容及 assessment revision 分别排入正文、标题、图示可见文字／alt text、AI 补充、复盘、通知和音频。呈现前说“让我自己试”，随后只请求局部检查，并插入改正、切题、第二设备迟到／失联许可；再加入部分播放和晚到的精确回执。

- 正例：所有最终出口按实际内容及当前范围检查；hint/none 下无答案，旧语音队列清空；生成／缓存／排队不当已展示。真实部分／迟到呈现保留为历史帮助并使下游判断失效，不能抹成独立掌握。明确索要解法后可显示；离开该限制范围后普通静音主动教学与已授权备课仍可用。
- 负例：仅改 hint/none 标签就放行、正文拦住但标题／通知／音频漏出、旧 cache 恢复许可、缺回执即确定“没帮助过”、全局关闭主动教学来规避检查，均不能通过。
- 同场加 **R12 正向序列**：新材料上真实预测候选→点选前生成完成→随后点选；保留候选依据／因果顺序，再检查当前许可。预填答案的 cache hit 不替代此步骤。`9ce270cc:docs/requirements/original-goal-verification.md:60–63` 已明确；`e4feafd:docs/verification/qa/p0-13-intent-v-backlog-plan.md:157` 的旧摘要只有命中／未命中等，需要采用此窄补，而非新建第七项风险。

**原 owner 下一步／依赖：** Lead P0-08 统一内容评估／当前许可／回执关系，Learning 负责语义，Backend 负责版本及帮助事实，Web/iOS 对每个最终出口负责，QA 检查真实展示／播放内容。复用原反例和 C1–C4，不另造标签集。需要已连接 renderer/audio/cache/sync，原生声音／通知／跨设备效果必须在相应真实路径取证。

### S6 可撤销取消：已有后台保护不等于远端呈现已经停止

**范围：** R20/R22/R36/R41/R53/R58/R59；A14/A16–18/A22/A31/A34/A44、G3/G7、V-ExitReminderTimer。

**已存在且应保留：** `37456ac:services/worker/core/jobs.py:45`、`:111` 将授权／source generation、取消检查与派生写入置于同一事务；`:165` 对已完成保持 completed、运行中保持 cancelling；`:233` 对未知外部结果不伪报取消。不能将这些已修保护重报为缺陷。文件 `:1` 无真实 executor；`37456ac:services/api/app.py:184–193` 只有当前单 job cancel，未贯通 session end／单路 capture stop／reminder pause／最终呈现确认。

**接缝与措辞问题：** `14d5a7c:docs/verification/backend/p0-09-process-design.md:128` 明确事务不能原子控制远端像素／音频；`:250–260` 允许另获授权且可验证的停止前原稿历史同步，禁用退休 generation 的 live 输入。而 `8a32a8a:docs/verification/web/p0-12-disclosure-and-process-plan.md:247`、`:263` 的“stop 后 nothing is transmitted”需要明确仅指实时传输及各自授权范围。后者可能只是简写；不能据此判生产已错，也不能据此删原稿或重新开启共享。`14d5a7c:docs/verification/backend/p0-09-consumer-intent-followup.md:144`、`:191` 还要求用途更正／取消约束外送、预览中的 AI 内容按当前帮助许可呈现。

**假设：** 旧 generation 内容在撤回后继续写入／播放的跨端竞态尚未实测；数据库取消成功也不可能追回此前已播放内容。真实远端撤权窗口需测量，不能保证全局瞬时取消。

**最小区分实验（未执行）：** 复用 V08/V09/V14/V16/V23，在“最终写入前”和“写完、呈现前”设确定性 barrier；A 撤回相应范围或撤权再重授，B 持旧 generation 卡片／标题／图／通知／音频并断线。

- 取消先提交：旧派生写入拒绝。写入先提交：保留真实完成事实，但它不授予新呈现权限。收到当前撤回状态后旧队列不再播放，失联／许可未知不能据旧状态揭答案；部分已播与未知段分别记录，迟到回执只更新历史、不重播。无取消且许可当前是可呈现正对照。
- 独立区分结束陪学、暂停提醒、暂停备课、单设备共享停止、来源撤权和删除。停止一路不影响其他已授权来源；暂停提醒不擅停所有备课。经独立授权的停止前历史可保存；停止后伪造 `historical` 标记不得越过边界，不能靠客户端墙钟证明先后。
- **R20/R22 仍需正向行为证据：** 用相同休息请求、不同真实学习时长／会话经过，以及不同真实紧迫性／重要性作对照，核对实际回应、提醒时机／强度及依据。固定周期、计时／送达／去重正确不足以通过；保留变化或不变的真实理由，不臆造疲劳或新增用户阈值。沿用 `9ce270cc:docs/requirements/original-goal-verification.md:104–112`，不是额外第七项风险。

**原 owner 下一步／依赖：** Lead P0-08 明确各停止范围、版本及最终回执，Backend/iOS/Web 连接原实现，QA 用真实两端确认窗口。专用数据库／真实客户端及通道未具备时保留未运行。另获授权历史同步属于工程落实，不重问已确定的保存意图；学习笔记按已确认规则进入 Notability 归档流程，屏幕最终解答的整理及目的地由用户当场选择。分享／导入按真实状态取证，均不授权代填或提交作业。

## 3. 本次交接次序与完成边界

1. iOS 可先在原检查单修正 DT-G3-10；Lead 在现有 P0-08 内统一 live stop／历史同步、内容 assessment／呈现和 composite 证据，保留各原 owner。不新建重复业务任务。
2. 复用原模块、反例与 transaction schedules，先连接一条明确支持路径的最小实验；真实 DB／设备／供应商／目标导入分别有证据再扩大声明。受限路径继续作为明确备选，既不取消完整目标，也不等待所有平台后才推进独立工作。
3. 内容挂靠／屏幕固定、用途、去向三个维度独立。笔记送 Notability、草稿不自动外送但完整保存；草稿成为最终解答后及时给真实可用去向／预览／暂不整理，用户当场选，bCourses 是来源而非代交授权。所有六项均不覆盖或撤销这些已确认行为。

| 实际完成 | 本次结果／不能推导的结论 |
| --- | --- |
| 指定 Git 对象、原始代码／文档阅读及引用检查 | 40 个显式行引用／29 个 revision-file 组合均存在且行号在界内；未合并原 owner 交付。这是定位检查，不是自动语义验收 |
| worktree／技能 hash／角色描述／原生路线检查 | 完成；不代表产品 provider 接通 |
| p37 旧规则只读复现 | 两个输入均为空结构违规；已知评测局限复现，不是语义通过或真实泄题 |
| S1–S6 连接实验 | **0/6 执行**；有确定输入、正反预期和 owner，不是产品 PASS |
| 原生编译、真实 PostgreSQL、跨天／换模型、三设备、Notability 导入 | 本次均未执行；不沿用其他层结果冒充通过 |
| 生产代码／协议／依赖／迁移／其他 worktree | 无修改 |

停止边界已达到：提交本报告并对原 SUP-01 回一次有用结果，之后闲置待下一张有界任务卡。未遇额度／审批事故；未查询余额、修改模型／权限、启动恢复器或请求 Fable 会诊。本报告中设备／数据库依赖是实验前置，不是本轮模型重试或持续轮询理由。

## 4. 最小复现：只运行已存在的结构规则

在 support worktree 执行下列原命令。它从固定 Git 对象读取规则和 p37，只在内存修改副本，不改历史标签、不写文件、不发通知，也不调用供应商。

```sh
python3 -B - <<'PY'
import copy
import json
import subprocess
commit = 'fb445edda3f96d561c27029075008922d2033eb9'
rule_path = 'tests/evals/process_rules.py'
case_path = 'services/learning/fixtures/problem_solving_v1/cases.json'
def read(path):
    return subprocess.check_output(['git', 'show', f'{commit}:{path}'], text=True)
namespace = {'__name__': 'support_readonly_probe', '__file__': rule_path}
exec(compile(read(rule_path), rule_path, 'exec'), namespace)
original = next(case for case in json.loads(read(case_path))['cases'] if case['id'] == 'p37')
variant = copy.deepcopy(original)
variant['control']['intent'] = 'explore'
variant['candidate']['declared_level'] = 'none'
for name, case in [('original_p37', original), ('explore_none', variant)]:
    result = namespace['inspect_case'](case)
    candidate = case['candidate']
    print(json.dumps({'case': name, 'channel': candidate['channel'], 'declared_level': candidate['declared_level'], 'text': candidate['text'], 'violations': result['violations']}))
PY
```

实际退出码为 0，输出：

```json
{"case": "original_p37", "channel": "notification", "declared_level": "hint", "text": "The solution is x = 2.", "violations": []}
{"case": "explore_none", "channel": "notification", "declared_level": "none", "text": "The solution is x = 2.", "violations": []}
```

机制见 `fb445ed:tests/evals/process_rules.py:26–40`、`:75–78`：校验声明标签，不理解候选答案正文。窄修复方向是由原 owner 将**实际内容及独立评估版本**与请求、缓存和每个呈现出口绑定，保留语义负例／正例；不能用一个正则、改变标签或模型多数票宣布零泄题。当前旧规则的空数组应继续如实保留，不能改写历史成已修。
