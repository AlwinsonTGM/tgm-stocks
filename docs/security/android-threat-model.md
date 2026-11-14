# Android threat model: keys and portfolio data on the device

TGM Stocks runs the analysis pipeline on the phone. This document states what
that protects and what it does not, so a reader can judge the app's security
claims instead of assuming them. It is the written threat model that ADR-0004
requires.

## What the app stores

| Data | Where | How long |
| --- | --- | --- |
| LLM and news-search API keys, notification secrets | `files/state/.env` in app-private storage | Until the user clears or replaces them |
| Loopback token | App-private `SharedPreferences` (`tgms_loopback.xml`) | Until the app is uninstalled |
| Watchlist, reports, history, usage telemetry | `files/state/data/stock_analysis.db` and `files/state/logs/` | Until the user deletes them |

The `.env` file is plaintext. ADR-0004 explains why it is not Keystore-backed.

## What is protected, and how

**Other apps on the phone.** Android gives each app a private data directory
that no other app can read without root. The on-device backend also binds
`127.0.0.1` on an OS-assigned port, which any app can reach, so every request
must carry the **Loopback token**: a random per-install secret the WebView
presents as an `HttpOnly`, `SameSite=Strict` cookie. A request without it gets
`401`. This stops another app from reading the portfolio or reports through the
local port, and from writing configuration through the settings API.

**Cloud backup and device transfer.** The manifest sets
`android:allowBackup="false"` and `android:fullBackupContent="false"`, and
`dataExtractionRules` points at `res/xml/data_extraction_rules.xml`, which
excludes every storage domain for both cloud backup and device-to-device
transfer on Android 12+. Keys therefore do not leave the device through
backup, even if a user later enables backup for other apps.

**Loss or theft of a locked device.** Full-disk encryption (file-based
encryption on Android 7+) means the app directory cannot be read without the
user's credential. The `.env` file inherits that protection.

**Logs.** Key values must never reach logcat, where any app with
`READ_LOGS` (or a developer with `adb logcat`) could read them. The config API
never echoes a key value back, and `tests/test_secrets_hardening.py` writes a
known key through the same endpoint the Web UI uses and asserts the value never
appears in captured output at any log level.

**Shoulder surfing of the settings page.** Sensitive fields come back from the
config API as the mask token (`******`) with `is_masked: true`; the Web UI
renders them as password inputs. Revealing a value takes an explicit tap on the
eye control, and the revealed value is only what the user typed in that
session, because the backend never sends a saved key back.

**Uninstalling.** Removing the app deletes its private directory, including
`.env`, the database and the Loopback token. There is no separate wipe step.

## What is not protected

**A rooted or unlocked device.** Root, a custom recovery, or an unlocked boot
loader lets an attacker read `files/state/.env` directly. Encrypting the file
with a Keystore key would not help: the key is readable on the same rooted
device, so it would only add complexity (ADR-0004).

**A malicious keyboard, clipboard manager, or accessibility service.** A key
typed into the settings page passes through the system keyboard and the
WebView's input handling. A keyboard that records keystrokes, or an
accessibility service that reads the screen, sees the key as the user types it.
The app cannot defend against this; the user has to trust their input method.

**Screenshots and screen recording.** The settings page is not marked
`FLAG_SECURE`, so a revealed key can be captured by a screenshot, a screen
recorder, or the recent-apps thumbnail. This is a deliberate trade: blocking
screenshots would also block the user from sharing a report.

**A compromised OS or a compromised WebView.** If the Android system or the
WebView engine is itself malicious, nothing in the app can be trusted.

**Network observers of provider traffic.** The app talks to LLM and search
providers over TLS, so a passive observer sees the destination but not the
key. A provider that logs keys, or a user who pastes a key into a phishing
site, is outside this model.

**Anything uploaded by the user.** The config export/import endpoints are
gated to an authenticated admin session (or desktop mode). If a user exports
`.env` and stores it somewhere else, that copy is outside the app's control.

## Why not a Keystore-backed store

`EncryptedSharedPreferences` and Keystore-wrapped files defend against an
attacker who can read the app directory but not run code as the app's user.
On Android that attacker is, in practice, root — and a rooted device can read
the Keystore-wrapped key material as well as the ciphertext. The realistic leak
paths for this app are auto-backup uploading `.env` off-device and the
unauthenticated loopback port, and those are closed by backup exclusion and the
Loopback token. A second secret store would duplicate the config layer to
defend against an attacker who already defeats it. ADR-0004 records the same
reasoning; revisit it if the app ever stores keys for a non-root threat, such
as a shared device profile.
