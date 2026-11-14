# 03: Secrets hardening

**What to build:** Keys entered through the app persist across restarts, are excluded from Android auto-backup, never appear in logs, and are masked in the UI. A written threat model states what is protected and what is not.

**Blocked by:** 01

**Status:** done

- [x] `allowBackup` is false and backup rules exclude app state
- [x] Key values never appear in logcat at any log level
- [x] Secret fields are masked, and revealing one requires an explicit action
- [x] Key entry works end-to-end through the app: enter, save, restart, and the next analysis uses it
- [x] The threat model is documented

**Evidence:** the built APK reports `android:allowBackup=false`, `android:fullBackupContent=false` and `android:dataExtractionRules=@0x7f050000` (`xml/data_extraction_rules`), whose `cloud-backup` and `device-transfer` sections exclude every domain. `GET /api/v1/system/config` now masks every registry-sensitive field (it previously echoed `GEMINI_API_KEY` and other provider keys in plaintext) and the Web UI renders them as password inputs behind an explicit eye toggle. The search service no longer logs the first 8 characters of a key. `python -m pytest tests/test_secrets_hardening.py` (9) writes a known key through the same endpoint the WebView uses, asserts it lands in the private `.env`, reads back as the mask token after a restart, survives `setup_env` reload for the next analysis, and never appears in captured log output at any level; that log test fails when a leak is injected. The wider config/auth/logging/search suites pass (621). The threat model is `docs/security/android-threat-model.md`. The WebView UI path is covered at the API level; no UI automation was run.
