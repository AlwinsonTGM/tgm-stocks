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

## Wheels

Compiled dependencies are cross-built for `android_24_arm64_v8a` and committed
under `wheels/`, which `app/build.gradle` passes to pip with `--find-links`.
Nothing is read from outside this repository except the public package
indexes. `app/src/main/jniLibs/arm64-v8a/libc++_shared.so` (NDK r27d) is
bundled because `tokenizers` links against it.

`app/requirements-android.txt` is the Android variant of the root
`requirements.txt`; its comments state each deliberate difference.

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
