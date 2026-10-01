# LINUX-HARNESS-ONLY probe helper (not part of the product or its checks).
#
# Runs the real connector stream code of this worktree (services.worker.connectors.chatgpt_local:
# main, _Pipes, run_stream, parse_line, SubscriptionBridge) with only `create_client` replaced by a
# stand-in client: no Codex, no network, no account. It notes, in the file named by LC_PROBE_LOG,
# every line the stream parser is given, every request the bridge handles and every line it emits.
import asyncio, contextlib, os, sys

sys.path.insert(0, "/home/agentsdock/Projects/learning-companion/wt-platform")
sys.argv = ["connector"]
LOG = os.environ["LC_PROBE_LOG"]
from services.worker.connectors import chatgpt_launch, chatgpt_local


def note(text):
    with open(LOG, "a") as f:
        f.write(text + "\n")


class Client:
    def __init__(self):
        self.terminal = asyncio.Event()
        self.on_event = None

    async def start(self):
        return None

    async def close(self):
        note("client.close")

    async def connection_read(self):
        return {"auth": {"state": "signed_in", "mode": "chatgpt", "plan": None}, "rate_limits": None,
                "models": [{"id": "synthetic-vision", "label": "Synthetic vision", "image_input": True, "default": True}]}

    def __getattr__(self, name):
        note("client." + name + " touched")
        raise AttributeError(name)


@contextlib.asynccontextmanager
async def create_client():
    yield Client()


chatgpt_launch.create_client = create_client
real_handle = chatgpt_local.SubscriptionBridge.handle


async def handle(self, message):
    note("handled method=" + str(message.get("method")))
    return await real_handle(self, message)


chatgpt_local.SubscriptionBridge.handle = handle
real_parse = chatgpt_local.parse_line


def parse_line(raw):
    note("line bytes=%d newline=%s" % (len(raw), raw.endswith(b"\n")))
    return real_parse(raw)


chatgpt_local.parse_line = parse_line
real_emit = chatgpt_local._Pipes.emit


def emit(self, value):
    note("emit id=%r keys=%s%s" % (value.get("id"), sorted(value),
                                   " code=" + str(value["error"].get("code")) if "error" in value else ""))
    return real_emit(self, value)


chatgpt_local._Pipes.emit = emit
note("start")
sys.exit(chatgpt_local.main())
