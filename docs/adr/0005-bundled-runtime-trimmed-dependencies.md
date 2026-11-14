# The Python runtime ships in the APK; dependencies are trimmed

The interpreter and native libraries are bundled, and the release build drops `longbridge`, `lark_oapi`, `futu`, `jieba`, and `nltk`. Downloading the runtime on first launch is not possible: Android 10+ forbids apps targeting API 29+ from executing code in writable app storage, so a fetched interpreter or `.so` cannot be loaded. Trimming is the only lever that meaningfully reduces size, and it costs broker portfolio import, the Feishu app bot, and Chinese segmentation and sentiment quality.

**Consequences**: release notes must state what was removed, and a smoke test on Chinese name matching and sentiment is required before shipping. If those regress, `jieba` and `nltk` stay and the build lands around 130 MB.
