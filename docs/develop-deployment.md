<!-- SPDX-FileCopyrightText: 2026 Garrison-code -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Develop deployment: setup, verification and recovery

The frontend repository coordinates both develop images into the existing
Coolify Service pokerogue-develop (UUID vykerfdamghng26r1qptcy5g).
No production/latest deployment, public ingress, SSH runner or local clone is
required. Review and merge both repositories' PRs before enabling automation.

## Behavior

Both publishers wait for the same commit's required CI, publish, then verify
the develop tag's digest/revision/build ID in anonymous GHCR metadata.
Frontend requirements are Linting, Tests and Deployment checks. Backend Build
must contain a successful Linux develop tests and build job, not just skipped
upstream jobs.

The registered ghcr.yml workflow accepts publish (default), check and deploy.
Deployment/check modes run only at ref develop and do not publish images.
Using the existing registered workflow avoids changing default branch beta
just to register another dispatch workflow.

Frontend and backend notify the frontend workflow only after registry
confirmation and only when DEV_AUTO_DEPLOY_ENABLED is true. The frontend uses
its GITHUB_TOKEN; the backend uses DEV_DEPLOY_GH_TOKEN. The coordinator validates
publisher identity and CI for both images. One repository-wide concurrency
group serializes deployment/check runs without cancelling a running deployment.
Publish runs use a separate cancellable group. GitHub may replace older pending
requests with a newer one; not every intermediate commit must be deployed.

Coolify receives one POST to:
    https://coolify.garrix.cloud/api/v1/services/vykerfdamghng26r1qptcy5g/restart?latest=true

A queued reply is not success. The coordinator waits up to ten minutes for
healthy components and the expected build identities. Compose is recreated;
MariaDB may restart, retaining the existing named volume. CI never edits Compose.
The database image must already be set to mariadb:11.8.9, the version verified
running during setup. Preserve its exact current volume.

The application references remain :develop, not digests. Digests are recorded
for diagnosis and deduplication only. A tag moving before/during deployment
fails verification and requires manual review instead of reporting false success.
Rebuilding the same commit is distinguished by build_id, not just revision.

## 1. Tailscale network rule and identity

In the existing tailnet policy, define:
    "tagOwners": {"tag:ci-pokerogue-dev": ["autogroup:admin"]}

Add this grant without replacing unrelated policy:
    {"src": ["tag:ci-pokerogue-dev"], "dst": ["100.64.67.54"], "ip": ["tcp:443"]}

Add policy tests for source tag:ci-pokerogue-dev:
- Accept 100.64.67.54:443.
- Deny 100.64.67.54:22, :8000 and :3306.
- Audit broad existing rules (especially source "*"). Tailscale allow rules
  are additive; merely adding the narrow grant does not override broader ones.
  Preserve existing administrator and other application access.

Create a Trust credential of type OpenID Connect:
- Issuer: https://token.actions.githubusercontent.com
- Subject: repo:Garrison-code/pokerogue:environment:develop
- Custom claim repository_id: 1431927336
- Custom claim workflow_ref:
  Garrison-code/pokerogue/.github/workflows/ghcr.yml@refs/heads/develop
- Scope: Auth Keys, Write; allowed tag: tag:ci-pokerogue-dev.
- Copy the generated Client ID and Audience. Neither is a secret; no OAuth
  client secret or reusable Tailscale auth key is needed.

Use the generated audience, not a guessed URL. The official action is pinned
to the reviewed v4 commit, joins as an ephemeral node and cleans up afterward.
Tailnet Lock was verified disabled; enabling it changes this authentication
assumption and must be reviewed before the next deployment.

## 2. GitHub environment, tokens and variables

Create GitHub environment develop in Garrison-code/pokerogue. Allow the
develop branch and configure no required reviewer, as this is automatic dev
deployment. GitHub environment name and Tailscale subject must match exactly.

Create a dedicated fine-grained GitHub PAT, expiring in 90 days:
- Resource owner: Garrison-code.
- Selected repositories: pokerogue and rogueserver only.
- Repository permission Actions: Read and Write; no Contents write.
- This permits cross-repository dispatch and the coordinator's verification
  of both repositories' Actions runs. Rotate before expiry.
- Store it as DEV_DEPLOY_GH_TOKEN in the frontend develop environment and
  as the same named repository secret in rogueserver.

In Coolify, switch to the team owning PokeRogue and create two separate tokens,
each with 90-day expiration:
- pokerogue-dev-ci-deploy: deploy only.
- pokerogue-dev-ci-read: read only.
Store these as COOLIFY_DEPLOY_TOKEN and COOLIFY_READ_TOKEN in the frontend
develop GitHub environment. Do not copy the agent's existing broad token.
Coolify tokens are team-scoped, not restricted to a single Service; the
workflow fixes the one permitted target UUID and receives no write/root scope.

Frontend develop environment variables:
| Name | Value |
| --- | --- |
| TS_CLIENT_ID | Generated Tailscale OIDC Client ID |
| TS_AUDIENCE | Generated Tailscale OIDC Audience |
| DEV_SMOKE_CLIENT_ID | Existing dedicated smoke fixture client ID (32 lowercase hex characters) |

Frontend develop environment secrets:
| Name | Purpose |
| --- | --- |
| DEV_DEPLOY_GH_TOKEN | Read Actions metadata in both repositories |
| COOLIFY_READ_TOKEN | Read component status/configuration identifiers |
| COOLIFY_DEPLOY_TOKEN | Request the fixed Service restart |
| DEV_SMOKE_USERNAME | Dedicated test account username |
| DEV_SMOKE_PASSWORD | Dedicated test account password |

Repository variables in BOTH repositories:
    DEV_AUTO_DEPLOY_ENABLED=false

Do not set the automatic switch only in the GitHub environment: publisher
notification jobs read the repository variable. Do not configure a conflicting
same-named environment variable.

Reuse the previously dedicated smoke account and fixtures. Its protected
operator-side file is /home/gary/coolify-setup/pokerogue-develop/.smoke-state.json:
username -> DEV_SMOKE_USERNAME, password -> DEV_SMOKE_PASSWORD,
client -> DEV_SMOKE_CLIENT_ID. Have the operator enter these through GitHub's
Secrets/Variables UI without printing them in chat, PRs, logs or source.
No player account is used. If fixtures are missing, restore/seed deliberately
with the existing operator smoke tool before enabling deployment; CI must not
silently recreate missing saves.

## 3. First rollout

1. Merge both reviewed PRs while BOTH automatic switches remain false.
2. Wait for successful develop publication in both repositories. Both images
   need the new identity metadata; an older image is intentionally rejected.
3. Confirm Coolify's database reference is mariadb:11.8.9, healthcheck uses
   wget /healthz, and all original resource limits/routes/volumes remain.
4. In frontend Actions > Publish container image > Run workflow:
   select branch develop, mode check, leave source fields empty, resume false.
   This checks publication/CI, credentials being configured, private network,
   Coolify read access and current service configuration. It does not restart,
   log in, write saves or prove deploy-token permissions.
5. Run the same workflow at develop with mode deploy. Source fields stay
   empty. It pulls the published tags and verifies the real deployment.
6. Verify the successful report, then set DEV_AUTO_DEPLOY_ENABLED=true in
   both repositories. Test one frontend and one backend publication, then
   two near-simultaneous publications and duplicate notification handling.

Changing a repository variable does not replay an already skipped notify job.
Use the manual deploy mode once for existing published images.

## 4. Verification and failure recovery

Public metadata interfaces (both Cache-Control: no-store):
- Frontend /build-info.json
- Backend /api/game/build-info

Both return only revision (commit SHA) and build_id (run ID-attempt). Docker
labels carry the same build ID and the normal OCI revision/source metadata.

After readiness, HTTP checks verify static shell/resources, runtime API/login/
dev title, no-store manifests and immutable versioned assets. The dedicated
account then logs in, reads preexisting system/session fixtures, updates
timestamps and reads them back, and logs out. Calls are sequential and paced.
Save contents, passwords and session tokens never enter the report.

GitHub Deployments uses task pokerogue-auto-deploy and environment develop,
separate from GitHub's automatic environment job records. Safe image metadata
and source IDs are stored in the deployment payload; a JSON report is retained
as an Actions artifact for 30 days.

If deployment, identity, API verification or final status recording fails:
- Do not automatically rollback or retry the non-idempotent Coolify POST.
- Later automatic requests see the failed/unfinished deployment and stop.
- Inspect the Actions report and Coolify dashboard. Data/schema compatibility
  is an operator decision before any image rollback.
- Once corrected, manually run mode deploy at develop with source fields
  empty and resume=true. This also permits deliberate reapplication of an
  already deployed image pair.
- A cancelled runner may leave an in-progress record. Treat it as requiring
  the same manual inspection/resume, never as successful.
- To pause new automatic deployment, set BOTH repository switches false.
  An already running deployment is not cancelled by changing this variable.

Checks/tests include missing/failed/skipped CI, registry visibility/digest,
stale requests, repeated notifications, unsafe source refs, failure latch,
manual recovery, check-mode non-mutation, one-shot restart, queued-not-success,
moving tags, metadata/cache handling and missing persisted fixtures.
