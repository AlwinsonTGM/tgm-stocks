# 02: Loopback token

**What to build:** The on-device backend rejects any request that does not carry the per-install Loopback token, and the app's WebView carries it automatically. Another app on the phone that finds the port cannot read the user's portfolio or reports.

**Blocked by:** 01

**Status:** done

- [x] A request without the token is rejected; the same request with it succeeds
- [x] The token is generated per install and never logged
- [x] The WebView loads the UI without showing the user a token prompt
- [x] Verified on device: an unauthenticated request issued from adb fails
- [x] API tests cover both the accepted and rejected paths

**Evidence:** `python -m pytest tests/test_loopback_token.py` passes: no token → 401, wrong cookie/bearer → 401, cookie → 200, bearer → 200, token unset → 200, and the token never appears in captured logs. On the `2410CRP4CG` device, `adb logcat` reports `on-device backend listening on 127.0.0.1:57913 (loopback token required)`; with `adb forward tcp:57913 tcp:57913`, `GET /api/health` and `GET /` return 401 without the cookie and 200 with `tgms_token` (or `Authorization: Bearer`). The token in app-private `shared_prefs/tgms_loopback.xml` is unchanged across restarts and reinstalls, and appears nowhere in logcat. The Web UI renders in the WebView with no token prompt.
