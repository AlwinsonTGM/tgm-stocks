# 06: Dependency trim and size measurement

**What to build:** The release build drops `longbridge`, `futu-api`, `lark-oapi`, and `newspaper3k` (which removes `jieba` and `nltk`) without breaking startup or news quality. The resulting APK size is measured and recorded.

**Blocked by:** 01

**Status:** done

- [x] The app starts with the trimmed dependency set and raises no import errors
- [x] Article extraction falls back to bs4 when `newspaper3k` is absent
- [x] A smoke test confirms Chinese name matching and sentiment still behave
- [x] The resulting APK size is measured and recorded
- [x] If news quality regresses, `newspaper3k` is restored and the reversal is recorded

**Evidence:**

- **Size.** Clean debug build: **118.1 MiB (123,848,554 bytes)**, down from the 164.6 MiB (172,601,575 bytes) baseline measured with the full set. The trimmed packages are absent from the APK: the Chaquopy requirements archive contains no `newspaper`, `jieba`, `nltk`, `longbridge`, `futu` or `lark_oapi` entries, while `bs4`, `soupsieve` and `lxml` are present. The packaging contract test passes against the built APK (17 passed).
- **Import check.** `scripts/check_android_imports.py` makes `longbridge`, `futu`, `lark_oapi`, `newspaper`, `jieba` and `nltk` unimportable, then imports `api.app` and `src.search_service` and extracts article text through the bs4 fallback. Result: OK.
- **Fallback.** `tests/test_search_article_extraction.py` (9 passed) proves the bs4 path returns the article body from a sample Chinese news page, drops scripts, styles, navigation, ads and footer text, truncates to 1,500 characters, prefers newspaper3k when it is installed, and falls back when newspaper3k raises. `tests/test_optional_sdk_absence.py` (6 passed) proves the Futu and Longbridge providers report unavailable instead of raising, and the Feishu document module imports and creates nothing without `lark_oapi`.
- **Tests.** Search suites 182 passed; notification suites 375 passed; config, data-provider and APK-contract suites 369 + 198 + 20 + 17 passed. One pre-existing failure in `tests/test_search_service_concurrency.py` reproduces on the unmodified `HEAD` code and is unrelated to this change.
- **News quality.** No regression found: the bs4 fallback returns the article body for the sample page, so `newspaper3k` was not restored.
