"""Prove the on-device backend imports with the trimmed Android dependency set.

Run from the repository root with any Python 3.13 that has the Android
requirements installed:

    python scripts/check_android_imports.py

The release build drops longbridge, futu-api, lark-oapi and newspaper3k (which
also removes jieba and nltk). This script makes those modules unimportable, then
imports the API app and the search service exactly as the app does at startup.
"""

from __future__ import annotations

import builtins
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Top-level modules the Android build does not ship.
TRIMMED_MODULES = ("longbridge", "futu", "lark_oapi", "newspaper", "jieba", "nltk")

_real_import = builtins.__import__


def _import_without_trimmed_modules(name, globals=None, locals=None, fromlist=(), level=0):
    if level == 0 and any(name == mod or name.startswith(f"{mod}.") for mod in TRIMMED_MODULES):
        raise ImportError(f"No module named {name!r} (trimmed for Android)")
    return _real_import(name, globals, locals, fromlist, level)


def main() -> int:
    for mod in TRIMMED_MODULES:
        sys.modules.pop(mod, None)
    builtins.__import__ = _import_without_trimmed_modules

    import api.app as api_app
    import src.search_service as search_service

    assert api_app.app is not None, "api.app did not expose a FastAPI app"
    assert search_service._NewspaperArticle is None, "newspaper3k was still imported"
    text = search_service._extract_article_text_with_bs4(
        "<html><body><article><p>"
        + "贵州茅台发布年度报告，营业收入同比增长百分之十五，净利润增速高于市场预期。"
        + "</p></article></body></html>"
    )
    assert "营业收入同比增长百分之十五" in text, f"bs4 fallback produced no text: {text!r}"

    print("OK: api.app and src.search_service import with the trimmed dependency set")
    print(f"OK: bs4 fallback extracted {len(text)} characters of article text")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
