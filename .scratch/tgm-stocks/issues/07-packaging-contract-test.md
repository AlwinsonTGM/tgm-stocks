# 07: Packaging contract test

**What to build:** One automated test opens the built APK and fails when the packaging contract regresses, so a release cannot ship with the wrong identity, a debuggable build, a bundled secret file, or dead weight from an incremental build.

**Blocked by:** 01, 03

**Status:** done

- [x] Asserts package id, version name and code, `minSdk 24`, `arm64-v8a` only, `debuggable=false`, and `allowBackup=false`
- [x] Asserts no `.env` or database file is inside the APK
- [x] Asserts the archive has no orphaned entries, by comparing file size to the sum of entry sizes
- [x] Runs without an Android device
- [x] Fails when any asserted property is deliberately broken

**Evidence:** `tests/test_android_apk_contract.py` reads the APK through `aapt2` and skips cleanly when the artifact or the tool is absent. Against the real debug APK: 15 passed, reading package `io.github.alwinsontgm.stocks`, version `1.0.0` code `1`, minSdk `24`, targetSdk `36`, native-code `arm64-v8a`, allowBackup `false`, 206,168 bytes of archive overhead. A parametrized unit test feeds twelve separate violations through the same checker (wrong id, empty version, wrong SDK levels, a second ABI, backup enabled, wrong debuggable flag, bundled `.env`, bundled database, 2 MiB+ of orphaned data) and all are rejected.
