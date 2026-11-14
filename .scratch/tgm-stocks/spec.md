# TGM Stocks — Android release spec

Status: ready-for-agent
Tracker: local markdown (`.scratch/tgm-stocks/`)

## Problem Statement

The upstream project is a Python backend plus a web frontend. It has no Android distribution: to use it you run a service on a computer and open a browser. A previous feasibility build — the **Probe** — proved the **on-device backend** can run on a phone, but the Probe is not something a normal person can install or trust:

- The debug APK is 290 MiB on disk, of which 126 MiB is orphaned build data; a clean build is 164.3 MiB.
- The embedded server listens on loopback with no authentication, so any other app on the phone can read the user's portfolio and reports.
- There is no version name, no version code, no signing key, and no update path.
- API keys are entered through the **Web UI** and written to a plaintext `.env` in app-private storage, with Android auto-backup left enabled.
- The scheduler switch and image-notification switch are visible and editable but cannot work on Android, so they fail silently.
- The build only runs on one Windows machine: an absolute `buildPython` path, four sibling lab directories, and no Gradle wrapper.

## Solution

Ship **TGM Stocks**: a signed, open-source **Android app** that runs the analysis pipeline on the device, presents the existing **Web UI** in a WebView, and is published as a **Release build** on GitHub Releases.

The app protects its local server with a **Loopback token**, stores keys in app-private storage with backup disabled, hides features that cannot work on Android, and is built from a repository that anyone can clone and build.

## User Stories

1. As a phone user, I want to install the app from a GitHub Release, so that I do not need a computer to run stock analysis.
2. As a phone user, I want the app to show its version in the UI, so that I know which release I am running.
3. As a phone user, I want the app to tell me when a newer release exists and link me to it, so that I can update without hunting.
4. As a phone user, I want to install an update over my existing install without uninstalling first, so that my watchlist and history survive.
5. As a phone user, I want the app to open to a usable screen without configuration, so that I can see what it does before committing to anything.
6. As a phone user, I want to add and remove stocks from a watchlist, so that the analysis covers what I actually follow.
7. As a phone user, I want my watchlist to persist across app restarts, so that I do not re-enter it every time.
8. As a phone user, I want to start an analysis for one stock, so that I get a decision without waiting for a batch.
9. As a phone user, I want to see that an analysis is running, so that I do not think the app has frozen.
10. As a phone user, I want a running analysis to survive switching to another app, so that checking a message does not waste the run.
11. As a phone user, I want a notification while an analysis runs, so that I can see progress from outside the app.
12. As a phone user, I want the finished report to open in the app, so that I can read it without leaving.
13. As a phone user, I want to browse past reports, so that I can compare today's conclusion with last week's.
14. As a phone user, I want past reports to survive app restarts, so that history is not lost.
15. As a phone user, I want to delete a past report, so that I control what stays on my device.
16. As a phone user, I want to enter my own LLM API key in the app, so that the analysis runs on my account.
17. As a phone user, I want to enter my own news search key, so that reports include news evidence.
18. As a phone user, I want to see which of my keys are configured without seeing the full value, so that I can confirm setup without exposing secrets.
19. As a phone user, I want a clear error when my key is rejected, so that I know to fix the key rather than the stock.
20. As a phone user, I want to verify my model connection before running an analysis, so that I do not wait minutes to learn the key is dead.
21. As a phone user, I want to be told which features are unavailable on Android, so that I do not hunt for a switch that cannot work.
22. As a phone user, I want the app to work without an account, so that I do not hand over personal data to use it.
23. As a phone user, I want the app to work without a server I have to trust, so that my keys and portfolio stay on my device.
24. As a phone user, I want the app to keep working when a data provider is down, so that one failure does not block the whole analysis.
25. As a phone user, I want to know when a report has no news evidence, so that I can weigh the conclusion correctly.
26. As a phone user, I want the app to tell me when it cannot reach the network, so that I do not mistake a network failure for a bad analysis.
27. As a phone user, I want the app to use my phone's language, so that the interface is readable to me.
28. As a phone user, I want the app to respect my system dark mode, so that it is comfortable to read at night.
29. As a phone user, I want the app to work on Android 7 and later, so that older devices are not excluded.
30. As a phone user, I want the app to be one download that works on my phone, so that I do not have to pick an architecture.
31. As a phone user, I want the download to be as small as it can be without losing core features, so that it does not cost a lot of mobile data.
32. As a phone user, I want the app to explain what it does with my keys, so that I can decide whether to trust it.
33. As a phone user, I want the app to never upload my keys anywhere, so that a breach elsewhere cannot expose them.
34. As a phone user, I want the app's local server to reject other apps, so that no other app can read my portfolio.
35. As a phone user, I want my data excluded from Android auto-backup, so that it does not leave my device through a cloud backup.
36. As a phone user, I want to remove all my data by uninstalling, so that I do not need a separate wipe step.
37. As a phone user, I want the app to survive being backgrounded and reopened, so that I do not lose my place.
38. As a contributor, I want to clone the repository and build the APK with one documented command, so that I can verify or modify it.
39. As a contributor, I want the build to run without private lab directories, so that the repository is self-contained.
40. As a contributor, I want the test suite to run without an Android device, so that I can work on the backend without hardware.
41. As a contributor, I want a device checklist for what cannot be automated, so that I know what to verify before a release.
42. As a contributor, I want the upstream relationship documented, so that I know how to merge upstream changes.
43. As a contributor, I want the licensing and attribution to be unambiguous, so that redistribution is clearly permitted.
44. As a maintainer, I want a signed release with a version code, so that users can update rather than reinstall.
45. As a maintainer, I want the release notes to state what was removed from upstream, so that users are not surprised by missing features.
46. As a maintainer, I want the APK to be non-debuggable, so that release builds do not expose debugging surfaces.
47. As a maintainer, I want the measured APK size recorded per release, so that size regressions are visible.
48. As a maintainer, I want to merge upstream at release boundaries with a documented divergence list, so that upstream fixes reach users without silent drift.

## Implementation Decisions

**Repository shape.** One monorepo. The Android module lives beside the Python source and the Web UI, because the APK bundles both. Upstream stays as a git remote; the repository is standalone, not a fork (ADR-0003). `LICENSE` is retained and a `NOTICE` credits upstream.

**Identity.** App name **TGM Stocks**, application id `io.github.alwinsontgm.stocks`, icon derived from the supplied 1536×1536 source at every mipmap density plus an adaptive icon. `versionName` and `versionCode` are declared and bumped per release; the Probe's missing version metadata is fixed.

**Runtime.** Chaquopy with Python 3.13, `minSdk 24`, `targetSdk 36`, `arm64-v8a` only (ADR-0005). The interpreter and native libraries ship inside the APK; nothing is downloaded and executed at runtime, because Android 10+ forbids executing code from writable app storage.

**Server.** The on-device backend binds `127.0.0.1` on an OS-assigned port and requires a random per-install **Loopback token** on every request. The WebView receives the token at load time and presents it on subsequent requests. Requests without it are rejected. Cleartext is permitted only for `127.0.0.1`.

**Secrets.** Keys are entered through the existing Web UI settings page and persisted to an app-private `.env`. `allowBackup` is false so the file never reaches a cloud backup. Key values are never logged and are masked in the UI (ADR-0004).

**Long-running work.** An analysis run started by the user is kept alive by a foreground service with a persistent notification. Scheduled execution remains off (ADR-0006).

**Feature surface.** The scheduler switch and image-notification switch are hidden in the Android build. The API continues to reject or ignore them rather than silently accepting configuration it cannot honour.

**Dependency trim.** The Release build drops `longbridge`, `futu-api`, `lark-oapi`, and `newspaper3k` (which removes `jieba` and `nltk`). `longbridge` and `futu` are only imported inside optional providers. `lark_oapi` is already guarded in the notification sender; the unguarded import in the Feishu document module must be guarded or the module removed. `newspaper3k` is imported at module level in the search service and must be guarded with a bs4 fallback before it can be dropped.

**Build.** Cross-built wheels are committed under the Android module so the repository is self-contained. A Gradle wrapper and a single build script replace the absolute `buildPython` path and the sibling lab directories. CI is deferred.

**Release.** A release keystore is generated once and kept offline; every GitHub Release is signed with it. The app checks a published version file and links to the release page rather than self-updating.

## Testing Decisions

Good tests assert external behavior: what a caller observes through a public surface, not how a module is structured internally. Tests should fail when the behavior regresses, not when a refactor moves code.

**Seam 1 — the HTTP API (existing).** The on-device backend is exercised through FastAPI's `TestClient`, the same way the Web UI consumes it. This is the highest seam and already has prior art in `tests/` (system config, analysis endpoints, auth). It covers: loopback token acceptance and rejection, settings read/write, masked secret display, scheduler endpoints being unavailable in the Android profile, and analysis submission.

**Seam 2 — the built APK (new).** One pytest opens the built APK as a zip, reads its manifest, and asserts the packaging contract: application id, version name and code present, `minSdk 24`, `arm64-v8a` only, `debuggable=false`, `allowBackup=false`, no `.env` or database file inside, and no orphaned entries (file size equals the sum of entry sizes within a small tolerance). This catches the class of regression that produced the 126 MiB of dead data.

**Seam 3 — the device checklist (manual, not automated).** Installation, key entry, and one real analysis completing on-device cannot be automated here: Chaquopy needs a real arm64 device and there is no emulator in this environment. A device (`2410CRP4CG`, Android 16, arm64-v8a) is available over wireless ADB, so this is executable, but it stays a release gate rather than a CI job.

## Out of Scope

- Google Play distribution and its policy review.
- Background or scheduled analysis (WorkManager or otherwise).
- Image-rendered notifications.
- Agent chat, market review, screening, and backtest screens.
- A native Compose UI.
- Accounts, sync, or any server operated by the maintainer.
- iOS.
- Broker portfolio import (Futu, Longbridge) and the Feishu app bot — removed by the dependency trim.
- Continuous integration for the Android build.

## Further Notes

**Measured baseline.** A clean debug build of the Probe's dependency set measures **164.3 MiB** (172,275,951 bytes) with zero orphaned entries. The earlier 290 MiB figure was build garbage, not payload. The trimmed Release size is **not yet measured**; the trim requires the import guards above before it can be built, so the spec deliberately does not promise a number. Expect roughly 120–130 MiB, and record the actual value in the release notes.

**Verified on device.** The clean 164.3 MiB build installs on the `2410CRP4CG` tablet and runs. A completed AAPL analysis renders in the app — score 59, "Hold and watch", bullish, with the news-evidence disclosure showing correctly because that device has no search key configured. The Probe's "AI analysis not yet verified" caveat is closed. What remains unverified on device is the trimmed build, the Loopback token, the foreground service, and key entry through the app rather than through a pre-seeded `.env`.

**Trim risk.** Dropping `newspaper3k` removes article-text extraction. The search service has a bs4 fallback path, but its quality against the newspaper path is unverified. If news quality regresses, keep `newspaper3k` and accept a larger build.

**Upstream divergence.** The Android work modifies `search_service.py` and `akshare_fetcher.py` to fall back to inline execution when `Process.start()` fails. Those two edits are the entire Android delta today and must be listed in the divergence notes so future merges do not silently drop them.

**Probe warning.** The Probe's README states: do not create an APK by silently omitting features or libraries and describe it as a full port. The release notes must state what was removed.
