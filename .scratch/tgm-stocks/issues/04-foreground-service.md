# 04: Foreground service for an active run

**What to build:** An analysis started by the user keeps running when they switch to another app, and a notification shows that it is running. Returning to the app shows the finished report instead of a dead run.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Starting an analysis starts a foreground service with a persistent notification
- [ ] Switching apps for the duration of the run does not kill it
- [ ] The notification disappears when the run finishes
- [ ] Returning to the app shows the completed report
- [ ] Verified on device
