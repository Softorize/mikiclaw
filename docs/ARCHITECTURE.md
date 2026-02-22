# 🧱 Architecture Guide

This document describes the runtime architecture of `mikiclaw`, how requests move through the system, and where to extend it safely.

## High-Level Components

- `src/commands/start.ts`
  - Bootstraps Telegram bot, health server, webhook server, heartbeat engine.
- `src/bot/handlers.ts`
  - Channel-facing handlers for text and voice.
- `src/channels/telegram_adapter.ts`
  - Converts Telegram update context into normalized channel context.
- `src/agent/runner.ts`
  - Core orchestration loop: prompt build, model call, tool rounds, safety checks, memory updates.
- `src/ai/client.ts`
  - Multi-provider AI client with routing and failover.
- `src/agent/tools.ts`
  - Tool schema exposed to models.
- `src/security/access_control.ts`
  - AppleScript grants and risky-tool approval workflow.
- `src/session/manager.ts`
  - Session state, context windows, rolling summary.
- `src/personality/memory.ts`
  - Long-term memory, extraction, connected context retrieval.
- `src/webhooks/server.ts`
  - Signed inbound webhook receiver and outbound event sender.
- `src/automation/workflows.ts`
  - Trigger -> condition -> action automation engine.
- `src/bot/health.ts`
  - Health and metrics HTTP endpoints.
- `src/observability/metrics.ts`
  - Runtime metrics aggregation for requests, providers, tools, channels.

## Request Lifecycle

## 1) Inbound message

1. Telegram update arrives.
2. `telegramAdapter` builds `ChannelMessageContext` (`channel`, `chatId`, `userId`, `username`).
3. `messageHandler` or `voiceHandler` normalizes content and calls `runAgent`.

## 2) Agent orchestration (`runAgent`)

1. Rate limiting and loop detection checks run first.
2. Session context is loaded (`sessionManager.getOrCreateSession`).
3. Dynamic system prompt is built from:
   - `SOUL.md`
   - user memory/profile
   - emotional state
   - pattern insights
4. `aiClient.createCompletion(...)` executes with routing + failover.
5. If model emits tool calls, a bounded tool loop runs (max rounds).
6. Risky actions are intercepted and require approval before execution.
7. Final response is cleaned and persisted.
8. Memory, emotional state, profile learning, and observability stats are updated.

## 3) Tool execution loop

For each tool call:

1. Policy check (`isToolAllowed`)
2. Risk check (`requiresToolApproval`)
3. Execute tool (`executeTool`)
4. Capture result for follow-up model call
5. Record loop-protection + observability metrics

If no approval is available for a risky tool, execution pauses and a request ID is returned to the user.

## AI Routing + Failover

Routing is configured in `config.ai.routing`:

- `strategy`: `quality-first | speed-first | cost-first | balanced`
- `fallbackProviders`: ordered fallback candidates
- task-aware planning from message intent (`coding`, `summarization`, `tool-heavy`, `analysis`, `general`)

Provider attempts are tried in plan order until one succeeds.

## Safety Model

Safety is layered:

1. Tool policy engine (`allowlist-only` recommended).
2. Command and path validation.
3. Explicit grant for AppleScript machine control (`/grant_access`).
4. Explicit in-chat approval for risky actions (`/approvals`, `/approve`, `/deny`).
5. Webhook signature verification + timestamp checks + rate limiting.

## Session and Memory

- Sessions store short-term context and rolling summaries.
- Memory stores long-term facts/preferences/goals/events with importance.
- Retrieval is hybrid:
  - keyword search
  - entity search
  - semantic search
  - weighted ranking (importance + recency + signal boosts)
- Per-user caps prevent unbounded growth.

## Channel Abstraction

Current implementation ships Telegram adapter (`src/channels/telegram_adapter.ts`).

To add a new channel:

1. Implement `ChannelAdapter<TInput>` from `src/channels/types.ts`.
2. Produce `ChannelMessageContext` with normalized IDs.
3. Reuse `runAgent` unchanged.

## Observability Surfaces

- In-chat: `/metrics`
- HTTP: `GET /health`, `GET /metrics` on health server
- Logs: structured JSON in `~/.mikiclaw/logs/`

Metrics include:

- request totals/failures
- estimated token and cost counters
- provider latency/error rates
- tool call latency/error rates
- channel traffic counts

## Extension Points

- Add providers: register in `src/agent/runner.ts` and implement `AIProvider`.
- Add tools: schema in `src/agent/tools.ts`, implementation in `executeTool`.
- Add workflows: configure `automation.workflows` in `config.json`.
- Add channels: implement adapter and handlers.

## Dependency Flow (Simplified)

```text
Telegram/Webhooks/Heartbeat
        |
        v
  runAgent / workflowEngine
        |
        +--> aiClient (routing/failover)
        +--> tool loop (policy + approvals + execution)
        +--> session + memory + personality
        +--> observability + logs
```
