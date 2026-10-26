#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
"""Single-repository coordinator for the existing private develop Compose stack."""
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

import publish_notify as publish

SERVICE = "vykerfdamghng26r1qptcy5g"
COOLIFY = "https://coolify.garrix.cloud"
SITE = "https://pokerogue-dev.garrix.cloud"
TASK = "pokerogue-auto-deploy"
ENVIRONMENT = "develop"
Failure = publish.Failure

def temporary(name):
    root = os.environ.get("RUNNER_TEMP")
    if not root:
        raise Failure("RUNNER_TEMP is required")
    return Path(root) / name

def save_state(state):
    temporary("dev-deploy-state.json").write_text(json.dumps(state), encoding="utf-8")

def load_state():
    path = temporary("dev-deploy-state.json")
    return json.loads(path.read_text()) if path.exists() else None

def report(**values):
    path = temporary("dev-deploy-report.json")
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
    token = publish.require("DEV_DEPLOY_GH_TOKEN")
    images = [publish.registry(repository) for repository in publish.REPOSITORIES]
    for image in images:
        publish.quality(image["repository"], image["revision"], token)
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
            or os.environ.get("GITHUB_REF") != "refs/heads/develop"):
        raise Failure("Coordinator can run only in the frontend repository's develop branch")
    mode = os.environ.get("DEPLOY_MODE", "")
    if mode not in ("check", "deploy"):
        raise Failure("Invalid coordinator mode")
    source = os.environ.get("SOURCE_REPOSITORY", "")
    resume = os.environ.get("RESUME", "false") == "true"
    if source and os.environ.get("DEV_AUTO_DEPLOY_ENABLED") != "true":
        publish.output("run", "false")
        summary("Automatic deployment is disabled; no Coolify operation was requested.")
        return
    if source and resume:
        raise Failure("Automated requests cannot clear the manual failure latch")
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
                 "DEV_SMOKE_USERNAME", "DEV_SMOKE_PASSWORD", "DEV_SMOKE_CLIENT_ID"):
        publish.require(name)
    state = {"mode": mode, "images": images, "pair_key": pair_key(images),
             "source_repository": source, "source_sha": os.environ.get("SOURCE_SHA", ""),
             "verified": False, "restart_attempted": False, "resume": resume}
    if mode == "deploy":
        previous, status = latest_record()
        if status in ("error", "failure", "in_progress", "pending", "queued") and not resume:
            raise Failure("Previous deployment is failed or unfinished; inspect it and use a manual resume")
        if (previous and status == "success"
                and previous.get("payload", {}).get("pair_key") == state["pair_key"] and not resume):
            publish.output("run", "false")
            summary("This frontend/backend image pair is already deployed; duplicate notification skipped.")
            return
        created = gh(f"/repos/{publish.REPOSITORIES[0]}/deployments", {
            "ref": publish.require("GITHUB_SHA"), "task": TASK,
            "environment": ENVIRONMENT, "production_environment": False,
            "auto_merge": False, "required_contexts": [],
            "description": "Coolify develop Compose deployment",
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
        if applications[name]["image"] != f"ghcr.io/{repository.lower()}:develop":
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
    time.sleep(0.25)
    headers = {"Origin": SITE, "User-Agent": "PokeRogue-dev-smoke/1.0"}
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
    except (urllib.error.HTTPError, OSError, ValueError):
        raise Failure("Deployment account/save API check failed: " + path.split("?")[0]) from None

def smoke():
    username = publish.require("DEV_SMOKE_USERNAME")
    client = publish.require("DEV_SMOKE_CLIENT_ID")
    if not re.fullmatch(r"[a-f0-9]{32}", client):
        raise Failure("Deployment fixture client ID must be 32 lowercase hexadecimal characters")
    _, login = api("/account/login", form={
        "username": username, "password": publish.require("DEV_SMOKE_PASSWORD"),
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
                or session.get("seed") != "coolify-develop-smoke"
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
        if api("/account/logout", token)[0] != 200:
            raise Failure("Deployment account logout failed")

def execute():
    state = load_state()
    if not state:
        raise Failure("Prepared deployment state is missing")
    # Validate the saved configuration, without requesting sensitive Compose fields.
    if not coolify_status() and not (state["mode"] == "deploy" and state.get("resume")):
        raise Failure("Existing stack is not healthy; inspect it before restarting")
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
    subprocess.run([sys.executable, "container/check_static.py", SITE, "PokéRogue (Garrix-dev)"],
                   check=True, env=environment)
    smoke()
    state["verified"] = True
    save_state(state)
    report(phase="verified", result="success", api_smoke="passed", static_http="passed")
    summary("Develop deployment verified: build identities, container health, caching, login, existing saves, save writes and logout passed.")

def finalize():
    state = load_state()
    if not state or state.get("mode") != "deploy" or not state.get("deployment_id"):
        return
    success = state.get("verified") and os.environ.get("JOB_STATUS") == "success"
    status = "success" if success else "failure"
    gh(f"/repos/{publish.REPOSITORIES[0]}/deployments/{state['deployment_id']}/statuses",
       {"state": status, "environment": ENVIRONMENT, "environment_url": SITE,
        "log_url": f"https://github.com/{publish.REPOSITORIES[0]}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        "description": "Verified" if success else "Stopped; manual inspection and resume required"},
       "POST")
    report(deployment_status=status)
    if not success:
        summary("Deployment stopped. No automatic rollback/restart retry. Later automatic requests are blocked until manual resume.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "execute", "finalize"))
    args = parser.parse_args()
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
