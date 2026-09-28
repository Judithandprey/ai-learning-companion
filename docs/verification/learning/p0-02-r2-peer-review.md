# P0-02 第二轮独立复核

2026-09-28，learning。审查对象 `cdc354c15c6382db4410045b54cdb36073c8e62b`，
对照原交付 `127bd4cb4cb505edf791c5f386bda905dcf1369b` 与
[首轮六项发现](p0-02-peer-review.md)。规范实际读取
`44e60ec289717e155fb0f4374784c791bf23689c` 的主需求、决定记录、19 项原目标验证、
追踪表、任务卡、TEAM、AGENTS 和 learning 角色文件；以 `git show` 读取，不合并/重置。
按项目 PONYTAIL LITE，复用已锁定工具与原反例，不增加依赖。

结论：**原 F1–F6 在此固定探针范围内均可关闭**。类型检查、构建、48 个具名单元测试，
以及下列独立反例/边界检查通过。这个结论不批准真实扩展鉴权、产品教学、G1/G7 或真机体验。
只写本目录；被审 web 代码在 `/tmp` 精确导出，未修改。

## 六项复核

| 项 | 代码依据（目标提交 apps/safari-extension/src） | 本轮实际结果 |
| --- | --- | --- |
| F1 | `page.ts:738` 在处理 pendingText 前处理 pointercancel | mouse down→cancel：0 请求、卡片隐藏、ASK 保持；pen cancel 与双 touch 中断仍各为 0 请求 |
| F2 | `page.ts:456` 的当前 ASK/epoch 接受 ask_done；`page.ts:471` 核对完成 frame、epoch 并消费一次 | NAV、WRITE、取消后均不能出现卡；合法完成后错 frame、错 epoch、第二张卡均拒绝；新的 ASK、关闭卡及 frame 取消均使原授权不可使用 |
| F3 | `dom-capture.ts:296` 同步保存 MarkState；`page.ts:653` confirm 只从该状态构造 snapshot | 标记时 change of basis/v1/10 秒；确认时页面已 new board/v2/25 秒，输出仍是旧正文/v1/10 秒；单元另核对原字幕、时间、上下文及移出区域为空 |
| F4 | `page.ts:565` 保存 presentGen，最后一个 await 后再次核对；新 ASK/关闭卡更新 generation | 延迟桥 A 后 B，先答 B 再 A：卡仍为 eigenvector；A 记录 presented=false；关闭后到达的答复也不呈现 |
| F5 | `frame.ts:96` 验证 payload 的 UTC captured_at，`frame.ts:107` 复制；`session.ts:138` 提前取 selection.created_at | 延迟摘要时钟从 08:00:00 到 08:00:10，frame 仍为 08:00:00；单元检查 selection 时间也不受 hash 延迟移动 |
| F6 | `fixture-data.ts:37` 使用 Av=λv，并分别说明负 λ 和零 λ | 复核 diag(λ,2)、v=(1,0)，λ=-1/0/2：反向/零向量/同向；文本与这三种情形一致，不再声称方向永不变 |

F2 的合法 frame 流程会先结束 ASK、恢复原输入模式，再显示该次卡。这不代表进入 NAV 后所有卡都应拒绝，
关键是仍有本次已完成 ASK 的一次性关联。这里的关联**不是来源鉴权**：获准 origin 的子 frame 页面脚本
仍可在一个 live ASK 中伪造 ask_done/card。代码只输出本地精确匹配 fixture 或 unavailable，
没有接受任意远端答案。生产扩展仍需通过 background/frameId 等真实扩展通信核验来源和请求；
本轮修复文档已准确撤回首轮的过强防伪声明。

F3 证明被测试的同步 DOM 状态来自同一标记时刻，不证明视频像素已采到、任意页面可读、
重排后高亮仍精确，或原位墨迹进入 AI 输入。MarkState 仅缓存可见词和 DOM 媒体状态，pixels 仍是 not_captured。
数学公式、复杂编辑器、真实跨域视频和真机能力仍须对应任务取证。

## 实际执行与已有证据

- 只读使用主仓库 Node 24.21.0 / TypeScript 7.0.2，以及现有 `.venv`；未安装、未启动服务、未调用模型。
- `env -u BROWSER bash apps/safari-extension/scripts/check.sh`：类型检查和 build 通过。
  当前环境 `node --test` 仅报告 7 个文件包装项，因此额外直接 import 各测试模块：**48 个具名测试通过**。
- [独立复现脚本](p0-02-r2-peer-probes.mjs) / [实际输出](p0-02-r2-peer-results.json)：
  原导出 page handler + 最小 DOM/event doubles，15 组结果。它不是浏览器输入路由、像素或真实 native ACK 的测试。
- `validate_evidence.py` 对目标提交 r2-edge-selftest.json 的 14 个请求对象及 capabilities.json 的 20 行校验通过。
  这只是契约校验；selftest 顶层计数 13 另加一个子 frame 请求，不把 14 当成本轮浏览器执行数。
- 已读取 web 的 r2-counterexamples.json 和对应测试实现：逐项移除修复后，F1–F4 的相应浏览器自测失败，
  F5 两个单元失败，F6 一个单元失败。该 mutation 实验是 web 已保存证据，本轮未重新运行浏览器 mutation。
- 已读取 r2-edge-selftest 的 46/46，以及 r2-edge-trusted 的 37 通过、2 不可验证、3 环境控制行。
  它们是 web 先前的桌面 Edge 记录，本轮不宣称重新执行；touch scroll/pinch 不能标通过。

第一次移植旧复现脚本时，helpers.snapshot 忽略了不支持的 captured_at 参数，导致输出打印的 snapshotAt
与真正输入不符；本轮复现脚本已改为显式覆盖 payload.captured_at，再运行通过并保存实际输入/输出。
没有以那次设置错误作为产品发现。

## 重现

在 learning worktree 用 Python 标准库导出固定对象；只生成临时目录：

```sh
python3 - <<'PY'
from pathlib import Path
import subprocess, tempfile
p = Path(tempfile.mkdtemp(prefix='learning-p002-r2-'))
sha = 'cdc354c15c6382db4410045b54cdb36073c8e62b'
archive = subprocess.check_output(['git', 'archive', sha, 'package.json', 'apps/safari-extension', 'packages/contracts', 'docs/verification/web'])
subprocess.run(['tar', '-x', '-C', str(p)], input=archive, check=True)
(p/'r2-peer-probes.mjs').write_bytes(Path('docs/verification/learning/p0-02-r2-peer-probes.mjs').read_bytes())
print(p)
PY
```

进入打印目录后执行（本次目录 `/tmp/learning-p002-r2-9mqqzpjw`）：

```sh
env -u BROWSER bash apps/safari-extension/scripts/check.sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --input-type=module -e "import { readdir } from 'node:fs/promises'; for (const f of (await readdir('./apps/safari-extension/tests')).filter(f => f.endsWith('.test.ts')).sort()) await import('./apps/safari-extension/tests/'+f);"
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node r2-peer-probes.mjs
PYTHONPATH=. /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python apps/safari-extension/scripts/validate_evidence.py docs/verification/web/evidence/r2-edge-selftest.json docs/verification/web/capabilities.json
```

原始 module 文件与目标 Git 对象逐字节一致，数量和脚本 SHA-256 记录在实际输出中。
仍未验证：iPad Safari、Pencil、打包扩展、真实 native bridge/持久化、课程/视频像素、模型及新 INTENT 五用例。
19 项原目标和 INTENT 用例均不能由本次六项修复复核变成验收通过。
