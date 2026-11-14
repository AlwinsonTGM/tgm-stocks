# 02: Loopback token

**What to build:** The on-device backend rejects any request that does not carry the per-install Loopback token, and the app's WebView carries it automatically. Another app on the phone that finds the port cannot read the user's portfolio or reports.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A request without the token is rejected; the same request with it succeeds
- [ ] The token is generated per install and never logged
- [ ] The WebView loads the UI without showing the user a token prompt
- [ ] Verified on device: an unauthenticated request issued from adb fails
- [ ] API tests cover both the accepted and rejected paths
