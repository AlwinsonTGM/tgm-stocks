# 08: Signed release and in-app update link

**What to build:** A signed APK published on GitHub Releases, with a published version file the app reads to tell users a newer release exists and link them to it. Release notes state what was removed from upstream.

**Blocked by:** 02, 03, 04, 05, 06, 07

**Status:** ready-for-agent

- [ ] A release keystore is generated once, stored offline, and its recovery is documented
- [ ] The release APK is signed and installs over the previous release without uninstalling
- [ ] The GitHub Release carries the APK and notes listing the removed features
- [ ] The app compares its version against the published file and shows an update link
- [ ] The version bump procedure is documented
