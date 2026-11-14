# 05: Android feature profile

**What to build:** The scheduler and image-notification switches do not appear in the Android app, and the API refuses to enable them, so configuration cannot drift into a state the app cannot honour.

**Blocked by:** 01

**Status:** done

- [x] The scheduler switch is absent from the Android UI
- [x] Image-notification options are absent from the Android UI
- [x] The API rejects enabling scheduled execution on Android with a clear error
- [x] No silent-failure path remains for either feature
- [x] Tests cover the refusal

**Evidence:** with `TGMS_PLATFORM=android`, the schema response omits `SCHEDULE_ENABLED`, `SCHEDULE_TIME`, `SCHEDULE_TIMES`, `SCHEDULE_RUN_IMMEDIATELY`, `MARKDOWN_TO_IMAGE_CHANNELS`, `MARKDOWN_TO_IMAGE_MAX_CHARS`, and `MD2IMG_ENGINE`, while `STOCK_LIST` stays visible. Writes to those keys return `400 validation_failed` with code `android_feature_unavailable` and nothing is persisted. `tests/test_system_config_api.py` (40) and `tests/test_loopback_token.py` (6) pass, and the APK still builds at 164.6 MiB with the Java change compiled.
