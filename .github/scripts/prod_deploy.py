#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
"""Single-repository coordinator for the existing production Compose stack."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import publish_production as publish
from production_network import use_private_ingress

SERVICE = "ezt5flr9fyanof3dho8zclu9"
COOLIFY = "https://coolify.garrix.cloud"
SITE = "https://pokerogue.garrix.cloud"
TASK = "pokerogue-production-auto-deploy"
ENVIRONMENT = "production"
Failure = publish.Failure

def temporary(name):
    root = os.environ.get("RUNNER_TEMP")
    if not root:
        raise Failure("RUNNER_TEMP is required")
    return Path(root) / name

def save_state(state):
    temporary("production-deploy-state.json").write_text(json.dumps(state), encoding="utf-8")

def load_state():
    path = temporary("production-deploy-state.json")
    return json.loads(path.read_text()) if path.exists() else None

def report(**values):
    path = temporary("production-deploy-report.json")
    data = json.loads(path.read_text()) if path.exists() else {}
    data.update(values)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")

def gh(path, data=None, method=None):
    return publish.github(path, publish.require("GH_TOKEN"), data, method)

def latest_record():
    query = urllib.parse.urlencode({"environment": ENVIRONMENT, "task": TASK, "per_page": 1})
    records = gh(f"/repos/{publish.REPOSITORIES[0]}/deployments?{query}")
    if not records:
        return None, None
    record = records[0]
    statuses = gh(f"/repos/{publish.REPOSITORIES[0]}/deployments/{record['id']}/statuses?per_page=1")
    return record, statuses[0]["state"] if statuses else "in_progress"

def snapshot():
    token = publish.require("PROD_DEPLOY_GH_TOKEN")
    images = [publish.registry(repository) for repository in publish.REPOSITORIES]
    for image in images:
        publish.publication(image, token)
    return images

def pair_key(images):
    return hashlib.sha256(json.dumps(
        [(item["repository"], item["digest"]) for item in images],
        sort_keys=True,
    ).encode()).hexdigest()

def summary(text):
    print(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as out:
            out.write(text + "\n\n")

def prepare():
    if (os.environ.get("GITHUB_REPOSITORY") != publish.REPOSITORIES[0]
            or os.environ.get("GITHUB_REF") != "refs/heads/beta"):
        raise Failure("Coordinator can run only in the frontend repository's beta branch")
    mode = os.environ.get("DEPLOY_MODE", "")
    if mode not in ("check", "deploy"):
        raise Failure("Invalid coordinator mode")
    source = os.environ.get("SOURCE_REPOSITORY", "")
    resume = os.environ.get("RESUME", "false") == "true"
    if source and os.environ.get("PROD_AUTO_DEPLOY_ENABLED") != "true":
        publish.output("run", "false")
        summary("Automatic deployment is disabled; no Coolify operation was requested.")
        return
    if source and resume:
        raise Failure("Automated requests cannot force a manual deployment retry")
    if source and source not in publish.REPOSITORIES:
        raise Failure("Unapproved source repository")
    images = snapshot()
    if source:
        sha, run_id = os.environ.get("SOURCE_SHA", ""), os.environ.get("SOURCE_RUN_ID", "")
        if not publish.SHA.fullmatch(sha) or not run_id.isdigit():
            raise Failure("Invalid source commit or publisher run")
        image = next(item for item in images if item["repository"] == source)
        if image["revision"] != sha or image["build_id"].split("-")[0] != run_id:
            publish.output("run", "false")
            summary("Notification superseded by a newer registry publication; no restart requested.")
            return
    for name in ("COOLIFY_READ_TOKEN", "COOLIFY_DEPLOY_TOKEN",
                 "PROD_SMOKE_USERNAME", "PROD_SMOKE_PASSWORD", "PROD_SMOKE_CLIENT_ID"):
        publish.require(name)
    state = {"mode": mode, "images": images, "pair_key": pair_key(images),
             "source_repository": source, "source_sha": os.environ.get("SOURCE_SHA", ""),
             "verified": False, "restart_attempted": False, "resume": resume}
    if mode == "deploy":
        previous, status = latest_record()
        # An earlier verification failure must not block a subsequent version.
        # Unfinished deployments can still be applying a non-idempotent restart.
        if status in ("in_progress", "pending", "queued") and not resume:
            raise Failure(
                f"Previous deployment {previous['id']} is unfinished ({status}); "
                "inspect it and use a manual resume if recovery is needed"
            )
        if (previous and status == "success"
                and previous.get("payload", {}).get("pair_key") == state["pair_key"] and not resume):
            publish.output("run", "false")
            summary("This frontend/backend image pair is already deployed; duplicate notification skipped.")
            return
        created = gh(f"/repos/{publish.REPOSITORIES[0]}/deployments", {
            "ref": publish.require("GITHUB_SHA"), "task": TASK,
            "environment": ENVIRONMENT, "production_environment": True,
            "auto_merge": False, "required_contexts": [],
            "description": "Coolify production Compose deployment",
            "payload": {"pair_key": state["pair_key"], "images": images},
        }, "POST")
        state["deployment_id"] = created["id"]
        save_state(state)
        gh(f"/repos/{publish.REPOSITORIES[0]}/deployments/{created['id']}/statuses",
           {"state": "in_progress", "environment": ENVIRONMENT,
            "log_url": f"https://github.com/{publish.REPOSITORIES[0]}/actions/runs/{os.environ['GITHUB_RUN_ID']}"},
           "POST")
    save_state(state)
    report(mode=mode, images=images, phase="prepared", source_repository=source)
    publish.output("run", "true")

def public_get(path):
    return publish.http(SITE + path)[1]

def coolify_status():
    data = publish.http(f"{COOLIFY}/api/v1/services/{SERVICE}",
                        publish.require("COOLIFY_READ_TOKEN"))[1]
    applications = {item["name"]: item for item in data.get("applications", [])}
    databases = {item["name"]: item for item in data.get("databases", [])}
    if set(applications) != {"frontend", "backend"} or set(databases) != {"database"}:
        raise Failure("Unexpected Compose components; inspect the Coolify configuration")
    for name, repository in (("frontend", publish.REPOSITORIES[0]), ("backend", publish.REPOSITORIES[1])):
        if applications[name]["image"] != f"ghcr.io/{repository.lower()}:latest":
            raise Failure(f"Unexpected {name} image reference")
    if databases["database"]["image"] != "mariadb:11.8.9":
        raise Failure("MariaDB must be set to the approved mariadb:11.8.9 tag before automation")
    front_ok = applications["frontend"]["status"] == "running:healthy"
    back_ok = applications["backend"]["status"].startswith("running")
    db_ok = databases["database"]["status"] == "running:healthy"
    return front_ok and back_ok and db_ok

def build_matches(images):
    for image, path in zip(images, ("/build-info.json", "/api/game/build-info")):
        value = public_get(path)
        if any(value.get(key) != image[key] for key in ("revision", "build_id")):
            return False
    return True

def api(path, token=None, form=None, payload=None):
    # The account is dedicated to deployment tests. Never print bodies or auth.
    route = path.split("?")[0]
    report(api_check=route)
    time.sleep(0.25)
    headers = {"Origin": SITE, "User-Agent": "PokeRogue-production-smoke/1.0"}
    if token:
        headers["Authorization"] = token
    body = None
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(SITE + "/api" + path, headers=headers, data=body)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        error.close()
        raise Failure(f"Deployment account/save API check failed: {route} (HTTP {error.code})") from None
    except OSError as error:
        raise Failure(
            f"Deployment account/save API check failed: {route} (transport {type(error).__name__})"
        ) from None
    except ValueError:
        raise Failure(f"Deployment account/save API check failed: {route} (invalid JSON response)") from None

def smoke():
    username = publish.require("PROD_SMOKE_USERNAME")
    client = publish.require("PROD_SMOKE_CLIENT_ID")
    if not re.fullmatch(r"[a-f0-9]{32}", client):
        raise Failure("Deployment fixture client ID must be 32 lowercase hexadecimal characters")
    _, login = api("/account/login", form={
        "username": username, "password": publish.require("PROD_SMOKE_PASSWORD"),
    })
    token = login["token"]
    try:
        if api("/account/info", token)[1]["username"] != username:
            raise Failure("Deployment test account identity mismatch")
        query = "?clientSessionId=" + client
        system_path = "/savedata/system/get" + query
        session_path = "/savedata/session/get" + query + "&slot=0"
        system = api(system_path, token)[1]
        session = api(session_path, token)[1]
        # Check preexisting fixtures first; never recreate missing data and mask loss.
        if (system.get("trainerId") != 12345 or system.get("secretId") != 54321
                or session.get("seed") != "coolify-production-smoke"
                or session.get("money") != 3456 or session.get("waveIndex") != 2):
            raise Failure("Preexisting dedicated save fixtures are missing or changed; no saves overwritten")
        stamp = int(time.time() * 1000)
        system["timestamp"] = session["timestamp"] = stamp
        if api("/savedata/system/update" + query, token, payload=system)[0] != 204:
            raise Failure("System save update rejected")
        session_update_query = urllib.parse.urlencode({
            "clientSessionId": client, "slot": 0,
            "trainerId": system["trainerId"], "secretId": system["secretId"],
        })
        if api("/savedata/session/update?" + session_update_query, token, payload=session)[0] != 200:
            raise Failure("Session save update rejected")
        if (api(system_path, token)[1].get("timestamp") != stamp
                or api(session_path, token)[1].get("timestamp") != stamp):
            raise Failure("Save writes did not round-trip")
    finally:
        primary_failure = sys.exc_info()[0] is not None
        try:
            if api("/account/logout", token)[0] != 200:
                raise Failure("Deployment account logout failed")
        except Failure as error:
            if not primary_failure:
                raise
            # Cleanup must not replace the account/save error that triggered it.
            report(cleanup_error=str(error))
            print(f"::warning::{error}", file=sys.stderr)

def execute():
    state = load_state()
    if not state:
        raise Failure("Prepared deployment state is missing")
    # Validate the saved configuration, without requesting sensitive Compose fields.
    healthy = coolify_status()
    if state["mode"] == "check" and not healthy:
        raise Failure("Existing stack is not healthy; preflight check failed")
    # A new deployment may repair an unhealthy application. coolify_status()
    # still rejects an unexpected stack or image/database configuration.
    if state["mode"] == "check":
        public_get("/api/game/titlestats")
        report(phase="check-complete", result="success",
               note="No restart, login, save write or token-permission mutation was performed")
        summary("Preflight passed. Deploy token presence is checked; its deploy permission is confirmed only by a real deployment.")
        return
    # A moving tag must not silently change the selected versions between prepare and POST.
    if pair_key([publish.registry(repo) for repo in publish.REPOSITORIES]) != state["pair_key"]:
        raise Failure("Registry tags changed before restart; inspect and retry manually")
    state["restart_attempted"] = True
    save_state(state)
    report(phase="restart-requested")
    # This non-idempotent request is deliberately sent once, even on transport timeout.
    publish.http(f"{COOLIFY}/api/v1/services/{SERVICE}/restart?latest=true",
                 publish.require("COOLIFY_DEPLOY_TOKEN"), data={}, method="POST")
    deadline = time.monotonic() + 600
    consecutive = 0
    while time.monotonic() < deadline:
        try:
            ready = coolify_status() and build_matches(state["images"])
        except Failure:
            ready = False
        consecutive = consecutive + 1 if ready else 0
        if consecutive >= 3:
            break
        time.sleep(5)
    else:
        raise Failure("New versions did not become healthy within 10 minutes; queued is not deployment success")
    if pair_key([publish.registry(repo) for repo in publish.REPOSITORIES]) != state["pair_key"]:
        raise Failure("Registry tags moved during deployment; version outcome needs manual review")
    environment = dict(os.environ)
    environment.update(EXPECTED_REVISION=state["images"][0]["revision"],
                       EXPECTED_BUILD_ID=state["images"][0]["build_id"])
    subprocess.run([sys.executable, ".github/scripts/prod_check_static.py", SITE, "PokéRogue (Garrix)"],
                   check=True, env=environment)
    smoke()
    state["verified"] = True
    save_state(state)
    report(phase="verified", result="success", api_smoke="passed", static_http="passed")
    summary("Production deployment verified: build identities, container health, caching, login, existing saves, save writes and logout passed.")

def finalize():
    state = load_state()
    if not state or state.get("mode") != "deploy" or not state.get("deployment_id"):
        return
    success = state.get("verified") and os.environ.get("JOB_STATUS") == "success"
    status = "success" if success else "failure"
    gh(f"/repos/{publish.REPOSITORIES[0]}/deployments/{state['deployment_id']}/statuses",
       {"state": status, "environment": ENVIRONMENT, "environment_url": SITE,
        "log_url": f"https://github.com/{publish.REPOSITORIES[0]}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        "description": "Verified" if success else "Failed; see run diagnostics. Later versions remain eligible"},
       "POST")
    report(deployment_status=status)
    if not success:
        summary("Deployment failed. No automatic rollback/restart retry. Later versions remain eligible for deployment.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "execute", "finalize"))
    args = parser.parse_args()
    if args.command == "execute":
        use_private_ingress()
    try:
        {"prepare": prepare, "execute": execute, "finalize": finalize}[args.command]()
    except (Failure, subprocess.CalledProcessError, KeyError, TypeError) as error:
        # Key errors/type errors expose only a class name, never provider/body data.
        message = str(error) if isinstance(error, Failure) else type(error).__name__
        report(result="failure", error=message)
        print(f"::error::{message}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
