# 06: Dependency trim and size measurement

**What to build:** The release build drops `longbridge`, `futu-api`, `lark-oapi`, and `newspaper3k` (which removes `jieba` and `nltk`) without breaking startup or news quality. The resulting APK size is measured and recorded.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The app starts with the trimmed dependency set and raises no import errors
- [ ] Article extraction falls back to bs4 when `newspaper3k` is absent
- [ ] A smoke test confirms Chinese name matching and sentiment still behave
- [ ] The resulting APK size is measured and recorded
- [ ] If news quality regresses, `newspaper3k` is restored and the reversal is recorded
