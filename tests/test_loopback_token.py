# -*- coding: utf-8 -*-
"""Tests for the Loopback token that protects the on-device backend."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.app import create_app
from api.middlewares.loopback_token import LOOPBACK_TOKEN_COOKIE, LOOPBACK_TOKEN_ENV

_TOKEN = "test-loopback-token-7f3c"

# A page, a static asset and an API route: the WebView loads all three, so the
# token has to cover every kind of request, not just /api/v1/*.
_PROTECTED_PATHS = ("/", "/api/health")


class LoopbackTokenRequiredTestCase(unittest.TestCase):
    """With a token configured, only requests that present it are served."""

    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory()
        static_dir = Path(cls._temp_dir.name)
        (static_dir / "assets").mkdir()
        (static_dir / "index.html").write_text("<!doctype html><div id=\"root\"></div>", encoding="utf-8")
        cls._env = patch.dict("os.environ", {LOOPBACK_TOKEN_ENV: _TOKEN})
        cls._env.start()
        cls.client = TestClient(create_app(static_dir=static_dir))

    @classmethod
    def tearDownClass(cls):
        cls._env.stop()
        cls._temp_dir.cleanup()

    def test_request_without_token_is_rejected(self):
        for path in _PROTECTED_PATHS:
            with self.subTest(path=path):
                resp = self.client.get(path)
                self.assertEqual(resp.status_code, 401)
                self.assertEqual(resp.json()["error"], "loopback_token_required")

    def test_request_with_wrong_token_is_rejected(self):
        for path in _PROTECTED_PATHS:
            with self.subTest(path=path):
                resp = self.client.get(path, headers={"Authorization": "Bearer not-the-token"})
                self.assertEqual(resp.status_code, 401)
            with self.subTest(path=path, via="cookie"):
                resp = self.client.get(path, headers={"Cookie": f"{LOOPBACK_TOKEN_COOKIE}=not-the-token"})
                self.assertEqual(resp.status_code, 401)

    def test_cookie_token_is_accepted(self):
        for path in _PROTECTED_PATHS:
            with self.subTest(path=path):
                resp = self.client.get(path, headers={"Cookie": f"{LOOPBACK_TOKEN_COOKIE}={_TOKEN}"})
                self.assertEqual(resp.status_code, 200)

    def test_bearer_token_is_accepted(self):
        for path in _PROTECTED_PATHS:
            with self.subTest(path=path):
                resp = self.client.get(path, headers={"Authorization": f"Bearer {_TOKEN}"})
                self.assertEqual(resp.status_code, 200)

    def test_token_is_not_written_to_logs(self):
        with self.assertLogs(level="DEBUG") as captured:
            self.client.get("/api/health")
            self.client.get("/api/health", headers={"Authorization": f"Bearer {_TOKEN}"})
        self.assertNotIn(_TOKEN, "\n".join(captured.output))


class LoopbackTokenUnsetTestCase(unittest.TestCase):
    """Without a token (desktop, tests) the backend behaves as before."""

    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory()
        static_dir = Path(cls._temp_dir.name)
        (static_dir / "assets").mkdir()
        (static_dir / "index.html").write_text("<!doctype html><div id=\"root\"></div>", encoding="utf-8")
        cls._env = patch.dict("os.environ", {LOOPBACK_TOKEN_ENV: ""})
        cls._env.start()
        cls.client = TestClient(create_app(static_dir=static_dir))

    @classmethod
    def tearDownClass(cls):
        cls._env.stop()
        cls._temp_dir.cleanup()

    def test_request_without_token_is_served(self):
        for path in _PROTECTED_PATHS:
            with self.subTest(path=path):
                resp = self.client.get(path)
                self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
