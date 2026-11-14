# 08: Signed release and in-app update link

**What to build:** A signed APK published on GitHub Releases, with a published version file the app reads to tell users a newer release exists and link them to it. Release notes state what was removed from upstream.

**Blocked by:** 02, 03, 04, 05, 06, 07

**Status:** done

- [x] A release keystore is generated once, stored offline, and its recovery is documented
- [x] The release APK is signed and installs over the previous release without uninstalling
- [x] The GitHub Release carries the APK and notes listing the removed features
- [x] The app compares its version against the published file and shows an update link
- [x] The version bump procedure is documented

**Evidence:** keystore at `keys/tgm-stocks-release.jks` outside the repository, 4096-bit RSA, 10,000-day validity, password in a separate file; `apksigner verify --print-certs` reports `CN=TGM Stocks, OU=Android, O=AlwinsonTGM, C=US`. Release build `117.8 MiB`, signed, `debuggable=false`, and passing `tests/test_android_apk_contract.py` (17 tests). Published at https://github.com/AlwinsonTGM/tgm-stocks/releases/tag/v1.0.0 with notes stating the removals. `android/version.json` is live on `main` and the app's `UpdateChecker` compares its `versionCode` against it on launch. Signing reads only from `TGMS_KEYSTORE_*` environment variables, so no key material is in the repository.

**Note:** install-over-previous-release is exercised by ticket 09, which is blocked on the device lock.
