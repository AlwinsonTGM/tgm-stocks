# 09: Device release gate

**What to build:** The release candidate is exercised on real hardware and the results are recorded, so the release is backed by evidence rather than by a passing build.

**Blocked by:** 08

**Status:** partial — release-artifact checks pass on device; key entry and analysis completion still need a human at the device.

## Passed on the published release APK (`2410CRP4CG`, Android 16, 2026-11-15)

- [x] Fresh install from the published release APK (`adb install -r` after uninstalling, `Success`)
- [x] The app launches and the on-device backend starts: `listening on 127.0.0.1:50695 (loopback token required)`
- [x] An unauthenticated loopback request is rejected: `GET /api/health` → 401, `GET /` → 401
- [x] The scheduler switch and panel are absent from the Android UI (`System` category dropped from 25 to 21 fields; no "Scheduled task" text)
- [x] Image-notification options are absent
- [x] Version info reports the release build

## Not verified on the release artifact

- [ ] A key is entered through the app and one analysis runs to completion
- [ ] The app is backgrounded mid-run and the report still completes
- [ ] Install-over-previous-release

**Why:** the release build is not debuggable, so `run-as` cannot seed the app's `.env`, and `Import .env` is deliberately disabled on Android (`isEnvBackupAllowed` requires desktop or admin auth). Driving the model fields through the WebView is unreliable under automation: the IME capitalises the first character of `openai/logfare/auto`, and the hidden inputs resist synthetic clearing. A human typing the key once would settle it.

## Bugs found by this gate (both fixed)

1. **Scheduler panel leaked into the Android UI.** Hiding the schema fields was not enough because the panel renders from config items. Fixed in `6f719c11`: the config payload now omits Android-hidden keys. Verified on device.
2. **Every `<input type="file">` was a dead button.** `MainActivity` had no `onShowFileChooser`, so "Import .env" and the smart-import pickers did nothing. Fixed in `01963f39`.

## Evidence carried from earlier tickets

On the debug build on the same device: an AAPL analysis completed (score 59, "Hold and watch"), a run survived backgrounding with a foreground-service notification and stopped at completion, and the token appeared zero times in logcat.
