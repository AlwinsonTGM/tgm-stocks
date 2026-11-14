# 07: Packaging contract test

**What to build:** One automated test opens the built APK and fails when the packaging contract regresses, so a release cannot ship with the wrong identity, a debuggable build, a bundled secret file, or dead weight from an incremental build.

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] Asserts package id, version name and code, `minSdk 24`, `arm64-v8a` only, `debuggable=false`, and `allowBackup=false`
- [ ] Asserts no `.env` or database file is inside the APK
- [ ] Asserts the archive has no orphaned entries, by comparing file size to the sum of entry sizes
- [ ] Runs without an Android device
- [ ] Fails when any asserted property is deliberately broken
