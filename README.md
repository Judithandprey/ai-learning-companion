# AI Learning Companion

用于 AI 学习伙伴的多 Agent 开发工作区。P0 已启动：当前落地公共数据契约、校验器、合成样例与固定工具链；客户端、服务和真实设备能力正在分批验证，尚未形成可日常使用的应用。

## 从哪里开始

在 AgentsDock 打开 **01 总工与集成**。已授权 P0 开发，首批任务和验收边界见任务板。

总工负责拆解、分派和集成。日常向总工描述需求即可，不必手工管理六个聊天。团队消息通路须按 `docs/verification/setup.md` 的实际验证记录使用；未验证的调度能力不能视为可用。

- [产品需求 v1.1](docs/requirements.md)：保留原 R01–R50，并入用户确认的做题陪伴增量 R51–R58，并以 R59 显式细化原有原屏幕笔记与外部归档目标。
- [做题陪伴详细规范](docs/requirements/problem-solving-companion.md)：规范性流程、过程证据、克制提示、English-first 与 G7 验证边界。
- [开发团队方案](docs/development-team.md)：原方案背景；方案中的“待创建”等描述保留原意，以实际验证记录为准。
- [团队契约](TEAM.md)：分工、边界、交接与验收。
- [任务板](docs/tasks.md)：当前准备情况与首批任务。
- [需求追踪](docs/requirements-traceability.md)：R01–R59 对应任务与 A01–A46 验收。
- [P0 能力矩阵](docs/verification/p0-matrix.md)：已测、未测与下一步证据。
- [配置验证](docs/verification/setup.md)：工作目录、会话与消息通路的验证证据。
- `docs/team-directory.json`：实际聊天 ID、模型与目录，由配置程序生成。

当前设备是 Windows、iPad 和 iPhone；尚无 Mac。用户愿意必要时购买 Mac，但尚未授权采购。先推进不依赖 Mac 的工作，同时明确原生编译与真机验证所需条件。

角色分配是初始工作安排，不代表模型能力排行。以交付质量、返工、耗时和实际用量调整。

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
