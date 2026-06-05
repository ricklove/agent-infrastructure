# Storyboard access-server run system

Implementation-ready MVP spec for adding run/state support to the external Storyboard access server. This is documentation only; it does not implement runtime code.

## Purpose

Add a safe, manifest-driven run system so storyboard frames can be used as repeatable waypoints: run an app/browser/device to a frame state, optionally capture assets, report freshness, expose logs, and persist provenance beside the storyboard.

## Non-goals and MVP cutline

- No real BaseConnect device runner in this docs milestone.
- No distributed runners, worker federation, or cross-machine queue protocol.
- No auto-commit of generated screenshots or storyboard edits.
- No canonical asset overwrite in MVP; captures remain transient unless a later explicit promote API is implemented.
- No arbitrary browser, shell, device, or provider command execution.
- No transient run state in `storyboard.json`.

## Boundary

- The dashboard Storyboard plugin renders UI inside the dashboard shell and consumes a `storyboardUrl`.
- The external storyboard access server runs where the storyboard files and assets live.
- All run APIs use the existing namespace: `/api/storyboard-access/...`.
- Run APIs are disabled unless the access-server capabilities and a validated manifest explicitly enable them.

## Security model

- The dashboard never executes code and is not trusted for command selection.
- The server loads and validates `storyboard.run.json` from the storyboard root before exposing run capability.
- Browser requests send only storyboard/frame identifiers, run mode, manifest entry ids, capture set ids, and typed approved params.
- All mutating run APIs (`POST /runs`, cancel, attach/control, capture, cleanup, and any future promote API) require authenticated authorized access; browser-triggered mutations require session-bound CSRF protection.
- Public preview or tunnel exposure must not make run, capture, attach/control, cancel, cleanup, or promote APIs public.
- The server rejects unknown manifest entries, unknown params, wrong param types, path traversal, symlink traversal, absolute paths outside allowed roots, arbitrary shell strings, and output paths outside the storyboard asset/run roots.
- Manifest commands are allowlisted by runner implementation, not copied from browser input.
- Capabilities default to disabled. A server with no run capability returns state only and the dashboard must render Run controls disabled.
- Logs, provenance, job snapshots, diagnostics, and audit records redact tokens, cookies, environment variables, credentials, and internal-sensitive values before returning data to public UI surfaces.

## Canonical data model and glossary

### `Run`

A persisted job accepted by the access server.

Required fields:

- `jobId`: opaque, random, non-guessable server-generated id.
- `scope`: `frame`, `story`, or `storyboard`.
- `mode`: `run-to-state`, `capture`, or `run-and-capture`.
- `status`: one lifecycle state from `queued`, `pending`, `running`, `capturing`, `succeeded`, `failed`, `skipped`, `cancelled`, `expired`, or `recovered`.
- `target`: storyboard id plus optional story id and frame key. Frame scope requires `storyboardId`, `storyId`, and `frameKey`; story scope requires `storyboardId` and `storyId`; storyboard scope requires `storyboardId`. A server may use an explicit current storyboard context instead of `storyboardId` only when the request URL/session unambiguously binds one storyboard.
- `manifestEntryId`: selected manifest entry id; required for accepted run requests.
- `captureSetId`: selected capture set id; required when `mode` includes capture.
- `createdAt`, `updatedAt`, `startedAt`, `completedAt` timestamps where known.
- `params`: validated typed params after defaults are applied.
- `provenanceWrites`: relative provenance paths written by successful capture steps.
- `liveSessionHandle`: optional `LiveSessionHandle` returned by run-to-state capable runners.
- `error`: optional structured error object.

### `FrameRunStatus` / `Freshness`

Frame-level runnability/freshness derived from manifest and provenance, separate from job lifecycle.

Allowed values:

- `not-runnable`: no enabled manifest entry/capability is available for the frame.
- `unchanged`: latest successful provenance still matches all current freshness inputs.
- `stale`: provenance is missing or at least one freshness input changed.

### `Runner`

Server-side implementation that executes one allowlisted manifest entry. MVP runner types:

- `dry-run`: deterministic fake execution for UI fixtures and API tests.
- future real runners: browser, device, app, or project-specific runners owned by later tasks.

### `ManifestEntry`

Validated entry in `storyboard.run.json` declaring what can run.

Required MVP fields:

- `id`, `label`, `scope`, `runnerId`, `modes`.
- `targets`: allowed storyboard/story/frame selectors or patterns.
- `paramsSchema`: typed allowlist for browser-supplied params.
- `captureSets`: allowed capture set ids, if capture is supported.
- `enabled`: explicit boolean; absent means disabled.

### `CaptureSet`

Named capture configuration: viewport/device/profile, output asset path template, image format, comparison policy, and any runner-owned capture options. All output paths are stored relative to the storyboard root or asset root.

### `Provenance`

Immutable-ish record for the latest successful frame/capture set output. It is used to derive `unchanged` or `stale`, not to track active jobs.

### `LiveSessionHandle`

Descriptor returned by `run-to-state` or `run-and-capture` when a runner can leave an attachable session open.

Required fields:

- `type`: `browser`, `device`, `simulator`, `app`, or `custom`.
- `id`: opaque server/runner id.
- `url`: optional attach URL.
- `ttlSeconds`: expiry from issuance.
- `owner`: current owner, e.g. `runner`, `agent`, or `user`.
- `capabilities`: allowed operations such as `attach`, `observe`, `interact`, `capture`, `revoke`.
- `cleanup`: `auto-expire`, `revoke-required`, or `runner-managed`.

Cleanup/revoke semantics must be explicit in job state and logs. Handles are issued with per-run grants/capabilities, owner/lease state, idle timeout, and revoke controls. Attach/control requests are scoped to the granted capabilities; agents may use waypoint handles only within those capabilities. Expired or revoked handles are not reused.

## State model

Freshness/runnability and lifecycle are separate.

Freshness/runnability:

- `not-runnable`
- `unchanged`
- `stale`

Lifecycle:

- `queued`: frame/job was explicitly accepted into the server FIFO and is waiting behind other work.
- `pending`: a parent story/storyboard run is active, but this frame has not been reached yet.
- `running`: runner is moving the app/browser/device to the target state.
- `capturing`: runner is recording output assets/provenance.
- `succeeded`: terminal success.
- `failed`: terminal error.
- `skipped`: terminal non-error skip due to parent policy/dependency.
- `cancelled`: terminal cancellation.
- `expired`: terminal restart/TTL policy outcome for a job that cannot be recovered.
- `recovered`: terminal restart policy outcome when a non-terminal job is safely reconciled without rerunning.

Terminal lifecycle states are `succeeded`, `failed`, `skipped`, `cancelled`, `expired`, and `recovered`.

Valid lifecycle transitions:

- Frame run: `queued -> running -> succeeded|failed|cancelled`.
- Frame capture: `queued -> capturing -> succeeded|failed|cancelled`.
- Frame run and capture: `queued -> running -> capturing -> succeeded|failed|cancelled`.
- Story/storyboard scope creates a parent `Run` with child frame states; the parent aggregates child progress and terminal result. Single-frame scope targets one frame only.
- Parent story/storyboard run children: `pending -> queued -> running|capturing -> succeeded|failed|skipped|cancelled`.
- Parent cancellation may move not-yet-reached children from `pending` to `cancelled` or `skipped` according to manifest policy.
- A terminal job never returns to a non-terminal state; retries create a new `Run`.

## Run modes

- `run-to-state`: drive to the requested frame waypoint. May return a `LiveSessionHandle`; does not write screenshots unless the runner needs internal artifacts.
- `capture`: capture the requested frame from an existing/runner-created state. Writes assets and provenance.
- `run-and-capture`: drive to state, capture, then optionally leave or revoke a live handle according to manifest policy.

## MVP API contract

All endpoints are relative to the storyboard access-server origin and use JSON unless noted.

### Error shape

```json
{
  "error": {
    "code": "manifest_entry_not_found",
    "message": "Manifest entry is not enabled for this frame.",
    "details": {
      "manifestEntryId": "login-happy-path"
    }
  }
}
```

Use stable `code` strings for UI handling. Security rejections must not echo unsafe paths or shell fragments.

### `GET /api/storyboard-access/capabilities`

Response:

```json
{
  "runApi": true,
  "manifestLoaded": true,
  "queue": { "type": "fifo", "maxActive": 1, "cancel": true },
  "modes": ["run-to-state", "capture", "run-and-capture"],
  "lifecycleStates": ["queued", "pending", "running", "capturing", "succeeded", "failed", "skipped", "cancelled", "expired", "recovered"],
  "freshnessStates": ["not-runnable", "unchanged", "stale"],
  "manifestEntries": [
    {
      "id": "login-happy-path",
      "label": "Login happy path",
      "scope": "frame",
      "modes": ["run-to-state", "run-and-capture"],
      "captureSets": ["desktop"]
    }
  ]
}
```

If disabled:

```json
{ "runApi": false, "manifestLoaded": false, "manifestEntries": [] }
```

### `GET /api/storyboard-access/state`

By default returns aggregate state for the current storyboard URL/context. Servers exposing more than one storyboard may also support `GET /api/storyboard-access/storyboards/:id/state`; both forms must filter to exactly one storyboard context.

```json
{
  "storyboardId": "default-storyboard",
  "generatedAt": "2026-06-05T21:00:00.000Z",
  "runApi": true,
  "queue": { "maxActive": 1, "active": 1, "queued": 2 },
  "frames": [
    {
      "storyId": "login",
      "storyboardId": "default-storyboard",
      "frameKey": "login.success",
      "freshness": "stale",
      "runnable": true,
      "disabledReason": null,
      "manifestEntryIds": ["login-happy-path"],
      "currentJob": { "jobId": "job_01jzdef", "status": "capturing", "queuePosition": 0 },
      "latestJob": { "jobId": "job_01jzabc", "status": "succeeded", "completedAt": "2026-06-05T21:00:10.000Z" },
      "provenance": {
        "key": "default-storyboard/login.success/desktop/login-happy-path/dry-run",
        "path": ".storyboard-runs/provenance/default-storyboard/login.success/desktop/login-happy-path/dry-run.json",
        "captureSetId": "desktop",
        "manifestEntryId": "login-happy-path",
        "outputAsset": "assets/login-success.png",
        "summary": "app build changed"
      }
    }
  ]
}
```

For each frame, state includes freshness, lifecycle (`currentJob` and `latestJob`), provenance summary, queue position, and either `runnable: true` or a stable `disabledReason` code.

### `POST /api/storyboard-access/runs`

Request fields are deterministic: `scope`, `mode`, `target` (`storyboardId` or explicit current storyboard context; `storyId`/`frameKey` when required by scope), `manifestEntryId`, `captureSetId` when capture is requested, and validated `params`.

```json
{
  "scope": "frame",
  "mode": "run-and-capture",
  "target": { "storyboardId": "default-storyboard", "storyId": "login", "frameKey": "login.success" },
  "manifestEntryId": "login-happy-path",
  "captureSetId": "desktop",
  "params": { "seedUser": "demo" }
}
```

Story/storyboard scope creates a parent run with child frame states; single-frame scope targets only the requested frame.

Response `202 Accepted`:

```json
{
  "jobId": "job_01jzabc",
  "status": "queued",
  "queuePosition": 2,
  "links": {
    "job": "/api/storyboard-access/runs/job_01jzabc",
    "logs": "/api/storyboard-access/runs/job_01jzabc/logs",
    "cancel": "/api/storyboard-access/runs/job_01jzabc/cancel"
  }
}
```

### `GET /api/storyboard-access/runs/:jobId`

Response:

```json
{
  "jobId": "job_01jzabc",
  "scope": "frame",
  "mode": "run-and-capture",
  "status": "capturing",
  "target": { "storyboardId": "default-storyboard", "storyId": "login", "frameKey": "login.success" },
  "manifestEntryId": "login-happy-path",
  "captureSetId": "desktop",
  "createdAt": "2026-06-05T21:00:00.000Z",
  "startedAt": "2026-06-05T21:00:03.000Z",
  "updatedAt": "2026-06-05T21:00:08.000Z",
  "progress": { "currentFrameKey": "login.success", "completedFrames": 0, "totalFrames": 1 },
  "liveSessionHandle": {
    "type": "browser",
    "id": "session_123",
    "url": "http://127.0.0.1:9222/devtools/page/abc",
    "ttlSeconds": 600,
    "owner": "runner",
    "capabilities": ["attach", "observe", "capture", "revoke"],
    "cleanup": "auto-expire"
  }
}
```

### `GET /api/storyboard-access/runs/:jobId/logs`

MVP supports polling. Servers may return either plain text:

```text
2026-06-05T21:00:03.000Z queued
2026-06-05T21:00:04.000Z running login.success
```

or JSONL:

```jsonl
{"ts":"2026-06-05T21:00:03.000Z","level":"info","event":"queued"}
{"ts":"2026-06-05T21:00:04.000Z","level":"info","event":"running","frameKey":"login.success"}
```

SSE is a later enhancement, not required for MVP.

### `POST /api/storyboard-access/runs/:jobId/cancel`

Cancel is supported in MVP because `cancelled` is a lifecycle state. Request body may be empty or include a typed reason.

Response:

```json
{
  "jobId": "job_01jzabc",
  "status": "cancelled",
  "cancelledAt": "2026-06-05T21:01:00.000Z"
}
```

If a runner cannot interrupt the current step, it should mark the job cancellation-requested in logs and transition to `cancelled` at the next safe point. Terminal jobs return a conflict error.

## Storage layout and schemas

All paths are relative to the storyboard root. Writes use temp-file-plus-rename atomic writes. Runtime state lives under `.storyboard-runs/`; `storyboard.json` remains canonical storyboard content only. Reject symlink traversal, serve only safe relative artifacts, never serve secrets or dotfiles, and apply retention/TTL cleanup for jobs, logs, transient artifacts, and stale handles.

```text
.storyboard-runs/
  jobs/<job-id>.json
  logs/<job-id>.jsonl
  provenance/<storyboard-id>/<frame-key>/<capture-set-id>/<manifest-entry-id>/<runner-id>.json
  transient/<job-id>/...
```

`jobs/<job-id>.json` stores the `Run` object, including current lifecycle status, timestamps, validated params, links to log/provenance files, optional live handle, and structured error. It is overwritten atomically on every lifecycle update. On server restart, non-terminal jobs must become a terminal `failed`, `expired`, or policy-defined `recovered` state; they must not silently remain `running`.

`logs/<job-id>.jsonl` stores append-only, redacted log records with `ts`, `level`, `event`, and optional structured context. Plain `.log` is acceptable only for simple polling UIs; JSONL is preferred. Public UI logs may be summarized/redacted more aggressively than private diagnostics.

Provenance keys must distinguish storyboard, frame, capture set, manifest entry, and runner. The deterministic key is the sanitized tuple `<storyboard-id>/<frame-key>/<capture-set-id>/<manifest-entry-id>/<runner-id>`; alternatively an indexed history may store all attempts with an explicit latest-success selector. Include enough fields to derive freshness:

```json
{
  "storyboardId": "default-storyboard",
  "frameKey": "login.success",
  "manifestHash": "sha256:...",
  "manifestEntryId": "login-happy-path",
  "runnerId": "dry-run",
  "runnerHash": "sha256:...",
  "appBuildId": "git:abc123",
  "captureSetId": "desktop",
  "storyboardSpecHash": "sha256:...",
  "frameSpecHash": "sha256:...",
  "outputAsset": "assets/login-success.png",
  "outputAssetHash": "sha256:...",
  "completedAt": "2026-06-05T21:00:10.000Z"
}
```

## Provenance and staleness derivation

A frame/capture set is `unchanged` iff the latest successful provenance matches all current inputs:

- manifest hash;
- manifest entry id;
- runner id and runner/script hash;
- app SHA or build id;
- capture set id and capture set hash;
- output asset path and current output asset hash;
- storyboard spec hash;
- frame spec hash.

It is `stale` when provenance is missing, the output asset is missing, or any input differs. It is `not-runnable` when no enabled capability/manifest entry applies, regardless of previous provenance.

## Runner isolation and fast health

All runners execute with an isolated cwd/run dir, sanitized environment allowlist, timeout, cancellation cleanup, process/log/artifact size caps, and MVP `maxActive=1`. Before expensive capture/device/browser work, a runner should expose a fast health gate; real runners may require it. The health result must fail quickly with cwd, command id, elapsed ms, exit code, and blocker classification for missing credentials/devices/manifests versus agent-owned setup errors.

## Dry-run runner MVP

The `dry-run` runner must be deterministic and must not execute browser/device/app commands. It should:

- accept only manifest-approved frame/story/storyboard targets and params;
- use deterministic delays and deterministic success/failure/skipped results from manifest fixtures;
- exercise FIFO queueing, parent `pending`, lifecycle transitions, cancellation, logs, and provenance writes;
- write transient fake output asset hashes or fixture asset references sufficient for dashboard state fixtures;
- make every freshness/lifecycle state renderable through API-driven UI fixtures.

## Capture promotion

Captures write transient artifacts under `.storyboard-runs/transient/<job-id>/` first. Promotion to canonical storyboard assets, if added after MVP, must be explicit, authenticated/authorized, hash-recorded, reversible, audited, and never implicit during capture. MVP omits promote, so canonical asset overwrite is not in scope.

## Dashboard MVP behavior

- Disable Run controls when `runApi` is false, manifest is missing, or a frame has `not-runnable` freshness.
- Show status badges for `not-runnable`, `unchanged`, `stale`, `queued`, `pending`, `running`, `capturing`, `succeeded`, `failed`, `skipped`, and `cancelled`.
- Provide a queue/log drawer for selected frame/job with polling logs.
- Show a provenance summary explaining why a frame is `unchanged` or `stale`.
- Use API-driven fixtures for every freshness and lifecycle state.
- Keep the dashboard a client of the access-server contract; it must not infer shell commands or mutate runtime storage directly.

## Implementation acceptance and test matrix

- Schema validation/security tests for `storyboard.run.json`, params, allowed ids, relative paths, invalid manifest entries, arbitrary command rejection, path traversal, symlink traversal, and unsafe path/shell rejection.
- Auth tests proving unauthorized POST is rejected, CSRF/session mismatch is rejected, and public tunnel access cannot mutate run/capture/attach/control/cancel/cleanup/promote APIs.
- State derivation tests for `not-runnable`, `unchanged`, and `stale` with changed manifest, runner, app build, capture set, output hash, storyboard spec, and frame spec; no-run-config returns `runApi: false`.
- API contract tests for capabilities, state, create run, get run, logs, cancel, fast health, and error shape; agents can resume from API state alone.
- Dry-run integration tests proving FIFO queueing, `pending` child frames, lifecycle transitions, cancellation, logs, provenance writes, and cancel/cleanup behavior.
- Storage round-trip tests for jobs, logs, provenance, atomic lifecycle writes, restart recovery of non-terminal jobs, TTL cleanup, redacted logs/provenance, safe artifact serving, and no transient state in `storyboard.json`.
- Audit tests covering run, attach/control, capture, cancel, cleanup, and future promote actions.
- Dashboard fixture rendering tests for disabled Run, all badges, queue/log drawer, provenance summary, and each API-driven fixture state.

## Ownership

- `ddev-storyboard`: docs, dashboard UI behavior, API contract, fixtures, and access-server contract shape.
- `bc-storyboard`: BaseConnect storyboard manifests and scripts in later work.
- `bc-android` or `bc-frontend`: runner mechanics only when device/app/frontend details are required.
- `default` manager: orchestration only.
