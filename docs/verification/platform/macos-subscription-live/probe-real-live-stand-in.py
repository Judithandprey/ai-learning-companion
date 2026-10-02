# LINUX-HARNESS-ONLY probe helper (not part of the product or its checks).
#
# Runs the real connector code of this worktree (services.worker.connectors.chatgpt_local: main,
# _Pipes, run_stream; chatgpt_live: LiveSubscriptionBridge; services.learning.live_session; the
# released contract) with only `create_client` replaced by a stand-in client: no Codex, no network,
# no account, no model. What the stand-in's `ask` does is read from the file LC_PROBE_DIR/mode:
#   answer            completes with a fixed synthetic text
#   hold              stays in flight until it is interrupted (bounded at 30 s)
#   fail:<code>       fails after the request was written, with that inner code
#   refuse:<code>     fails before anything was written, with that inner code
# Every call is noted in LC_PROBE_DIR/log.
import asyncio, contextlib, os, sys

sys.dont_write_bytecode = True
sys.path.insert(0, "/home/agentsdock/Projects/learning-companion/wt-platform")
sys.argv = ["connector"]
DIR = os.environ["LC_PROBE_DIR"]
from services.worker.connectors import chatgpt_launch, chatgpt_local
from services.worker.connectors.chatgpt_rpc import RPCError

PNG = b"\x89PNG\r\n\x1a\n"


def note(text):
    with open(os.path.join(DIR, "log"), "a") as f:
        f.write(text + "\n")


def mode():
    try:
        return open(os.path.join(DIR, "mode")).read().strip()
    except OSError:
        return "answer"


class Client:
    def __init__(self):
        self.terminal = asyncio.Event()
        self.on_event = None
        self.submission = "not_submitted"
        self.released = asyncio.Event()

    async def start(self):
        note("client.start")

    async def connection_read_live(self):
        note("client.connection_read_live")
        return {"auth": {"state": "signed_in", "mode": "chatgpt", "plan": "stand-in-plan"},
                "quota": {"available": True, "ordinary_usage_allowed": True, "windows": [{
                    "limit_id": "stand-in-bucket", "normal_model_slug": None,
                    "primary": {"used_percent": 7, "window_duration_mins": 300, "resets_at": None}, "secondary": None,
                    "credits": None, "rate_limit_reached_type": None, "spend_control_reached": None, "individual_limit": None}]},
                "models": [{"id": "stand-in-vision", "label": "Stand-in vision", "image_input": True, "default": True}]}

    def begin_request(self, request_id):
        self.submission = "not_submitted"
        note("client.begin_request " + request_id)

    def finish_request(self, outcome):
        note("client.finish_request " + outcome)

    def request_submission(self):
        return self.submission

    async def ask(self, text, image_bytes, *, model, cancelled, send_guard):
        how = mode()
        note("client.ask mode=%s model=%s png=%s image_bytes=%d prompt_chars=%d" % (
            how, model, image_bytes[:8] == PNG, len(image_bytes), len(text)))
        if how.startswith("refuse:"):
            raise RPCError(how.split(":", 1)[1])
        send_guard("thread/start")
        send_guard("turn/start")
        self.submission = "submitted"
        if how == "hold":
            self.released.clear()
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.released.wait(), 30)
        if how.startswith("fail:"):
            raise RPCError(how.split(":", 1)[1], submission="submitted")
        if cancelled.is_set():
            raise RPCError("cancelled", submission="submitted")
        return {"text": "Stand-in text: nothing here came from a model.", "model": model,
                "thread_id": "stand-in-thread", "turn_id": "stand-in-turn"}

    async def interrupt(self):
        note("client.interrupt")
        self.released.set()
        return True

    async def close(self):
        note("client.close")
        self.terminal.set()

    def __getattr__(self, name):
        note("client." + name + " touched")
        raise AttributeError(name)


@contextlib.asynccontextmanager
async def create_client():
    yield Client()


chatgpt_launch.create_client = create_client
note("start")
code = chatgpt_local.main()
note("exit %d" % code)
sys.exit(code)
