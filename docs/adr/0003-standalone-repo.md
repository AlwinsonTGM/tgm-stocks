# Standalone repository, not a fork

TGM Stocks lives in its own repository rather than as a GitHub fork of `ZhuLinsen/daily_stock_analysis`. Upstream is MIT-licensed, so redistribution and renaming are permitted provided the copyright and permission notice are kept. A fork would present the app as a contribution branch of upstream and put the "forked from" badge in front of people downloading an APK.

**Considered options**: a GitHub fork (rejected as the product home; still fine as a throwaway for sending patches upstream).

**Consequences**: keep `LICENSE` and add a `NOTICE` crediting upstream; keep an `upstream` git remote and merge deliberately at release boundaries.
