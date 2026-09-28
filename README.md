# AI Learning Companion

用于 AI 学习伙伴的多 Agent 开发工作区。P0 已启动，公共契约、后台骨架、检索基线、网页探针与独立 QA 已分批集成；已知缺陷、真实连接和设备验证仍按任务板分别记录，尚未形成可日常使用的应用。

## 从哪里开始

在 AgentsDock 打开 **01 总工与集成**。已授权 P0 开发，首批任务和验收边界见任务板。

总工负责拆解、分派和集成。日常向总工描述需求即可，不必手工管理六个聊天。团队消息通路须按 `docs/verification/setup.md` 的实际验证记录使用；未验证的调度能力不能视为可用。

- [产品需求 v1.1](docs/requirements.md)：保留原 R01–R50，并入用户确认的做题陪伴增量 R51–R58，并以 R59 显式细化原有原屏幕笔记与外部归档目标。
- [做题陪伴详细规范](docs/requirements/problem-solving-companion.md)：规范性流程、过程证据、克制提示、English-first 与 G7 验证边界。
- [用户意图与决定](docs/requirements/intent-and-decisions.md)：最新笔迹／用途／整理选择和长期防失真规则；摘要仅是检索入口，不能替代原目标。
- [原目标验证](docs/requirements/original-goal-verification.md)：原 R01–R50 的直接完成证据，全部新定义仍待运行／验收。
- [开发团队历史方案](docs/development-team.md)：旧启动状态、提示词及 effort 建议已被现行 TEAM／任务板和用户决定替代，不作为运行指令。
- [团队契约](TEAM.md)：分工、边界、交接与验收。
- [任务板](docs/tasks.md)：当前 P0 状态和未派发的 P1–P4 backlog；点读探针不等于 P1 全部退出条件。
- [需求追踪](docs/requirements-traceability.md)：R01–R59 对应任务与 A01–A46 验收。
- [P0 能力矩阵](docs/verification/p0-matrix.md)：已测、未测与下一步证据。
- [配置验证](docs/verification/setup.md)：工作目录、会话与消息通路的验证证据。
- `docs/team-directory.json`：配置程序生成的身份／工作区与初始模型快照；后续明确的 effort 设置以 TEAM 记录为准，不从历史 high/xhigh 值恢复旧设置。

当前设备是 Windows、iPad 和 iPhone；尚无成功验证的 macOS/Xcode 构建路径。先推进不依赖它的工作，并评估获准的云端构建／云 Mac、签名及 TestFlight 真机路径；不以必须购买实体 Mac 作为前提。资源建议不等于已配置、已编译或真机通过，付费方案须具体审阅后再决定。

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
[后台说明](services/api/README.md)；真实 PostgreSQL 验证需独立测试 DSN，当前仍未通过。
