# 01: Reproducible build and identity

**What to build:** A contributor clones the repository and runs one documented command to produce an installable APK. The APK identifies as TGM Stocks with its own package id, a version name and code, the supplied icon at every density, `minSdk 24`, and `arm64-v8a` only. The build needs no machine-specific paths and no directories outside the repository. The repository carries `LICENSE` and a `NOTICE` crediting upstream, and its history is split so the Android port, the i18n/diagnostics work, and the docs are separate commits.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A clean clone plus one documented command produces an APK on a machine with only a JDK and the Android SDK
- [x] The APK reports app name TGM Stocks, package `io.github.alwinsontgm.stocks`, a non-empty version name and a version code of at least 1
- [x] The icon appears at mdpi through xxxhdpi and as an adaptive icon
- [x] `minSdk 24`, `targetSdk 36`, `arm64-v8a` only
- [x] No absolute host paths and no references to directories outside the repository
- [x] `LICENSE` retained and `NOTICE` credits upstream
- [x] History split into Android port, i18n/diagnostics, and docs commits

**Evidence:** a clean clone of branch `tgm-stocks` built with `android/build-apk.ps1` in 7m29s, producing a 162.9 MiB APK; `aapt2 dump badging` reports package `io.github.alwinsontgm.stocks`, versionName `1.0.0`, versionCode `1`, label `TGM Stocks`, minSdk `24`, targetSdk `36`, native-code `arm64-v8a`; the archive has 0.2 MiB of padding and no `.env` or database entries. History is three commits on top of upstream: Android port, i18n/diagnostics, docs.
