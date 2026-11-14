# 01: Reproducible build and identity

**What to build:** A contributor clones the repository and runs one documented command to produce an installable APK. The APK identifies as TGM Stocks with its own package id, a version name and code, the supplied icon at every density, `minSdk 24`, and `arm64-v8a` only. The build needs no machine-specific paths and no directories outside the repository. The repository carries `LICENSE` and a `NOTICE` crediting upstream, and its history is split so the Android port, the i18n/diagnostics work, and the docs are separate commits.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A clean clone plus one documented command produces an APK on a machine with only a JDK and the Android SDK
- [ ] The APK reports app name TGM Stocks, package `io.github.alwinsontgm.stocks`, a non-empty version name and a version code of at least 1
- [ ] The icon appears at mdpi through xxxhdpi and as an adaptive icon
- [ ] `minSdk 24`, `targetSdk 36`, `arm64-v8a` only
- [ ] No absolute host paths and no references to directories outside the repository
- [ ] `LICENSE` retained and `NOTICE` credits upstream
- [ ] History split into Android port, i18n/diagnostics, and docs commits
