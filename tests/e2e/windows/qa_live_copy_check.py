"""Run with `python -B -c <this text>` and the Backend copy as the working folder (see qa_live_ledger.liveImportCheck).

The live path the nonvoice run uses: the connector's live session (`services.worker.connectors.chatgpt_live`) and the
learning prompt (`services.learning.live_session`) load from the copy, with `packages.contracts`. Offline: no Codex, no
account, nothing sent, nothing started. Prints one JSON line: whether every project module came from the working folder.
"""
import json
import os
import sys

try:
    from services.worker.connectors import chatgpt_live, chatgpt_local  # noqa: F401
    from services.learning import live_session  # noqa: F401
    here = os.path.realpath(os.getcwd()) + os.sep
    mine = {name: os.path.realpath(module.__file__) for name, module in sys.modules.items()
            if name.split(".")[0] in ("services", "packages") and getattr(module, "__file__", None)}
    outside = sorted(name for name, path in mine.items() if not path.startswith(here))
    print(json.dumps({"ok": not outside and "services.worker.connectors.chatgpt_live" in mine and "services.learning.live_session" in mine,
                      "project_modules_loaded": len(mine), "modules_loaded_from_elsewhere": outside,
                      "live_modules": sorted(n for n in mine if n.endswith(("chatgpt_live", "live_session")))}))
except Exception as error:  # the reason is the result
    print(json.dumps({"ok": False, "error": f"{type(error).__name__}: {str(error)[:200]}"}))
