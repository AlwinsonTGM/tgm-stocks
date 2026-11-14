# -*- coding: utf-8 -*-
"""Optional SDKs are absent in the Android release build (ADR-0005).

``longbridge``, ``futu`` and ``lark_oapi`` are dropped from the Android
dependency set. Their modules must still import, and the features they back must
degrade to "unavailable" rather than raise ``ImportError`` at startup or report a
provider as healthy when its SDK cannot serve a request.
"""

import builtins
import importlib
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from data_provider.futu_fetcher import FutuFetcher
from data_provider.longbridge_fetcher import LongbridgeFetcher


def _import_raises_for(*roots: str):
    """Make ``import <root>`` raise ImportError, as on a machine without the SDK."""
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if any(name == root or name.startswith(f"{root}.") for root in roots):
            raise ImportError(f"No module named {name!r}")
        return real_import(name, *args, **kwargs)

    return patch("builtins.__import__", side_effect=fake_import)


def _longbridge_config() -> SimpleNamespace:
    return SimpleNamespace(
        longbridge_app_key="key",
        longbridge_app_secret="secret",
        longbridge_access_token="token",
        longbridge_oauth_client_id=None,
    )


class TestFutuWithoutSdk(unittest.TestCase):
    def test_provider_is_unavailable_even_with_an_opend_endpoint(self) -> None:
        fetcher = FutuFetcher()
        with _import_raises_for("futu"), patch.dict(
            os.environ, {"FUTU_OPEND_HOST": "127.0.0.1", "FUTU_OPEND_PORT": "11111"}
        ), patch("src.config.get_config", side_effect=RuntimeError("no config")):
            self.assertFalse(fetcher.is_available_for_request("realtime_quote"))

    def test_quote_requests_return_none_instead_of_raising(self) -> None:
        fetcher = FutuFetcher()
        with _import_raises_for("futu"), patch.dict(
            os.environ, {"FUTU_OPEND_HOST": "127.0.0.1", "FUTU_OPEND_PORT": "11111"}
        ), patch("src.config.get_config", side_effect=RuntimeError("no config")):
            self.assertIsNone(fetcher.get_realtime_quote("hk00700"))
            self.assertIsNone(fetcher.get_stock_name("00700"))


class TestLongbridgeWithoutSdk(unittest.TestCase):
    def test_provider_is_unavailable_even_with_legacy_credentials(self) -> None:
        fetcher = LongbridgeFetcher()
        with _import_raises_for("longbridge"), patch(
            "src.config.get_config", return_value=_longbridge_config()
        ):
            self.assertFalse(fetcher.is_available_for_request("realtime_quote"))

    def test_quote_requests_return_none_instead_of_raising(self) -> None:
        fetcher = LongbridgeFetcher()
        with _import_raises_for("longbridge"), patch(
            "src.config.get_config", return_value=_longbridge_config()
        ):
            self.assertIsNone(fetcher.get_realtime_quote("AAPL"))


class TestFeishuDocWithoutSdk(unittest.TestCase):
    def test_module_imports_without_lark_oapi(self) -> None:
        import src.feishu_doc as feishu_doc

        with _import_raises_for("lark_oapi"):
            reloaded = importlib.reload(feishu_doc)
            try:
                self.assertFalse(reloaded.LARK_SDK_AVAILABLE)
                self.assertIsNone(reloaded.lark)
            finally:
                importlib.reload(feishu_doc)

    def test_manager_creates_nothing_when_the_sdk_is_missing(self) -> None:
        import src.feishu_doc as feishu_doc

        configured = SimpleNamespace(
            feishu_app_id="app",
            feishu_app_secret="secret",
            feishu_folder_token="folder",
        )
        with patch.object(feishu_doc, "LARK_SDK_AVAILABLE", False), patch.object(
            feishu_doc, "lark", None
        ), patch.object(feishu_doc, "get_config", return_value=configured):
            manager = feishu_doc.FeishuDocManager()
            # Credentials are complete, but the SDK cannot serve the request.
            self.assertTrue(manager.is_configured())
            self.assertIsNone(manager.client)
            self.assertIsNone(manager.create_daily_doc("title", "# body"))


if __name__ == "__main__":
    unittest.main()
