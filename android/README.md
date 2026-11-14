# TGM Stocks: Android module

This directory holds the Android app module: the on-device backend bundled as
Python, the Web UI staged into assets, and the Gradle build that produces the
APK. The Python source and the Web UI live at the repository root; this module
packages them.

## Prerequisites

- JDK 17 or newer (the build is verified with JDK 25).
- Android SDK with platform `android-36` and build-tools `36.0.0`. Point
  `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) at it, or add `sdk.dir` to a local
  `android/local.properties` (not committed).
- Node.js 20.19+ and npm 10+ to build the Web UI.
- CPython 3.13 for the host, used by Chaquopy to resolve and cross-install the
  Android wheels. It is not shipped in the APK.

The Gradle wrapper pins Gradle 9.6.0 and is checked in, so no Gradle
installation is needed.

### Build Python

Chaquopy needs a CPython 3.13 interpreter for the machine running the build.
The build reads it from, in order:

1. the Gradle property `tgms.buildPython` (`-Ptgms.buildPython=...`),
2. the environment variable `TGMS_BUILD_PYTHON`.

There is no default: a machine-specific path baked into the build is exactly
what this ticket removes. When neither is set, the build stops with a message
that says how to set it. Create an interpreter with
[uv](https://docs.astral.sh/uv/) or python.org:

```powershell
uv python install 3.13
$env:TGMS_BUILD_PYTHON = "$env:APPDATA\uv\python\cpython-3.13-windows-x86_64-none\python.exe"
```

```bash
uv python install 3.13
export TGMS_BUILD_PYTHON="$(uv python find 3.13)"
```

## Build the APK

One command from the repository root stages the source and builds the APK:

```powershell
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1
```

```bash
bash android/build-apk.sh
```

Both scripts:

1. build the Web UI into `static/` (`npm ci` when `node_modules` is missing,
   then `npm run build`),
2. stage the repository source and `static/` into
   `app/src/main/assets/repo.zip` with `stage_repo.py`,
3. run `./gradlew :app:assembleDebug` (pass `-Variant release` /
   `--variant release` for a release build; release signing is a later ticket).

The APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

The packaging contract test (`tests/test_android_apk_contract.py`) reads that
APK when it exists and fails on a wrong identity, a bundled secret, or dead
weight left in the archive. A build over an existing tree can leave a replaced
entry behind; run `./gradlew clean` before measuring a size you intend to
record.

## Loopback token

The on-device backend listens on `127.0.0.1` on an OS-assigned port, which any
other app on the phone can reach. To stop that, the app generates a random
per-install secret (the **Loopback token**) on first launch, stores it in
app-private preferences (`tgms_loopback`), and passes it to Python as
`TGMS_LOOPBACK_TOKEN` before the backend starts.

When that variable is set, the backend rejects every request that does not
present the token, either as the `tgms_token` cookie or as
`Authorization: Bearer <token>`. The WebView gets the cookie for
`http://127.0.0.1:<port>` before the first page load, so subresources and XHR
are authenticated too; a request header would only cover the first request.
When the variable is unset (desktop, tests) no token is required.

The token is never logged. The backend logs its port at startup, which is
enough to verify the protection from a computer:

```bash
adb logcat -s tgms.bootstrap            # "On-device backend listening on 127.0.0.1:<port>"
adb forward tcp:<port> tcp:<port>
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<port>/api/health   # 401
curl -s -o /dev/null -w '%{http_code}\n' -b "tgms_token=<token>" http://127.0.0.1:<port>/api/health   # 200
```

The token value is only readable on a debuggable build, with
`adb shell run-as io.github.alwinsontgm.stocks cat shared_prefs/tgms_loopback.xml`.
The `tgms_token` cookie is `HttpOnly`, so WebView JavaScript cannot read it.

## Android feature profile

The app also sets `TGMS_PLATFORM=android` before the backend starts (the
bootstrap sets it as well). With that profile the backend applies ADR-0006:
the scheduler settings (`SCHEDULE_ENABLED`, `SCHEDULE_TIME`, `SCHEDULE_TIMES`,
`SCHEDULE_RUN_IMMEDIATELY`) and the image-notification rendering settings
(`MARKDOWN_TO_IMAGE_CHANNELS`, `MARKDOWN_TO_IMAGE_MAX_CHARS`, `MD2IMG_ENGINE`)
are left out of the config schema, so the Web UI cannot render them, and the
config API rejects any attempt to write them with a 400 error naming the
feature as unavailable on Android. When the variable is unset (desktop, tests)
nothing changes.

## Foreground service for an active run

Android may freeze or kill a backgrounded app, which would cut off an analysis
the user just started. While a run is active the app therefore runs
`AnalysisForegroundService` with a persistent notification, so switching to
another app does not lose the run (ADR-0006: only a run the user started;
scheduled execution stays off).

The Python side is `src/services/run_foreground_service.py`. It counts active
runs and calls `startRun()` / `stopRun()` on the Java bridge
`ForegroundServiceBridge`, which `MainActivity` installs as the Chaquopy module
`tgms_bridge` before the backend starts. The service starts when the count goes
from zero to one and stops when it returns to zero.

The hook is inert unless `TGMS_PLATFORM=android`, and a missing bridge only logs
a warning, so desktop, Docker and tests behave exactly as before. It is wired to
the task lifecycle, not to polling:

- `AnalysisTaskQueue.submit_tasks_batch` and `submit_background_task` wrap the
  callable they hand to the worker pool, so a run is active from the moment the
  worker picks the task up until it returns, succeeds or fails.
- The synchronous `/analyze` path runs on the request thread and never reaches
  the queue, so it holds the run itself.
- The market review prepares its data before it queues work, so its endpoint
  holds a run from submission until the queued run finishes.

The notification is generic ("Analysis in progress"). It never names a stock, a
portfolio holding or an API key. On Android 13+ the app asks for
`POST_NOTIFICATIONS` on first launch; without it the service still runs but the
notification is not shown.

To watch it on a device:

```bash
adb logcat -s TGMStocks ActivityManager | grep -i analysisforegroundservice
adb shell dumpsys activity services io.github.alwinsontgm.stocks
```

## Wheels

Compiled dependencies are cross-built for `android_24_arm64_v8a` and committed
under `wheels/`, which `app/build.gradle` passes to pip with `--find-links`.
Nothing is read from outside this repository except the public package
indexes. `app/src/main/jniLibs/arm64-v8a/libc++_shared.so` (NDK r27d) is
bundled because `tokenizers` links against it.

`app/requirements-android.txt` is the Android variant of the root
`requirements.txt`; its comments state each deliberate difference. It drops
`longbridge`, `futu-api`, `lark-oapi` and `newspaper3k` (ADR-0005), and no
wheel for those packages is kept: broker quotes and portfolio import, the
Feishu app bot and cloud documents, and newspaper3k's article extraction are
unavailable in the Android build. Article text is extracted with bs4 instead,
so `beautifulsoup4` and `lxml` are listed explicitly.

### Dependency trim

The debug APK measures **118.1 MiB** (123,848,554 bytes) with the trimmed set,
down from 164.6 MiB (172,601,575 bytes) with the full set. Measure a new value
after any dependency change and record it in the release notes.

Every optional SDK is imported inside the code that uses it and guarded, so a
missing package degrades to an unavailable feature rather than an import error:

- `longbridge` and `futu` are imported only inside their providers, which
  report themselves unavailable without the SDK.
- `lark_oapi` is guarded in the notification sender, the Feishu stream bot and
  `src/feishu_doc.py`.
- `newspaper3k` is guarded in `src/search_service.py`, which falls back to bs4.

`scripts/check_android_imports.py` proves the backend still imports with those
packages made unimportable, and extracts article text through the fallback.

## Icons

Launcher icons at mdpi through xxxhdpi plus the adaptive icon are generated
from `tools/E2.png` by `tools/make_icons.ps1`. Regenerate them after changing
the source artwork; do not edit the PNGs by hand.

## Identity

| Property | Value |
| --- | --- |
| App label | TGM Stocks |
| Application id / namespace | `io.github.alwinsontgm.stocks` |
| `versionName` | `1.0.0` |
| `versionCode` | `1` |
| `minSdk` | 24 |
| `targetSdk` | 36 |
| ABI | `arm64-v8a` only |

## Release signing

Release builds are signed from the environment; no key material is stored in the
repository. Set all four variables before running `build-apk.ps1 -Variant release`:

| Variable | Meaning |
| --- | --- |
| `TGMS_KEYSTORE_PATH` | Path to the release keystore (`.jks`) |
| `TGMS_KEYSTORE_PASSWORD` | Keystore password |
| `TGMS_KEY_ALIAS` | Key alias, default `tgm-stocks` |
| `TGMS_KEY_PASSWORD` | Key password, default the keystore password |

Without them the release build is unsigned and cannot be distributed.

**Back up the keystore and its password offline.** Losing them means every
existing install must be uninstalled before it can take an update, because
Android refuses an update signed by a different key. The keystore must never be
committed; `.gitignore` does not protect it if you place it inside the tree.

## Version bump

Update `versionCode` and `versionName` in `app/build.gradle`, and the same two
values in `version.json`. The app reads `version.json` from the repository's main
branch on launch and offers a link to the release page when the published
`versionCode` is higher than the installed one.
