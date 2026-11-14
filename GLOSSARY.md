# TGM Stocks

An open-source Android app that runs the daily stock analysis pipeline on the phone itself. This glossary fixes the words used to describe that app, so "the app", "the backend", and "the web UI" never get confused for one another.

## Language

**TGM Stocks**:
The Android application this repository ships. The product.
_Avoid_: DSA app, mobile web app, the site

**Android app**:
The installable APK: an on-device backend plus the web UI rendered in a WebView.
_Avoid_: mobile version, port

**On-device backend**:
The embedded Python runtime and FastAPI server that run inside the APK, on the phone.
_Avoid_: local server, embedded server, the API

**Web UI**:
The React frontend in `apps/dsa-web`, rendered inside the Android app's WebView. It is a surface of the app, not a separate deliverable.
_Avoid_: web app, website, frontend product

**Probe**:
The feasibility build under `work/android-original-probe` that proved the backend runs on Android. It is evidence, not the product.
_Avoid_: prototype app, demo APK

**Upstream**:
`ZhuLinsen/daily_stock_analysis`, the MIT-licensed project TGM Stocks is derived from.
_Avoid_: original repo, source project

**Release build**:
The signed, trimmed APK published on GitHub Releases. Distinct from the probe's debug build.
_Avoid_: production APK, final build

**Loopback token**:
A random per-install secret the WebView presents to the on-device backend. Requests without it are rejected.
_Avoid_: API key, auth token
