# AI Learning Companion

用于 AI 学习伙伴的多 Agent 开发工作区。P0 已启动，公共契约、后台骨架、检索基线、网页探针与独立 QA 已分批集成；已知缺陷、真实连接和设备验证仍按任务板分别记录，尚未形成可日常使用的应用。

当前可运行的有界入口见[本地文档预览](docs/document-preview.md)：真实 UTF-8 文件、明确提问、保存自己的笔记与原文、重启后重开。AI 尚未接通；这是桌面自有页面备选，不是原课程页面或 iPad 全功能应用。具体集成与验收状态见该页。

## 从哪里开始

在 AgentsDock 打开 **01 总工与集成**。已授权 P0 开发，首批任务和验收边界见任务板。

总工负责拆解、分派和集成。日常向总工描述需求即可，不必手工管理六个聊天。团队消息通路须按 `docs/verification/setup.md` 的实际验证记录使用；未验证的调度能力不能视为可用。

- [产品需求 v1.1](docs/requirements.md)：保留原 R01–R50，并入用户确认的做题陪伴增量 R51–R58，并以 R59 显式细化原有原屏幕笔记与外部归档目标。
- [English working specifications](docs/requirements/english-working-policy.md)：四份完整英文工作译稿、原文与版本依据；技术交接采用忠实英文，中文原稿及产品要求保留。
- [做题陪伴详细规范](docs/requirements/problem-solving-companion.md)：规范性流程、过程证据、克制提示、English-first 与 G7 验证边界。
- [用户意图与决定](docs/requirements/intent-and-decisions.md)：最新笔迹／用途／整理选择和长期防失真规则；摘要仅是检索入口，不能替代原目标。
- [原目标验证](docs/requirements/original-goal-verification.md)：原 R01–R50 的直接完成证据，全部新定义仍待运行／验收。
- [开发团队历史方案](docs/development-team.md)：旧启动状态、提示词及 effort 建议已被现行 TEAM／任务板和用户决定替代，不作为运行指令。
- [团队契约](TEAM.md)：分工、边界、交接与验收。
- [任务板](docs/tasks.md)：当前 P0 状态和未派发的 P1–P4 backlog；点读探针不等于 P1 全部退出条件。
- [需求追踪](docs/requirements-traceability.md)：累计 R01–R60 对应任务与 A01–A49 验收。
- [P0 能力矩阵](docs/verification/p0-matrix.md)：已测、未测与下一步证据。
- [配置验证](docs/verification/setup.md)：工作目录、会话与消息通路的验证证据。
- `docs/team-directory.json`：七个角色的身份／工作区及已同步的 Astra ultra／Claude ultracode 描述值；实际运行变更仍由明确授权控制，文档不重配置会话。

当前设备是 Windows、iPad 和 iPhone；已有成功验证的托管 macOS/Xcode 构建路径，CompanionInk 的设备与模拟器版本已编译并核对产物，实际运行另行验收。见[iPad 交付证据](docs/verification/lead/ipad-delivery-split.md)。编译成功不等于安装、Pencil 或原屏幕通过；签名、真机及付费资源仍按各自边界处理，不以购买实体 Mac 作为前提。

[07 支援角色](docs/roles/support.md)按总工的有界任务诊断、研究和准备最小探针，交付后闲置；不常驻检查额度、不接管原负责人或新增常驻角色。

角色分配是初始工作安排，不代表模型能力排行。以交付质量、返工、耗时和实际用量调整。

开发团队保持 Astra `ultra` / Claude `ultracode`；按[TEAM 的 PONYTAIL LITE 规则](TEAM.md#ponytail-lite-project-policy)复用已有能力、避免多余复杂度，完整需求、源记忆、必要验证与审批边界不变。成品模型分流另按 R04/R42 实测，不能拿开发风格或上游 benchmark 宣称本项目已省多少成本。

## 本地 P0 检查

需要 Python 3.12–3.14、uv 与 Node 24.21.0。Linux x64 可用以下辅助脚本把校验过的 Node 安装到项目 `.tools`，不改全局安装：

```sh
uv sync --frozen --extra backend --group backend-test
python3 scripts/bootstrap_node.py
export PATH="$PWD/.tools/node-v24.21.0-linux-x64/bin:$PATH"
npm ci --ignore-scripts
bash scripts/check.sh
```

Node 已存在时跳过 bootstrap。其他平台从 Node 官方安装对应版本。
检查不启动服务，不需要密钥，不调用模型 API。共享格式与持久化职责见
[契约说明](packages/contracts/README.md)。本地套件覆盖契约、后台内存事务、检索和网页探针，
已知失败以严格 xfail 保留，不能据此宣布完整验收。数据库迁移与回滚步骤见
[后台说明](services/api/README.md)。已有独立测试库上的真实 PostgreSQL/API 重启及浏览器保存重开证据，具体范围与未解决项见[集成记录](docs/verification/lead/p0-recovered-deliveries.md)；这不代表生产数据库或整个应用通过验收。
