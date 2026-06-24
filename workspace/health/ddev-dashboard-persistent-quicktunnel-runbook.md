# ddev Storyboard dashboard persistent quicktunnel runbook

This runbook protects the worker dashboard quicktunnel used by the Health Dashboard and Storyboard plugin dev surface.

Current accepted public URL:

https://ecommerce-followed-sandwich-heroes.trycloudflare.com/health?profileId=work_at_dashboard_app_live_dev_surface

## Contract

- Do not restart or churn `cloudflared` for ordinary code updates.
- Keep the quicktunnel bound to the stable worker-local gateway port, currently `3300`.
- Restart/update only processes behind the tunnel:
  - dashboard Bun gateway on `3300`
  - dashboard app Vite/HMR on `5173`
- `/home/ec2-user/state/dashboard/runtime-state.json` must point only at a live public hostname.
- If runtime state points at a dead hostname, treat that as a blocking health failure. Do not write a replacement hostname until a live `cloudflared` process and public route are proven.

## Guarded helper

Use the repo helper from the ddev Storyboard worker checkout:

```bash
cd /home/ec2-user/workspace/projects/ricklove-agent-infrastructure
bash scripts/ddev-dashboard-dev-surface.sh status
```

For code updates, use:

```bash
bash scripts/ddev-dashboard-dev-surface.sh restart-app
```

`restart-app` restarts Vite and the Bun gateway only. It does not stop/start `cloudflared`.

Use this only when the tunnel is missing or dead:

```bash
bash scripts/ddev-dashboard-dev-surface.sh ensure-tunnel
```

`ensure-tunnel` first reuses the live `runtime-state.json` public URL and cloudflared PID. It starts a new quicktunnel only when no live process plus public route exists.

## Health check coverage

`workspace/health/profiles/work-at-dashboard-app-live-dev-surface.health-profile.json` contains the blocking check `persistent_quicktunnel_contract`, backed by the built-in `dashboard_persistent_quicktunnel_contract` runner.

That check verifies:

- runtime-state file exists and is valid JSON
- `publicUrl` is a trycloudflare hostname
- `publicUrl` matches the accepted current hostname
- recorded `cloudflaredPid`/`tunnelPid` is alive and targets `127.0.0.1:3300`
- local gateway route is healthy
- public `/health?profileId=work_at_dashboard_app_live_dev_surface` route is healthy and serves the Vite dev marker

## Prior hostname churn note

Earlier quicktunnel churn made the original hostname unrecoverable because Cloudflare quicktunnel hostnames are ephemeral and cannot be reclaimed after the process is gone. The current replacement hostname above is therefore the accepted stable worker URL. The guardrails in this runbook and health profile are intended to prevent recurrence by requiring process/route proof before runtime-state updates and by separating app restarts from tunnel lifecycle.
