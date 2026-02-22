# 📈 Operations and Observability

This guide covers production operation basics: health checks, runtime metrics, approvals, and log workflows.

## Runtime Surfaces

- Bot command: `/health`
- Bot command: `/metrics`
- Bot command: `/approvals`, `/approve [id]`, `/deny [id]`
- HTTP endpoint: `GET /health`
- HTTP endpoint: `GET /metrics`
- HTTP endpoint: `GET /token` (localhost-only, returns auth token)

Health server implementation: `src/bot/health.ts`.

## Health Endpoint Auth

`/health` and `/metrics` require one of:

- localhost source address, or
- `X-Auth-Token` header from `/token`

Example:

```bash
# Local only
curl http://127.0.0.1:19090/token

# With returned token
curl -H "X-Auth-Token: <token>" http://127.0.0.1:19090/health
curl -H "X-Auth-Token: <token>" http://127.0.0.1:19090/metrics
```

## What `/metrics` Includes

- Process/system metrics:
  - uptime, memory, CPU, pid, platform, node version
- Session metrics:
  - active session count
  - top active sessions (id/channel/message count)
- Observability store snapshot:
  - request totals + failures
  - estimated input/output tokens
  - estimated token cost (USD)
  - provider latency/error rates
  - tool latency/error rates
  - channel traffic counts

Implementation: `src/observability/metrics.ts`.

## Log Format

Logs are JSON lines written by `src/utils/logger.ts` to:

- `~/.mikiclaw/logs/mikiclaw-YYYY-MM-DD.log`

Each entry includes:

- `timestamp`
- `level` (`debug|info|warn|error`)
- `message`
- `context`

Example filter commands:

```bash
# All errors
rg '"level":"error"' ~/.mikiclaw/logs/mikiclaw-$(date +%F).log

# Approval-related events
rg 'approval|Tool execution paused pending approval' ~/.mikiclaw/logs/mikiclaw-$(date +%F).log

# Provider failover events
rg 'AI provider failed|AI provider attempt' ~/.mikiclaw/logs/mikiclaw-$(date +%F).log
```

## Risky Action Approval Flow

Risky actions are blocked until explicitly approved.

Current risky set includes:

- `bash`
- `write_file`
- `applescript`
- `browser_fill`
- `browser_click` when selector looks submit/destructive

Flow:

1. Agent requests risky tool action.
2. System creates pending approval ID (`apr_*`).
3. User runs `/approve <id>` or `/deny <id>`.
4. Approved action is consumed once.

State implementation: `src/security/access_control.ts`.

## Key SLO Signals to Watch

- Provider error rate > 5% over sustained interval
- Tool error rate spikes (especially `bash`, `browser_*`)
- Increased request failures or loop-stop warnings
- High memory or CPU growth trend

## Basic Incident Playbook

1. Check `/health` and `/metrics`.
2. Inspect latest errors in logs.
3. Confirm provider keys and network connectivity.
4. Confirm webhook signatures/secrets if automations fail.
5. Temporarily switch routing strategy if provider instability persists:
   - `ai.routing.strategy = "balanced"` or `"speed-first"`.
6. Restart process after config changes.

## Recommended Production Defaults

- `security.toolPolicy = "allowlist-only"`
- `security.encryptCredentials = true`
- `ai.routing.enabled = true`
- `automation.enabled = true` only for needed workflows
- `webhooks.rateLimitPerMinute` set conservatively
- periodic log review and retention policy
