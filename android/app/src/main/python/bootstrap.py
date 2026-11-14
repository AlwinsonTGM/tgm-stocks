"""Experimental original FastAPI bootstrap; this proof must not store credentials."""
import os
import socket
import sys
import threading
import time
from pathlib import Path

_server = None

# The Loopback token is read by api.middlewares.loopback_token from this
# variable. The Android app sets it before calling start(); it is never logged.
LOOPBACK_TOKEN_ENV = "TGMS_LOOPBACK_TOKEN"

# Marks the backend as the Android feature profile (ADR-0006): the config API
# then leaves out the scheduler and image-notification settings. The Android app
# sets it before calling start(); the bootstrap sets it too so a start without
# the app's environment still gets the profile.
PLATFORM_ENV = "TGMS_PLATFORM"
ANDROID_PLATFORM = "android"


def start(files_dir):
    global _server
    if _server is not None:
        return _server[1]
    os.environ[PLATFORM_ENV] = ANDROID_PLATFORM
    root = Path(files_dir) / "repo"
    state = Path(files_dir) / "state"
    state.mkdir(parents=True, exist_ok=True)
    (state / "data").mkdir(exist_ok=True)
    (state / "logs").mkdir(exist_ok=True)
    config = state / ".env"
    if not config.exists():
        config.write_text("REPORT_LANGUAGE=en\nSCHEDULE_ENABLED=false\nSTOCK_LIST=AAPL\n", encoding="utf-8")
    os.chdir(root)
    os.environ.update({"ENV_FILE": str(config), "DATABASE_PATH": str(state / "data" / "stock_analysis.db"), "LOG_DIR": str(state / "logs"), "SCHEDULE_ENABLED": "false"})
    sys.path.insert(0, str(root))
    import uvicorn
    from api.app import create_app
    app = create_app(static_dir=root / "static")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    for _ in range(600):
        if server.started:
            _server = (server, port)
            # The port is safe to log; it lets a developer forward it with adb.
            # The token is deliberately absent from this line. print() is used
            # because Chaquopy routes stdout to logcat as python.stdout, while
            # the root logger has no handler at this point.
            print(
                "tgms.bootstrap: on-device backend listening on 127.0.0.1:%s (loopback token %s)"
                % (port, "required" if os.getenv(LOOPBACK_TOKEN_ENV) else "not set"),
                flush=True,
            )
            return port
        if not thread.is_alive():
            raise RuntimeError("ASGI server stopped before startup")
        time.sleep(0.1)
    raise RuntimeError("ASGI startup timed out")
