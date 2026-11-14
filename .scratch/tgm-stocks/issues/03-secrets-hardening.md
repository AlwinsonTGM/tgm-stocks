# 03: Secrets hardening

**What to build:** Keys entered through the app persist across restarts, are excluded from Android auto-backup, never appear in logs, and are masked in the UI. A written threat model states what is protected and what is not.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `allowBackup` is false and backup rules exclude app state
- [ ] Key values never appear in logcat at any log level
- [ ] Secret fields are masked, and revealing one requires an explicit action
- [ ] Key entry works end-to-end through the app: enter, save, restart, and the next analysis uses it
- [ ] The threat model is documented
