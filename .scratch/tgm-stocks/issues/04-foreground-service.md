# 04: Foreground service for an active run

**What to build:** An analysis started by the user keeps running when they switch to another app, and a notification shows that it is running. Returning to the app shows the finished report instead of a dead run.

**Blocked by:** 01

**Status:** done

- [x] Starting an analysis starts a foreground service with a persistent notification
- [x] Switching apps for the duration of the run does not kill it
- [x] The notification disappears when the run finishes
- [x] Returning to the app shows the completed report
- [x] Verified on device

**Evidence:** `AnalysisForegroundService` (`dataSync`, channel `analysis_run`, generic "Analysis in progress" text) is started and stopped by `ForegroundServiceBridge`, which `MainActivity` installs as the Chaquopy module `tgms_bridge`. The Python hook `src/services/run_foreground_service.py` counts active runs and is wired to the task lifecycle: `AnalysisTaskQueue.submit_tasks_batch` / `submit_background_task` wrap the callable they hand to the worker pool, the synchronous `/analyze` path holds the run itself, and the market-review endpoint holds one from submission until its queued run ends. It is inert unless `TGMS_PLATFORM=android`.

Unit tests: `tests/test_run_foreground_service.py`, 14 passed — start fires once per run, stop fires when the count returns to zero, nothing fires with the flag unset or non-Android, a missing or failing bridge never breaks the run, and the queue seam starts on accept and stops when no active task remains. Full suite: 8283 passed, 68 failed; every failing file fails identically on a pristine `HEAD` checkout (pre-existing, unrelated).

Device (`2410CRP4CG`, Android 16, `adb install -r`): after submitting an AAPL analysis and pressing HOME, `dumpsys activity services` showed `AnalysisForegroundService ... isForeground=true foregroundId=1 types=0x00000001 foregroundNoti=Notification(channel=analysis_run ... flags=ONGOING_EVENT|ONLY_ALERT_ONCE|NO_CLEAR|FOREGROUND_SERVICE category=progress)`, `dumpsys notification` listed `0|io.github.alwinsontgm.stocks|1|null`, and the device reported `GreezeManager: onForegroundServicesChanged pid=... fg=true`. The run reached `processing 94` while backgrounded and then `completed progress=100 stock_name="Apple Inc."` with a full report; the service stopped 0.008 s after completion (`Cancel FGS notification ... ChannelId:analysis_run`), `dumpsys activity services` then listed no `AnalysisForegroundService`, and the notification was gone. A second run failed on an LLM-side error ("LLM returned empty response") and the notification and service still stopped; a retry completed.

Note: this device freezes an idle backgrounded app (`GreezeManager: FZ uid = 10324 reason =tobg`), so the backend stops answering once the app is backgrounded with no run active. That is device power management, not the service: while a run was active the process stayed unfrozen and the API answered throughout.
