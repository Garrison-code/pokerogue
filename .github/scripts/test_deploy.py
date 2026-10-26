# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
import os
import tempfile
import unittest
from unittest.mock import patch

import dev_deploy as d
import publish_notify as p

IMAGES = [
    {"repository": p.REPOSITORIES[0], "image": "ghcr.io/garrison-code/pokerogue:develop",
     "digest": "sha256:" + "1" * 64, "revision": "a" * 40, "build_id": "123-1"},
    {"repository": p.REPOSITORIES[1], "image": "ghcr.io/garrison-code/rogueserver:develop",
     "digest": "sha256:" + "2" * 64, "revision": "b" * 40, "build_id": "456-1"},
]

class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        environment = patch.dict(os.environ, {
            "RUNNER_TEMP": self.directory.name, "GITHUB_REPOSITORY": p.REPOSITORIES[0],
            "GITHUB_REF": "refs/heads/develop", "GITHUB_SHA": "a" * 40,
            "GITHUB_RUN_ID": "999", "DEPLOY_MODE": "deploy", "SOURCE_REPOSITORY": "",
            "SOURCE_SHA": "", "SOURCE_RUN_ID": "", "RESUME": "false",
            "DEV_AUTO_DEPLOY_ENABLED": "true", "GH_TOKEN": "token",
            "DEV_DEPLOY_GH_TOKEN": "github-token", "COOLIFY_READ_TOKEN": "read",
            "COOLIFY_DEPLOY_TOKEN": "deploy", "DEV_SMOKE_USERNAME": "ci-fixture",
            "DEV_SMOKE_PASSWORD": "secret", "DEV_SMOKE_CLIENT_ID": "c" * 32,
        }, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def state(self, mode="deploy"):
        value = {"mode": mode, "images": IMAGES, "pair_key": d.pair_key(IMAGES),
                 "verified": False, "restart_attempted": False, "deployment_id": 42}
        d.save_state(value)
        return value

    def test_disabled_automatic_request_does_not_inspect_or_restart(self):
        os.environ.update(SOURCE_REPOSITORY=p.REPOSITORIES[0], DEV_AUTO_DEPLOY_ENABLED="false")
        with patch.object(d, "snapshot") as snapshot, patch.object(d, "gh") as gh:
            d.prepare()
            snapshot.assert_not_called()
            gh.assert_not_called()

    def test_only_develop_can_reach_the_coordinator(self):
        os.environ["GITHUB_REF"] = "refs/heads/beta"
        with self.assertRaises(d.Failure):
            d.prepare()

    def test_previous_failure_blocks_new_deployments(self):
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=({"id": 4}, "failure")
        ), patch.object(d, "gh") as gh:
            with self.assertRaises(d.Failure):
                d.prepare()
            gh.assert_not_called()

    def test_interrupted_deployment_requires_manual_resume(self):
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=({"id": 4}, "in_progress")
        ):
            with self.assertRaises(d.Failure):
                d.prepare()

    def test_duplicate_image_pair_is_not_restarted(self):
        old = {"id": 4, "payload": {"pair_key": d.pair_key(IMAGES)}}
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=(old, "success")
        ), patch.object(d, "gh") as gh:
            d.prepare()
            gh.assert_not_called()
            self.assertIsNone(d.load_state())

    def test_manual_resume_is_recorded_for_unhealthy_stack_recovery(self):
        os.environ["RESUME"] = "true"
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=({"id": 4}, "failure")
        ), patch.object(d, "gh", return_value={"id": 42}):
            d.prepare()
            self.assertTrue(d.load_state()["resume"])
            self.assertEqual(d.load_state()["deployment_id"], 42)

    def test_automated_request_cannot_clear_failure_latch(self):
        os.environ.update(SOURCE_REPOSITORY=p.REPOSITORIES[0], RESUME="true")
        with self.assertRaises(d.Failure):
            d.prepare()

    def test_stale_publisher_notification_is_skipped(self):
        os.environ.update(SOURCE_REPOSITORY=p.REPOSITORIES[0], SOURCE_SHA="c" * 40, SOURCE_RUN_ID="12")
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(d, "gh") as gh:
            d.prepare()
            gh.assert_not_called()

    def test_check_mode_does_not_restart_or_log_in(self):
        self.state("check")
        with patch.object(d, "coolify_status", return_value=True), patch.object(
            d, "public_get", return_value={}
        ), patch.object(p, "http") as http, patch.object(d, "smoke") as smoke:
            d.execute()
            http.assert_not_called()
            smoke.assert_not_called()

    def test_restart_transport_failure_is_not_retried(self):
        self.state()
        with patch.object(d, "coolify_status", return_value=True), patch.object(
            p, "registry", side_effect=IMAGES
        ), patch.object(p, "http", side_effect=p.Failure("timeout")) as http:
            with self.assertRaises(d.Failure):
                d.execute()
            self.assertEqual(http.call_count, 1)
            self.assertTrue(d.load_state()["restart_attempted"])

    def test_queued_response_does_not_mean_success(self):
        self.state()
        with patch.object(d, "coolify_status", return_value=True), patch.object(
            p, "registry", side_effect=IMAGES
        ), patch.object(p, "http", return_value=({}, {"message": "queued"})), patch.object(
            d.time, "monotonic", side_effect=[0, 601]
        ):
            with self.assertRaises(d.Failure):
                d.execute()
            self.assertFalse(d.load_state()["verified"])

    def test_moving_tag_is_rejected_before_restart(self):
        self.state()
        changed = [IMAGES[0], {**IMAGES[1], "digest": "sha256:" + "3" * 64}]
        with patch.object(d, "coolify_status", return_value=True), patch.object(
            p, "registry", side_effect=changed
        ), patch.object(p, "http") as http:
            with self.assertRaises(d.Failure):
                d.execute()
            http.assert_not_called()

    def test_success_requires_all_verification(self):
        self.state()
        with patch.object(d, "coolify_status", return_value=True), patch.object(
            p, "registry", side_effect=IMAGES + IMAGES
        ), patch.object(p, "http", return_value=({}, {"message": "queued"})), patch.object(
            d, "build_matches", return_value=True
        ), patch.object(d.time, "monotonic", side_effect=[0, 1, 2, 3]), patch.object(
            d.time, "sleep"
        ), patch.object(d.subprocess, "run") as static, patch.object(d, "smoke") as smoke:
            d.execute()
            static.assert_called_once()
            smoke.assert_called_once()
            self.assertTrue(d.load_state()["verified"])

    def test_cancelled_or_unverified_deployment_is_marked_failed(self):
        self.state()
        os.environ["JOB_STATUS"] = "cancelled"
        with patch.object(d, "gh") as gh:
            d.finalize()
            self.assertEqual(gh.call_args.args[1]["state"], "failure")

    def test_missing_fixture_is_not_recreated(self):
        calls = []
        def fake(path, token=None, **kwargs):
            calls.append(path)
            if path == "/account/login":
                return 200, {"token": "private-session-token"}
            if path == "/account/info":
                return 200, {"username": os.environ["DEV_SMOKE_USERNAME"]}
            if path == "/account/logout":
                return 200, None
            return 200, {}
        with patch.object(d, "api", side_effect=fake):
            with self.assertRaises(d.Failure):
                d.smoke()
            self.assertFalse(any("update" in path for path in calls))
            self.assertEqual(calls[-1], "/account/logout")

    def test_smoke_session_update_includes_validated_trainer_and_secret_ids(self):
        system = {"trainerId": 12345, "secretId": 54321, "timestamp": 1}
        session = {"seed": "coolify-develop-smoke", "money": 3456,
                   "waveIndex": 2, "timestamp": 1}
        calls = []
        def fake(path, token=None, form=None, payload=None):
            calls.append(path)
            route, _, query = path.partition("?")
            if route == "/account/login":
                return 200, {"token": "private-session-token"}
            self.assertEqual(token, "private-session-token")
            if route == "/account/info":
                return 200, {"username": os.environ["DEV_SMOKE_USERNAME"]}
            if route == "/account/logout":
                return 200, None
            params = d.urllib.parse.parse_qs(query)
            self.assertEqual(params.get("clientSessionId"), ["c" * 32])
            if route.startswith("/savedata/session/"):
                self.assertEqual(params.get("slot"), ["0"])
            if route == "/savedata/system/get":
                return 200, dict(system)
            if route == "/savedata/session/get":
                return 200, dict(session)
            if route == "/savedata/system/update":
                system.update(payload)
                return 204, None
            if route == "/savedata/session/update":
                self.assertEqual(params.get("trainerId"), [str(system["trainerId"])])
                self.assertEqual(params.get("secretId"), [str(system["secretId"])])
                session.update(payload)
                return 200, None
            self.fail("Unexpected API route")
        with patch.object(d, "api", side_effect=fake), patch.object(d.time, "time", return_value=123):
            d.smoke()
        self.assertEqual(system["timestamp"], 123000)
        self.assertEqual(session["timestamp"], 123000)
        self.assertEqual(sum(path.startswith("/savedata/session/update?") for path in calls), 1)
        self.assertEqual(calls[-1], "/account/logout")

    def test_database_version_must_be_fixed(self):
        data = {"applications": [
            {"name": "frontend", "image": IMAGES[0]["image"], "status": "running:healthy"},
            {"name": "backend", "image": IMAGES[1]["image"], "status": "running:unknown"}],
            "databases": [{"name": "database", "image": "mariadb:11", "status": "running:healthy"}]}
        with patch.object(p, "http", return_value=({}, data)):
            with self.assertRaises(d.Failure):
                d.coolify_status()

if __name__ == "__main__":
    unittest.main()
