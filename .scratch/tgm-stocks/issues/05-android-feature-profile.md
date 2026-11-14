# 05: Android feature profile

**What to build:** The scheduler and image-notification switches do not appear in the Android app, and the API refuses to enable them, so configuration cannot drift into a state the app cannot honour.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The scheduler switch is absent from the Android UI
- [ ] Image-notification options are absent from the Android UI
- [ ] The API rejects enabling scheduled execution on Android with a clear error
- [ ] No silent-failure path remains for either feature
- [ ] Tests cover the refusal
