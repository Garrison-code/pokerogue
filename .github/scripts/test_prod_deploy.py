# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import prod_deploy as d
import publish_production as p

IMAGES = [
    {"repository": p.REPOSITORIES[0], "image": "ghcr.io/garrison-code/pokerogue:latest",
     "digest": "sha256:" + "1" * 64, "revision": "a" * 40, "build_id": "123-1"},
    {"repository": p.REPOSITORIES[1], "image": "ghcr.io/garrison-code/rogueserver:latest",
     "digest": "sha256:" + "2" * 64, "revision": "b" * 40, "build_id": "456-1"},
]

class ProductionCoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        environment = patch.dict(os.environ, {
            "RUNNER_TEMP": self.directory.name, "GITHUB_REPOSITORY": p.REPOSITORIES[0],
            "GITHUB_REF": "refs/heads/beta", "GITHUB_SHA": "a" * 40,
            "GITHUB_RUN_ID": "999", "DEPLOY_MODE": "deploy", "SOURCE_REPOSITORY": "",
            "SOURCE_SHA": "", "SOURCE_RUN_ID": "", "RESUME": "false",
            "PROD_AUTO_DEPLOY_ENABLED": "true", "GH_TOKEN": "token",
            "PROD_DEPLOY_GH_TOKEN": "github-token", "COOLIFY_READ_TOKEN": "read",
            "COOLIFY_DEPLOY_TOKEN": "deploy", "PROD_SMOKE_USERNAME": "ci-fixture",
            "PROD_SMOKE_PASSWORD": "secret", "PROD_SMOKE_CLIENT_ID": "c" * 32,
        }, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def state(self, mode="deploy"):
        value = {"mode": mode, "images": IMAGES, "pair_key": d.pair_key(IMAGES),
                 "verified": False, "restart_attempted": False, "deployment_id": 42}
        d.save_state(value)
        return value

    def test_disabled_automatic_request_does_not_inspect_or_restart(self):
        os.environ.update(SOURCE_REPOSITORY=p.REPOSITORIES[0], PROD_AUTO_DEPLOY_ENABLED="false")
        with patch.object(d, "snapshot") as snapshot, patch.object(d, "gh") as gh:
            d.prepare()
            snapshot.assert_not_called()
            gh.assert_not_called()

    def test_only_beta_can_reach_the_coordinator(self):
        os.environ["GITHUB_REF"] = "refs/heads/develop"
        with self.assertRaises(d.Failure):
            d.prepare()

    def test_terminal_failure_does_not_block_a_subsequent_deployment(self):
        for status in ("failure", "error"):
            for same_pair in (False, True):
                with self.subTest(status=status, same_pair=same_pair):
                    old = {"id": 4, "payload": {
                        "pair_key": d.pair_key(IMAGES) if same_pair else "older-pair",
                    }}
                    os.environ.update(SOURCE_REPOSITORY=p.REPOSITORIES[0],
                                      SOURCE_SHA=IMAGES[0]["revision"], SOURCE_RUN_ID="123")
                    with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
                        d, "latest_record", return_value=(old, status)
                    ), patch.object(d, "gh", return_value={"id": 42}) as gh:
                        d.prepare()
                        self.assertEqual(d.load_state()["deployment_id"], 42)
                        self.assertFalse(d.load_state()["resume"])
                        self.assertEqual(gh.call_args_list[0].args[2], "POST")

    def test_unfinished_deployment_requires_manual_resume(self):
        for status in ("in_progress", "pending", "queued"):
            with self.subTest(status=status), patch.object(
                d, "snapshot", return_value=IMAGES
            ), patch.object(d, "latest_record", return_value=({"id": 4}, status)), patch.object(d, "gh") as gh:
                with self.assertRaisesRegex(d.Failure, "Previous deployment 4 is unfinished"):
                    d.prepare()
                gh.assert_not_called()

    def test_missing_deployment_status_is_treated_as_unfinished(self):
        with patch.object(d, "gh", side_effect=[[{"id": 4}], []]):
            self.assertEqual(d.latest_record(), ({"id": 4}, "in_progress"))

    def test_duplicate_image_pair_is_not_restarted(self):
        old = {"id": 4, "payload": {"pair_key": d.pair_key(IMAGES)}}
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=(old, "success")
        ), patch.object(d, "gh") as gh:
            d.prepare()
            gh.assert_not_called()
            self.assertIsNone(d.load_state())

    def test_manual_retry_can_recover_an_unfinished_deployment(self):
        os.environ["RESUME"] = "true"
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=({"id": 4}, "in_progress")
        ), patch.object(d, "gh", return_value={"id": 42}):
            d.prepare()
            self.assertTrue(d.load_state()["resume"])
            self.assertEqual(d.load_state()["deployment_id"], 42)

    def test_automated_request_cannot_force_manual_retry(self):
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

    def test_deployment_can_repair_an_unhealthy_application_without_resume(self):
        self.state()
        with patch.object(d, "coolify_status", side_effect=[False, True, True, True]), patch.object(
            p, "registry", side_effect=IMAGES + IMAGES
        ), patch.object(p, "http", return_value=({}, {"message": "queued"})) as http, patch.object(
            d, "build_matches", return_value=True
        ), patch.object(d.time, "monotonic", side_effect=[0, 1, 2, 3]), patch.object(
            d.time, "sleep"
        ), patch.object(d.subprocess, "run"), patch.object(d, "smoke") as smoke:
            d.execute()
            self.assertEqual(http.call_count, 1)
            smoke.assert_called_once()
            self.assertTrue(d.load_state()["verified"])

    def test_unhealthy_preflight_still_fails_without_restart(self):
        self.state("check")
        with patch.object(d, "coolify_status", return_value=False), patch.object(p, "http") as http:
            with self.assertRaisesRegex(d.Failure, "preflight check failed"):
                d.execute()
            http.assert_not_called()

    def test_unexpected_configuration_still_blocks_a_restart(self):
        self.state()
        with patch.object(d, "coolify_status", side_effect=d.Failure("Unexpected image reference")), patch.object(
            p, "http"
        ) as http:
            with self.assertRaisesRegex(d.Failure, "Unexpected image reference"):
                d.execute()
            http.assert_not_called()

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
            self.assertEqual(static.call_args.args[0][1:], [".github/scripts/prod_check_static.py", d.SITE, "PokéRogue (Garrix)"])
            smoke.assert_called_once()
            self.assertTrue(d.load_state()["verified"])

    def test_cancelled_or_unverified_deployment_is_marked_failed(self):
        self.state()
        os.environ["JOB_STATUS"] = "cancelled"
        with patch.object(d, "gh") as gh:
            d.finalize()
            self.assertEqual(gh.call_args.args[1]["state"], "failure")

    def test_failure_records_this_run_without_requiring_a_resume_for_later_versions(self):
        self.state()
        os.environ["JOB_STATUS"] = "failure"
        with patch.object(d, "gh") as gh, patch.object(d, "summary") as summary:
            d.finalize()
            self.assertEqual(gh.call_args.args[1]["state"], "failure")
            self.assertIn("Later versions remain eligible", gh.call_args.args[1]["description"])
            self.assertIn("Later versions remain eligible", summary.call_args.args[0])

    def test_missing_fixture_is_not_recreated(self):
        calls = []
        def fake(path, token=None, **kwargs):
            calls.append(path)
            if path == "/account/login":
                return 200, {"token": "private-session-token"}
            if path == "/account/info":
                return 200, {"username": os.environ["PROD_SMOKE_USERNAME"]}
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
        session = {"seed": "coolify-production-smoke", "money": 3456,
                   "waveIndex": 2, "timestamp": 1}
        calls = []
        def fake(path, token=None, form=None, payload=None):
            calls.append(path)
            route, _, query = path.partition("?")
            if route == "/account/login":
                return 200, {"token": "private-session-token"}
            self.assertEqual(token, "private-session-token")
            if route == "/account/info":
                return 200, {"username": os.environ["PROD_SMOKE_USERNAME"]}
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


    def test_api_reports_http_status_without_response_or_credentials(self):
        error = d.urllib.error.HTTPError(
            d.SITE + "/api/account/logout?private-query", 429,
            "private-reason", {}, io.BytesIO(b"private-response"),
        )
        with patch.object(d.time, "sleep"), patch.object(
            d.urllib.request, "urlopen", side_effect=error
        ):
            with self.assertRaises(d.Failure) as caught:
                d.api("/account/logout?private-query", "private-token")
        self.assertEqual(str(caught.exception),
                         "Deployment account/save API check failed: /account/logout (HTTP 429)")
        self.assertEqual(json.loads(d.temporary("production-deploy-report.json").read_text())["api_check"],
                         "/account/logout")

    def test_api_reports_transport_class_without_sensitive_reason(self):
        with patch.object(d.time, "sleep"), patch.object(
            d.urllib.request, "urlopen", side_effect=d.urllib.error.URLError("private-reason")
        ):
            with self.assertRaisesRegex(d.Failure, r"/account/logout \(transport URLError\)$"):
                d.api("/account/logout")

    def test_api_distinguishes_invalid_json_from_an_empty_success(self):
        for body, valid in ((b"not-json-private-body", False), (b"", True)):
            with self.subTest(valid=valid), patch.object(d.time, "sleep"), patch.object(
                d.urllib.request, "urlopen"
            ) as request:
                response = request.return_value.__enter__.return_value
                response.status = 200
                response.read.return_value = body
                if valid:
                    self.assertEqual(d.api("/account/logout"), (200, None))
                else:
                    with self.assertRaisesRegex(d.Failure, r"/account/logout \(invalid JSON response\)$"):
                        d.api("/account/logout")

    def test_logout_cleanup_failure_does_not_hide_save_failure(self):
        def fake(path, token=None, **kwargs):
            if path == "/account/login":
                return 200, {"token": "private-token"}
            if path == "/account/info":
                return 200, {"username": os.environ["PROD_SMOKE_USERNAME"]}
            if path == "/account/logout":
                raise d.Failure("logout transport failure")
            raise d.Failure("original save HTTP 503")
        with patch.object(d, "api", side_effect=fake), patch.object(d.sys, "stderr", io.StringIO()):
            with self.assertRaisesRegex(d.Failure, "^original save HTTP 503$"):
                d.smoke()
        report = json.loads(d.temporary("production-deploy-report.json").read_text())
        self.assertEqual(report["cleanup_error"], "logout transport failure")

    def test_logout_failure_still_fails_an_otherwise_successful_smoke(self):
        system = {"trainerId": 12345, "secretId": 54321}
        session = {"seed": "coolify-production-smoke", "money": 3456, "waveIndex": 2}
        def fake(path, token=None, payload=None, **kwargs):
            route = path.split("?")[0]
            if route == "/account/login":
                return 200, {"token": "private-token"}
            if route == "/account/info":
                return 200, {"username": os.environ["PROD_SMOKE_USERNAME"]}
            if route == "/account/logout":
                raise d.Failure("logout HTTP 429")
            data = system if "/system/" in route else session
            if payload is not None:
                data.update(payload)
                return (204 if data is system else 200), None
            return 200, dict(data)
        with patch.object(d, "api", side_effect=fake):
            with self.assertRaisesRegex(d.Failure, "^logout HTTP 429$"):
                d.smoke()

    def test_snapshot_requires_primary_publishers_without_waiting_for_dev_quality(self):
        with patch.object(p, "registry", side_effect=IMAGES), patch.object(
            p, "publication"
        ) as publication, patch.object(p.common, "quality") as quality:
            self.assertEqual(d.snapshot(), IMAGES)
            self.assertEqual(publication.call_count, 2)
            quality.assert_not_called()

    def test_created_deployment_is_production_and_isolated_from_dev(self):
        with patch.object(d, "snapshot", return_value=IMAGES), patch.object(
            d, "latest_record", return_value=(None, None)
        ), patch.object(d, "gh", return_value={"id": 42}) as gh:
            d.prepare()
            creation = gh.call_args_list[0].args[1]
            self.assertTrue(creation["production_environment"])
            self.assertEqual(creation["environment"], "production")
            self.assertEqual(creation["task"], "pokerogue-production-auto-deploy")
            self.assertEqual(d.SERVICE, "ezt5flr9fyanof3dho8zclu9")

    def test_develop_image_ref_cannot_be_restarted_as_production(self):
        data = {"applications": [
            {"name": "frontend", "image": "ghcr.io/garrison-code/pokerogue:develop", "status": "running:healthy"},
            {"name": "backend", "image": IMAGES[1]["image"], "status": "running:unknown"}],
            "databases": [{"name": "database", "image": "mariadb:11.8.9", "status": "running:healthy"}]}
        with patch.object(p, "http", return_value=({}, data)):
            with self.assertRaises(d.Failure):
                d.coolify_status()

if __name__ == "__main__":
    unittest.main()
