# ⚙️ Automation Workflows

`mikiclaw` supports declarative automation with this execution model:

- Trigger (`webhook` or `heartbeat`)
- Optional condition (`field` + `equals` or `contains`)
- Action (`emit_webhook_event`, `log`, or `memory`)

Implementation lives in `src/automation/workflows.ts`.

## Configuration Location

Set workflows in `~/.mikiclaw/config.json` under:

- `automation.enabled`
- `automation.workflows[]`

Also configure webhook server in:

- `webhooks.*`

## Workflow Schema

```json5
{
  "id": "string",
  "enabled": true,
  "trigger": {
    "type": "webhook", // or "heartbeat"
    "path": "/incoming/path",        // webhook trigger
    "taskName": "Daily Status Report" // heartbeat trigger
  },
  "condition": {
    "field": "data.status",
    "equals": "failed",
    "contains": "error"
  },
  "action": {
    "type": "emit_webhook_event", // or "log" or "memory"
    "eventType": "alerts.build.failed",
    "message": "Build failed for {{data.project}}",
    "importance": 8
  }
}
```

## Example: Complete Working Config

```json5
{
  "webhooks": {
    "enabled": true,
    "port": 19091,
    "secret": "replace-with-strong-secret",
    "rateLimitPerMinute": 60,
    "maxPayloadBytes": 1048576,
    "endpoints": [
      {
        "path": "/incoming/build-fail",
        "url": "https://example.com/hooks/build-fail",
        "method": "POST",
        "events": ["*"],
        "secret": "replace-with-strong-secret"
      },
      {
        "path": "/internal/outbound",
        "url": "https://example.com/hooks/alerts",
        "method": "POST",
        "events": ["alerts.build.failed"],
        "secret": "replace-with-strong-secret"
      }
    ]
  },
  "automation": {
    "enabled": true,
    "workflows": [
      {
        "id": "build-failure-alert",
        "enabled": true,
        "trigger": { "type": "webhook", "path": "/incoming/build-fail" },
        "condition": { "field": "data.status", "equals": "failed" },
        "action": {
          "type": "emit_webhook_event",
          "eventType": "alerts.build.failed",
          "message": "Build failed for {{data.project}} on {{data.branch}}"
        }
      },
      {
        "id": "daily-heartbeat-log",
        "enabled": true,
        "trigger": { "type": "heartbeat", "taskName": "Daily Status Report" },
        "action": {
          "type": "log",
          "message": "Heartbeat ran at {{timestamp}}"
        }
      }
    ]
  }
}
```

## Signed Webhook Requests

Inbound webhook requests must include:

- `X-Mikiclaw-Timestamp: <unix-seconds>`
- `X-Mikiclaw-Signature: sha256=<hmac>`

HMAC payload format:

- `<timestamp>.<raw_json_body>`

## Test Request (Node)

```js
import { createHmac } from "node:crypto";

const secret = "replace-with-strong-secret";
const body = JSON.stringify({
  status: "failed",
  project: "mikiclaw",
  branch: "main"
});

const timestamp = Math.floor(Date.now() / 1000).toString();
const payload = `${timestamp}.${body}`;
const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

await fetch("http://127.0.0.1:19091/incoming/build-fail", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-mikiclaw-timestamp": timestamp,
    "x-mikiclaw-signature": signature
  },
  body
});
```

## Trigger Sources

- `webhook`
  - executed in `src/webhooks/server.ts` after auth and endpoint delivery
- `heartbeat`
  - executed in `src/heartbeat/engine.ts` after scheduled task run

## Available Action Types

- `emit_webhook_event`
  - emits event through configured webhook endpoints (`events` match required)
- `log`
  - writes structured log entry
- `memory`
  - writes long-term memory entry (`type: event`)

## Template Variables

Action message templates support `{{path.to.value}}` placeholders:

- For webhook triggers: `{{path}}`, `{{method}}`, `{{remoteIp}}`, `{{data.*}}`
- For heartbeat triggers: `{{taskName}}`, `{{action}}`, `{{schedule}}`, `{{timestamp}}`

## Failure Behavior

- Workflow action errors are logged and do not crash the webhook/heartbeat flow.
- Endpoint failures return warnings in logs.
- Requests still require valid endpoint signature + timestamp checks.

## Debug Checklist

1. Confirm `automation.enabled = true`
2. Confirm `webhooks.enabled = true`
3. Validate signature/secret on inbound requests
4. Check endpoint path + method match
5. Check condition field path exists in payload
6. Inspect logs in `~/.mikiclaw/logs/`
