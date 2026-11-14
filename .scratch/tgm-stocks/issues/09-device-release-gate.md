# 09: Device release gate

**What to build:** The release candidate is exercised on real hardware and the results are recorded, so the release is backed by evidence rather than by a passing build.

**Blocked by:** 08

**Status:** blocked — the tablet is locked with a secure unlock, and HyperOS refuses an ADB install while the device is locked (`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`). `wm dismiss-keyguard`, `cmd statusbar collapse`, a wake key event and a swipe-up were all tried; the keyguard still reports `showing=true`. Unlocking requires the owner's PIN or pattern.

- [ ] Fresh install from the published release APK
- [ ] A key is entered through the app and one analysis runs to completion
- [ ] The app is backgrounded mid-run and the report still completes
- [ ] An unauthenticated loopback request is rejected on the device
- [ ] The scheduler and image-notification switches are absent
- [ ] Results are recorded with device model, Android version, and date

**What is already proven on this device (debug build, earlier tickets):** the backend starts and serves the Web UI; an AAPL analysis completed with score 59; the Loopback token returned 401 without a cookie and 200 with one; a foreground run survived backgrounding and stopped at completion; the token never appeared in logcat.

**What still needs the device unlocked:** install of the signed release artifact, install-over-previous-release, key entry through the release build's UI (the release build is not debuggable, so `run-as` is unavailable), and a completion run on the release build.
