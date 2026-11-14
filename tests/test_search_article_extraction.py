# -*- coding: utf-8 -*-
"""Article text extraction without newspaper3k.

The Android release build drops ``newspaper3k`` (and with it ``jieba`` and
``nltk``), so ``src.search_service`` must import without it and extract article
text with its bs4 fallback. These tests pin that contract through the public
``fetch_url_content`` entry point.
"""

import sys
import unittest
from unittest.mock import MagicMock, patch

from src import search_service
from src.search_service import _extract_article_text_with_bs4, fetch_url_content


ARTICLE_HTML = """
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>贵州茅台发布年度报告</title>
    <style>.ad { display: none; }</style>
    <script>window.__tracking = "should not appear";</script>
  </head>
  <body>
    <nav><a href="/">首页</a><a href="/stock">行情</a></nav>
    <header>贵州茅台</header>
    <div class="article-content">
      <h1>贵州茅台发布年度报告</h1>
      <p>公司今日发布年度报告，营业收入同比增长百分之十五，净利润增速高于市场预期。</p>
      <p>管理层表示，直营渠道占比继续提升，系列酒收入保持双位数增长，现金流状况稳健。</p>
      <p>分析人士认为，高端白酒需求在节假日前夕回暖，渠道库存处于合理区间。</p>
    </div>
    <aside class="ad">广告：开户送好礼</aside>
    <footer>版权所有 © 示例财经</footer>
  </body>
</html>
"""


class _FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code
        self.encoding = "utf-8"
        self.apparent_encoding = "utf-8"

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class TestArticleExtractionWithoutNewspaper(unittest.TestCase):
    """The bs4 fallback produces usable article text on its own."""

    def setUp(self) -> None:
        # Simulate the trimmed Android build, where newspaper3k is not installed.
        for name, value in (
            ("_NewspaperArticle", None),
            ("_NewspaperConfig", None),
        ):
            patcher = patch.object(search_service, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_bs4_extraction_returns_article_body(self) -> None:
        text = _extract_article_text_with_bs4(ARTICLE_HTML)

        self.assertIn("营业收入同比增长百分之十五", text)
        self.assertIn("直营渠道占比继续提升", text)
        self.assertIn("高端白酒需求在节假日前夕回暖", text)
        self.assertIn("贵州茅台发布年度报告", text)

    def test_bs4_extraction_drops_boilerplate(self) -> None:
        text = _extract_article_text_with_bs4(ARTICLE_HTML)

        self.assertNotIn("should not appear", text)
        self.assertNotIn("display: none", text)
        self.assertNotIn("广告：开户送好礼", text)
        self.assertNotIn("版权所有", text)

    def test_bs4_extraction_falls_back_to_paragraphs_without_a_body_container(self) -> None:
        html = (
            "<html><body><div>"
            + "<p>第一条新闻正文，描述公司季度业绩与毛利率变化。</p>"
            + "<p>第二条新闻正文，描述管理层对下一季度的指引。</p>"
            + "</div></body></html>"
        )

        text = _extract_article_text_with_bs4(html)

        self.assertIn("第一条新闻正文", text)
        self.assertIn("第二条新闻正文", text)

    def test_fetch_url_content_uses_bs4_when_newspaper_is_missing(self) -> None:
        with patch(
            "src.search_service.requests.get",
            return_value=_FakeResponse(ARTICLE_HTML),
        ) as mock_get:
            text = fetch_url_content("https://example.com/news/1", timeout=3)

        self.assertIn("营业收入同比增长百分之十五", text)
        mock_get.assert_called_once()
        self.assertEqual(mock_get.call_args.kwargs["timeout"], 3)
        self.assertIn("User-Agent", mock_get.call_args.kwargs["headers"])

    def test_fetch_url_content_truncates_to_the_article_limit(self) -> None:
        long_html = "<html><body><article><p>" + ("很长的正文内容。" * 500) + "</p></article></body></html>"

        with patch("src.search_service.requests.get", return_value=_FakeResponse(long_html)):
            text = fetch_url_content("https://example.com/news/long")

        self.assertTrue(text)
        self.assertLessEqual(len(text), search_service._ARTICLE_MAX_CHARS)

    def test_fetch_url_content_returns_empty_when_the_page_cannot_be_fetched(self) -> None:
        with patch("src.search_service.requests.get", side_effect=RuntimeError("network down")):
            self.assertEqual(fetch_url_content("https://example.com/news/2"), "")

    def test_newspaper_is_preferred_when_installed(self) -> None:
        article = MagicMock()
        article.text = "newspaper 提取的正文\n\n第二段"
        article_cls = MagicMock(return_value=article)
        config_cls = MagicMock()

        with patch.object(search_service, "_NewspaperArticle", article_cls), patch.object(
            search_service, "_NewspaperConfig", config_cls
        ), patch("src.search_service.requests.get") as mock_get:
            text = fetch_url_content("https://example.com/news/3")

        self.assertEqual(text, "newspaper 提取的正文\n第二段")
        article.download.assert_called_once_with()
        article.parse.assert_called_once_with()
        mock_get.assert_not_called()

    def test_fetch_url_content_falls_back_when_newspaper_raises(self) -> None:
        article_cls = MagicMock(side_effect=RuntimeError("newspaper broke"))

        with patch.object(search_service, "_NewspaperArticle", article_cls), patch.object(
            search_service, "_NewspaperConfig", MagicMock()
        ), patch("src.search_service.requests.get", return_value=_FakeResponse(ARTICLE_HTML)):
            text = fetch_url_content("https://example.com/news/4")

        self.assertIn("营业收入同比增长百分之十五", text)


class TestSearchServiceImportWithNewspaperBlocked(unittest.TestCase):
    """A fresh import with newspaper3k blocked must succeed and keep the fallback."""

    def test_module_imports_and_extracts_with_newspaper_blocked(self) -> None:
        import importlib

        blocked = {
            name: None
            for name in list(sys.modules)
            if name == "newspaper" or name.startswith("newspaper.")
        }
        with patch.dict(sys.modules, blocked):
            reloaded = importlib.reload(search_service)
            try:
                self.assertIsNone(reloaded._NewspaperArticle)
                text = reloaded._extract_article_text_with_bs4(ARTICLE_HTML)
                self.assertIn("营业收入同比增长百分之十五", text)
            finally:
                # Restore the module the rest of the suite imported.
                importlib.reload(search_service)


if __name__ == "__main__":
    unittest.main()
