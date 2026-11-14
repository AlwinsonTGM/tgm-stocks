# -*- coding: utf-8 -*-
"""Secrets hardening: key entry, masking and log hygiene (ticket 03).

These tests exercise the same HTTP surface the Web UI uses from inside the
Android WebView: ``GET /api/v1/system/config`` returns the settings form,
``PUT /api/v1/system/config`` saves it, and the backend writes the values to
the app-private ``.env``. The WebView is a thin client over these routes, so
covering them at the API level covers key entry end to end.

The log test writes a known secret through the config API and asserts the value
never appears in captured log output, at every log level.
"""

import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tests.litellm_stub import ensure_litellm_stub

ensure_litellm_stub()

from api.v1.endpoints import system_config
from api.v1.schemas.system_config import UpdateSystemConfigRequest
from src.config import Config
from src.core.config_manager import ConfigManager
from src.core.config_registry import get_field_definition, get_registered_field_keys
from src.services.system_config_service import SystemConfigService

# A value no other test or fixture uses, shaped like a real provider key so a
# redaction rule that matches key-shaped strings would still be caught here.
_SECRET_KEY = "GEMINI_API_KEY"
_SECRET_VALUE = "AIzaSyTicket03SecretValueNeverLogged0000"


class _ConfigApiTestCase(unittest.TestCase):
    """Shared fixture: an isolated `.env` behind a config service."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env_path = Path(self.temp_dir.name) / ".env"
        self.env_path.write_text(
            "\n".join(
                [
                    "STOCK_LIST=AAPL",
                    "REPORT_LANGUAGE=en",
                    "ADMIN_AUTH_ENABLED=true",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        self._orig_env_file = os.environ.get("ENV_FILE")
        self._orig_database_path = os.environ.get("DATABASE_PATH")
        os.environ["ENV_FILE"] = str(self.env_path)
        os.environ["DATABASE_PATH"] = str(Path(self.temp_dir.name) / "secrets_hardening.db")
        Config.reset_instance()
        self.manager = ConfigManager(env_path=self.env_path)
        self.service = SystemConfigService(manager=self.manager)

    def tearDown(self) -> None:
        Config.reset_instance()
        for name, original in (
            ("ENV_FILE", self._orig_env_file),
            ("DATABASE_PATH", self._orig_database_path),
        ):
            if original is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = original
        self.temp_dir.cleanup()

    def _read_config(self) -> dict:
        return system_config.get_system_config(
            include_schema=True,
            service=self.service,
        ).model_dump(by_alias=True)

    def _items_by_key(self, payload: dict) -> dict:
        return {item["key"]: item for item in payload["items"]}

    def _save(self, items: list[dict], reload_now: bool = False) -> dict:
        payload = self._read_config()
        return system_config.update_system_config(
            request=UpdateSystemConfigRequest(
                config_version=payload["config_version"],
                mask_token=payload["mask_token"],
                reload_now=reload_now,
                items=items,
            ),
            service=self.service,
        ).model_dump()

    def _restart_service(self) -> SystemConfigService:
        """Simulate an app restart: fresh manager and service over the same file."""
        Config.reset_instance()
        self.manager = ConfigManager(env_path=self.env_path)
        self.service = SystemConfigService(manager=self.manager)
        return self.service


class KeyEntryEndToEndTestCase(_ConfigApiTestCase):
    """Enter a key, save, restart, and the next analysis reads it."""

    def test_key_entered_through_config_api_reaches_the_private_env(self) -> None:
        result = self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}])

        self.assertTrue(result["success"])
        self.assertEqual(result["applied_count"], 1)
        self.assertIn(f"{_SECRET_KEY}={_SECRET_VALUE}", self.env_path.read_text(encoding="utf-8"))

    def test_saved_key_reads_back_masked_after_restart(self) -> None:
        self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}])
        self._restart_service()

        payload = self._read_config()
        item = self._items_by_key(payload)[_SECRET_KEY]

        self.assertEqual(item["value"], payload["mask_token"])
        self.assertTrue(item["is_masked"])
        self.assertTrue(item["raw_value_exists"])
        self.assertNotIn(_SECRET_VALUE, str(payload))

    def test_saved_key_survives_reload_and_is_used_by_the_next_analysis(self) -> None:
        self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}], reload_now=True)
        self._restart_service()

        # A restart loads .env into the process environment, which is where the
        # analysis pipeline reads provider keys from.
        from src.config import setup_env

        with patch.dict(os.environ, {"ENV_FILE": str(self.env_path)}, clear=False):
            setup_env(override=True)
            self.assertEqual(os.environ.get(_SECRET_KEY), _SECRET_VALUE)

    def test_resubmitting_the_mask_token_keeps_the_saved_key(self) -> None:
        self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}])
        payload = self._read_config()
        mask_token = payload["mask_token"]

        result = self._save(
            [
                {"key": _SECRET_KEY, "value": mask_token},
                {"key": "STOCK_LIST", "value": "AAPL,MSFT"},
            ]
        )

        self.assertEqual(result["skipped_masked_count"], 1)
        env_text = self.env_path.read_text(encoding="utf-8")
        self.assertIn(f"{_SECRET_KEY}={_SECRET_VALUE}", env_text)
        self.assertIn("STOCK_LIST=AAPL,MSFT", env_text)


class SecretMaskingTestCase(_ConfigApiTestCase):
    """Sensitive fields come back masked; revealing one is a client-side action."""

    def test_every_sensitive_field_is_masked_in_the_config_response(self) -> None:
        sensitive_keys = [
            key
            for key in get_registered_field_keys()
            if get_field_definition(key).get("is_sensitive")
        ]
        self.assertTrue(sensitive_keys, "registry has no sensitive fields to check")
        self.env_path.write_text(
            "\n".join(f"{key}=sensitive-value-for-{key.lower()}" for key in sensitive_keys) + "\n",
            encoding="utf-8",
        )
        self._restart_service()

        item_map = self._items_by_key(self._read_config())
        for key in sensitive_keys:
            with self.subTest(key=key):
                item = item_map[key]
                self.assertTrue(item["schema"]["is_sensitive"])
                self.assertEqual(item["schema"]["ui_control"], "password")
                self.assertEqual(item["value"], "******")
                self.assertTrue(item["is_masked"])
                self.assertNotIn("sensitive-value-for-", item["value"])

    def test_config_response_never_contains_a_saved_secret_value(self) -> None:
        self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}])

        self.assertNotIn(_SECRET_VALUE, str(self._read_config()))


class SecretLogHygieneTestCase(_ConfigApiTestCase):
    """A key written through the config API never appears in log output."""

    def _capture_all_levels(self, action) -> str:
        """Run ``action`` with every logger level enabled and return the output.

        A handler on the root logger (rather than ``assertLogs``) records every
        record regardless of logger levels, so nothing a save could log is
        filtered out before the assertion looks at it.
        """
        records: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                records.append(self.format(record))

        handler = _Capture(level=logging.NOTSET)
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
        root = logging.getLogger()
        original_level = root.level
        root.addHandler(handler)
        root.setLevel(logging.DEBUG)
        previous_disable = logging.root.manager.disable
        logging.disable(logging.NOTSET)
        try:
            action()
        finally:
            logging.disable(previous_disable)
            root.removeHandler(handler)
            root.setLevel(original_level)
        return "\n".join(records)

    def test_saved_key_never_appears_in_logs(self) -> None:
        def enter_and_read_back() -> None:
            # A probe record proves the capture is wired up; if it is missing the
            # value assertion below would pass vacuously.
            logging.getLogger("src.secrets_hardening_probe").debug("capture probe")
            self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}], reload_now=True)
            self._read_config()
            self._restart_service()
            self._read_config()

        output = self._capture_all_levels(enter_and_read_back)

        self.assertIn("capture probe", output)
        # The key name is not a secret and may appear; only the value must not.
        self.assertNotIn(_SECRET_VALUE, output)

    def test_masked_resubmission_does_not_log_the_key(self) -> None:
        self._save([{"key": _SECRET_KEY, "value": _SECRET_VALUE}])
        mask_token = self._read_config()["mask_token"]

        output = self._capture_all_levels(
            lambda: self._save([{"key": _SECRET_KEY, "value": mask_token}])
        )

        self.assertNotIn(_SECRET_VALUE, output)

    def test_search_provider_error_log_does_not_contain_the_key(self) -> None:
        from src.search_service import TavilySearchProvider

        provider = TavilySearchProvider([_SECRET_VALUE])

        with self.assertLogs(level=logging.WARNING) as captured:
            provider._record_error(_SECRET_VALUE)

        output = "\n".join(captured.output)
        self.assertNotIn(_SECRET_VALUE, output)
        self.assertNotIn(_SECRET_VALUE[:8], output)


if __name__ == "__main__":
    unittest.main()
