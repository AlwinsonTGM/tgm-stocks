# API keys live in app-private storage, not the Keystore

Keys entered in the web Settings page are written to `files/state/.env` inside app-private storage, protected by the Android sandbox and full-disk encryption. We deliberately did not build a Keystore-backed secret store: the realistic leak paths are Android auto-backup uploading `.env` off-device and the unauthenticated loopback port, not an attacker who already has root. The embedded server therefore requires a random per-install bearer token that the WebView injects, and `allowBackup` is false.

**Considered options**: `EncryptedSharedPreferences` with keys injected into the environment at startup (deferred: duplicates the config layer to defend against root, which already defeats it); encrypting `.env` itself (same reasoning).

**Consequences**: the threat model must be written down, and release builds must never log key values. Both are in place: `docs/security/android-threat-model.md` states what is and is not protected, and `tests/test_secrets_hardening.py` proves a saved key never reaches log output.
