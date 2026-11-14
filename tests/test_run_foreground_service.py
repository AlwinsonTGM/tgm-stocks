# -*- coding: utf-8 -*-
"""The Android foreground-service hook (ticket 04).

The hook is the Python half of the foreground service: it counts active runs
and calls ``startRun()``/``stopRun()`` on the Java bridge. These tests drive it
with a fake bridge and assert what the bridge observes, plus the seam it is
wired to: the task queue starts the service when a task is accepted and stops
it when the queue has no active task left.
"""

from __future__ import annotations

import sys
import threading
import types
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.core.config_registry import ANDROID_PLATFORM_ENV, ANDROID_PLATFORM_VALUE
from src.services import run_foreground_service as hook
from src.services.task_queue import AnalysisTaskQueue


class FakeBridge:
    """Records the calls the Java bridge would receive."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def startRun(self) -> None:  # noqa: N802 - mirrors the Java method name
        self.calls.append("start")

    def stopRun(self) -> None:  # noqa: N802 - mirrors the Java method name
        self.calls.append("stop")


@pytest.fixture
def bridge(monkeypatch):
    fake = FakeBridge()
    module = types.ModuleType(hook.BRIDGE_MODULE)
    module.startRun = fake.startRun
    module.stopRun = fake.stopRun
    monkeypatch.setitem(sys.modules, hook.BRIDGE_MODULE, module)
    monkeypatch.setenv(ANDROID_PLATFORM_ENV, ANDROID_PLATFORM_VALUE)
    hook.reset_for_tests()
    yield fake
    hook.reset_for_tests()


@pytest.fixture
def queue(monkeypatch):
    """A fresh task queue whose analysis run is a controllable fake."""
    original = AnalysisTaskQueue._instance
    AnalysisTaskQueue._instance = None
    created = AnalysisTaskQueue(max_workers=2)
    yield created
    created.shutdown()
    AnalysisTaskQueue._instance = original


def _service_class(analyze_stock):
    """Build a stand-in for ``src.services.analysis_service.AnalysisService``."""

    class AnalysisService:
        last_error = None

        def __init__(self) -> None:
            pass

    AnalysisService.analyze_stock = analyze_stock
    return AnalysisService


def _fake_analysis(monkeypatch, *, gate: threading.Event | None = None, result=None):
    """Replace AnalysisService.analyze_stock with a fast in-process fake."""
    calls: list[str] = []

    def analyze_stock(self, stock_code, **kwargs):
        calls.append(stock_code)
        if gate is not None:
            assert gate.wait(timeout=10)
        return result if result is not None else {
            "stock_code": stock_code,
            "stock_name": "Fake",
            "report": {},
        }

    service_module = types.ModuleType("src.services.analysis_service")
    service_module.AnalysisService = _service_class(analyze_stock)
    monkeypatch.setitem(sys.modules, "src.services.analysis_service", service_module)
    return calls


def test_start_fires_once_per_run_and_stop_when_count_returns_to_zero(bridge):
    hook.begin_run()
    hook.begin_run()
    assert bridge.calls == ["start"]

    hook.end_run()
    assert bridge.calls == ["start"]

    hook.end_run()
    assert bridge.calls == ["start", "stop"]
    assert hook.active_run_count() == 0


def test_end_run_without_active_run_does_not_stop(bridge):
    hook.end_run()

    assert bridge.calls == []
    assert hook.active_run_count() == 0


def test_nothing_fires_when_platform_flag_is_unset(monkeypatch):
    fake = FakeBridge()
    module = types.ModuleType(hook.BRIDGE_MODULE)
    module.startRun = fake.startRun
    module.stopRun = fake.stopRun
    monkeypatch.setitem(sys.modules, hook.BRIDGE_MODULE, module)
    monkeypatch.delenv(ANDROID_PLATFORM_ENV, raising=False)
    hook.reset_for_tests()

    hook.begin_run()
    hook.end_run()

    assert fake.calls == []
    assert hook.active_run_count() == 0


def test_nothing_fires_for_a_non_android_platform_value(monkeypatch):
    fake = FakeBridge()
    module = types.ModuleType(hook.BRIDGE_MODULE)
    module.startRun = fake.startRun
    module.stopRun = fake.stopRun
    monkeypatch.setitem(sys.modules, hook.BRIDGE_MODULE, module)
    monkeypatch.setenv(ANDROID_PLATFORM_ENV, "desktop")
    hook.reset_for_tests()

    hook.begin_run()
    hook.end_run()

    assert fake.calls == []


def test_missing_bridge_does_not_break_the_run(monkeypatch):
    monkeypatch.setenv(ANDROID_PLATFORM_ENV, ANDROID_PLATFORM_VALUE)
    monkeypatch.delitem(sys.modules, hook.BRIDGE_MODULE, raising=False)
    hook.reset_for_tests()

    hook.begin_run()
    hook.end_run()

    assert hook.active_run_count() == 0


def test_bridge_failure_does_not_break_the_run(bridge):
    def explode() -> None:
        raise RuntimeError("service refused")

    bridge.startRun = explode

    hook.begin_run()
    hook.end_run()

    assert hook.active_run_count() == 0


def test_run_in_background_holds_the_run_while_the_callable_runs(bridge):
    seen: list[int] = []

    def work():
        seen.append(hook.active_run_count())
        return "done"

    assert hook.run_in_background(work)() == "done"

    assert seen == [1]
    assert bridge.calls == ["start", "stop"]


def test_run_in_background_forwards_the_arguments_the_queue_passes(bridge):
    def work(task_id, stock_code, *, notify=True):
        return (task_id, stock_code, notify)

    assert hook.run_in_background(work)("t1", "AAPL", notify=False) == ("t1", "AAPL", False)
    assert bridge.calls == ["start", "stop"]


def test_run_in_background_releases_the_run_when_the_callable_raises(bridge):
    def work():
        raise ValueError("analysis failed")

    with pytest.raises(ValueError):
        hook.run_in_background(work)()

    assert bridge.calls == ["start", "stop"]
    assert hook.active_run_count() == 0


def test_queue_starts_on_accept_and_stops_when_no_active_task_remains(monkeypatch, bridge, queue):
    """The seam: submit_tasks_batch -> worker -> count back to zero."""
    gate = threading.Event()
    _fake_analysis(monkeypatch, gate=gate)

    accepted, duplicates = queue.submit_tasks_batch(["AAPL"])
    assert len(accepted) == 1 and not duplicates
    assert queue.list_pending_tasks()

    # The worker is inside the analysis: the service is up.
    deadline = threading.Event()
    for _ in range(200):
        if bridge.calls == ["start"]:
            break
        deadline.wait(0.01)
    assert bridge.calls == ["start"]
    assert hook.active_run_count() == 1

    gate.set()
    for _ in range(500):
        if queue.get_task(accepted[0].task_id).status.value == "completed":
            break
        deadline.wait(0.01)

    assert queue.get_task(accepted[0].task_id).status.value == "completed"
    assert bridge.calls == ["start", "stop"]
    assert hook.active_run_count() == 0


def test_queue_runs_two_tasks_under_one_service_and_stops_once(monkeypatch, bridge, queue):
    gate = threading.Event()
    _fake_analysis(monkeypatch, gate=gate)

    accepted, _ = queue.submit_tasks_batch(["AAPL", "MSFT"])
    assert len(accepted) == 2

    tick = threading.Event()
    for _ in range(200):
        if hook.active_run_count() == 2:
            break
        tick.wait(0.01)
    assert hook.active_run_count() == 2
    assert bridge.calls == ["start"]

    gate.set()
    for _ in range(500):
        if hook.active_run_count() == 0:
            break
        tick.wait(0.01)

    assert hook.active_run_count() == 0
    assert bridge.calls == ["start", "stop"]


def test_queue_behaves_as_before_when_the_platform_flag_is_unset(monkeypatch, queue):
    fake = FakeBridge()
    module = types.ModuleType(hook.BRIDGE_MODULE)
    module.startRun = fake.startRun
    module.stopRun = fake.stopRun
    monkeypatch.setitem(sys.modules, hook.BRIDGE_MODULE, module)
    monkeypatch.delenv(ANDROID_PLATFORM_ENV, raising=False)
    hook.reset_for_tests()
    calls = _fake_analysis(monkeypatch)

    accepted, _ = queue.submit_tasks_batch(["AAPL"])
    assert accepted[0].stock_code == "AAPL"
    for _ in range(500):
        if queue.get_task(accepted[0].task_id).status.value == "completed":
            break
        threading.Event().wait(0.01)

    assert calls == ["AAPL"]
    assert fake.calls == []


def test_sync_analysis_holds_the_run(monkeypatch, bridge):
    """POST /analyze without async_mode never reaches the queue."""
    from api.v1.endpoints.analysis import _handle_sync_analysis

    seen: list[int] = []

    def analyze_stock(self, stock_code, **kwargs):
        seen.append(hook.active_run_count())
        return {"stock_code": stock_code, "stock_name": "Fake", "report": {}}

    service_module = types.ModuleType("src.services.analysis_service")
    service_module.AnalysisService = _service_class(analyze_stock)
    monkeypatch.setitem(sys.modules, "src.services.analysis_service", service_module)
    monkeypatch.setattr(
        "api.v1.endpoints.analysis._load_sync_fundamental_sources",
        lambda **kwargs: (None, None, None),
    )
    monkeypatch.setattr(
        "api.v1.endpoints.analysis._build_analysis_report",
        lambda *args, **kwargs: None,
    )

    request = SimpleNamespace(
        report_type="detailed",
        force_refresh=False,
        notify=False,
        skills=None,
        analysis_phase="auto",
        report_language=None,
    )
    response = _handle_sync_analysis("AAPL", request)

    assert response.stock_code == "AAPL"
    assert seen == [1]
    assert bridge.calls == ["start", "stop"]


def test_sync_analysis_releases_the_run_when_the_analysis_raises(monkeypatch, bridge):
    from api.v1.endpoints.analysis import _handle_sync_analysis

    def analyze_stock(self, stock_code, **kwargs):
        raise RuntimeError("boom")

    service_module = types.ModuleType("src.services.analysis_service")
    service_module.AnalysisService = _service_class(analyze_stock)
    monkeypatch.setitem(sys.modules, "src.services.analysis_service", service_module)

    request = SimpleNamespace(
        report_type="detailed",
        force_refresh=False,
        notify=False,
        skills=None,
        analysis_phase="auto",
        report_language=None,
    )
    with pytest.raises(Exception):
        _handle_sync_analysis("AAPL", request)

    assert bridge.calls == ["start", "stop"]
    assert hook.active_run_count() == 0
