# 09: Device release gate

**What to build:** The release candidate is exercised on real hardware and the results are recorded, so the release is backed by evidence rather than by a passing build.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Fresh install from the published release APK
- [ ] A key is entered through the app and one analysis runs to completion
- [ ] The app is backgrounded mid-run and the report still completes
- [ ] An unauthenticated loopback request is rejected on the device
- [ ] The scheduler and image-notification switches are absent
- [ ] Results are recorded with device model, Android version, and date
