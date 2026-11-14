# -*- coding: utf-8 -*-
"""Platform hook that keeps a user-started analysis run alive on Android.

Android may freeze or kill an app's process once it leaves the foreground, which
would cut off an analysis the user just started. The app therefore runs a
foreground service with a persistent notification for as long as a run is
active (ADR-0006: only a run the user started; scheduled execution stays off).

The service lives in the Android module; this module is the Python side. It
counts active runs and tells the Java bridge (``ForegroundServiceBridge``) to
start the service when the count goes from zero to one and to stop it when the
count returns to zero.

Outside the Android app the hook does nothing: it is inert unless
``TGMS_PLATFORM=android``, and even then a missing bridge (a desktop run with
the variable set by mistake) only logs a warning. Desktop, Docker and tests
behave exactly as before.
"""

from __future__ import annotations

import functools
import logging
import threading
from typing import Any, Callable, Optional

from src.core.config_registry import is_android_platform

logger = logging.getLogger(__name__)

# Name of the Java class exposed to Python by the Android app. The app installs
# it as ``tgms_bridge`` before the backend starts; Chaquopy then makes it
# importable as a Python module of that name.
BRIDGE_MODULE = "tgms_bridge"

_lock = threading.Lock()
_active_runs = 0
_bridge: Optional[Any] = None


def _load_bridge() -> Optional[Any]:
    """Return the Java bridge, importing it once from Chaquopy on first use."""
    global _bridge
    if _bridge is not None:
        return _bridge
    try:
        import importlib

        _bridge = importlib.import_module(BRIDGE_MODULE)
    except Exception as exc:  # pragma: no cover - exercised through the fake bridge
        logger.warning(
            "[ForegroundService] Android bridge %s is unavailable: %s",
            BRIDGE_MODULE,
            exc,
        )
        return None
    return _bridge


def _call_bridge(action: str) -> None:
    """Call ``startRun``/``stopRun`` on the bridge; failures never break a run."""
    bridge = _load_bridge()
    if bridge is None:
        return
    try:
        getattr(bridge, action)()
    except Exception as exc:  # pragma: no cover - device-only failure path
        logger.warning("[ForegroundService] bridge %s failed: %s", action, exc)


def begin_run() -> None:
    """Mark a user-started run as active; starts the service on the first one."""
    if not is_android_platform():
        return
    global _active_runs
    with _lock:
        _active_runs += 1
        first = _active_runs == 1
    if first:
        _call_bridge("startRun")


def end_run() -> None:
    """Mark a run as finished; stops the service when no run remains active."""
    if not is_android_platform():
        return
    global _active_runs
    with _lock:
        if _active_runs == 0:
            return
        _active_runs -= 1
        last = _active_runs == 0
    if last:
        _call_bridge("stopRun")


def active_run_count() -> int:
    """Number of runs currently marked active."""
    with _lock:
        return _active_runs


def run_in_background(run: Callable[..., Any]) -> Callable[..., Any]:
    """Wrap a queued callable so it holds the foreground service while it runs.

    The wrapper is what the task queue submits to its thread pool, so the
    service starts when the worker picks the task up and stops when it returns,
    whether it succeeded, failed or raised. It forwards every argument the
    queue passes through to ``run``. The count is taken on the worker thread,
    which is the thread that will end the run.
    """

    @functools.wraps(run)
    def _wrapped(*args: Any, **kwargs: Any) -> Any:
        begin_run()
        try:
            return run(*args, **kwargs)
        finally:
            end_run()

    return _wrapped


def reset_for_tests() -> None:
    """Forget the cached bridge and the active count (tests only)."""
    global _active_runs, _bridge
    with _lock:
        _active_runs = 0
        _bridge = None
