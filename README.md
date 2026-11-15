<div align="center">

# TGM Stocks

**An open-source Android app for daily stock analysis. The whole pipeline runs on your phone.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Android 7+](https://img.shields.io/badge/Android-7.0%2B-3DDC84?logo=android&logoColor=white)](https://developer.android.com)
[![Latest release](https://img.shields.io/github/v/release/AlwinsonTGM/tgm-stocks)](https://github.com/AlwinsonTGM/tgm-stocks/releases/latest)

[**Download the latest APK**](https://github.com/AlwinsonTGM/tgm-stocks/releases/latest) · [Report an issue](https://github.com/AlwinsonTGM/tgm-stocks/issues)

</div>

## What it is

TGM Stocks is an Android distribution of [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis). It bundles the Python analysis backend and the web UI into a single APK, so market data, news search, LLM analysis and the report all run on the device.

There is no account and no server operated by this project. Your API keys stay on your phone.

## Install

1. Download `app-release.apk` from [Releases](https://github.com/AlwinsonTGM/tgm-stocks/releases/latest).
2. Allow installation from this source when Android asks.
3. Open the app, go to **Settings → AI models**, and add your LLM API key. A news search key (Tavily or Brave) is optional, but without one reports carry no news evidence.

Requires Android 7.0+ on a 64-bit ARM device. The APK is about 118 MiB because it bundles a Python runtime; nothing is downloaded and executed at launch.

## What it does

- Watchlist, one-off analysis, report viewing, and history
- News search through Tavily, Brave, Bocha, SerpAPI, or a self-hosted SearXNG
- A per-install loopback token, so other apps on the phone cannot read your portfolio or reports
- API keys stored in app-private storage and excluded from Android backup
- An analysis keeps running when you switch apps
- English and Chinese UI, light and dark themes

## What this build changes from upstream

To keep the APK smaller and to avoid shipping features Android cannot honour, this build removes:

- Broker portfolio import (Futu, Longbridge)
- The Feishu application bot — webhook notifications still work
- Scheduled analysis and image-rendered notifications — the switches are hidden and the API refuses them

Agent chat, market review, screening, and backtest are present but were not part of the tested v1 scope.

## Build from source

Requirements: JDK 17+, Android SDK platform 36, Node.js 20+, and a CPython 3.13 interpreter for the host machine.

```powershell
$env:TGMS_BUILD_PYTHON = "C:\path\to\python3.13\python.exe"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1
```

The script builds the web UI, stages the Python source, and assembles the APK. Release builds additionally read `TGMS_KEYSTORE_PATH`, `TGMS_KEYSTORE_PASSWORD`, `TGMS_KEY_ALIAS` and `TGMS_KEY_PASSWORD`; no key material is stored in this repository. See [`android/README.md`](android/README.md) for signing, version bumps, and the dependency trim.

## Project layout

| Path | Purpose |
| --- | --- |
| `android/` | The Android app: Gradle module, Chaquopy bootstrap, build scripts |
| `apps/dsa-web/` | The web UI rendered inside the app |
| `src/`, `data_provider/`, `api/` | The analysis backend |
| `docs/adr/` | Architecture decisions for this distribution |
| `.scratch/tgm-stocks/` | The spec and the tickets that built it |

## Credits and license

TGM Stocks is built on [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) and the work of its contributors — the analysis engine, the data-provider fallbacks, the web UI, and the documentation are theirs. This repository packages that work for Android and adds the on-device runtime, the loopback token, the Android feature profile, and the release pipeline.

The upstream project is MIT-licensed. The original copyright notice is retained in [`LICENSE`](LICENSE), and [`NOTICE`](NOTICE) records the derivation. This distribution is released under the same license.
