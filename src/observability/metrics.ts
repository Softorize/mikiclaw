interface RequestSpan {
  id: string;
  userId: string;
  chatId: number;
  channel: string;
  startedAt: number;
}

interface ProviderStat {
  requests: number;
  failures: number;
  totalLatencyMs: number;
}

interface ToolStat {
  calls: number;
  failures: number;
  totalLatencyMs: number;
}

class ObservabilityStore {
  private startedAt = Date.now();
  private activeRequests = new Map<string, RequestSpan>();
  private totals = {
    requests: 0,
    failures: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCostUsd: 0,
  };
  private providerStats = new Map<string, ProviderStat>();
  private toolStats = new Map<string, ToolStat>();
  private channelStats = new Map<string, number>();

  startRequest(userId: string, chatId: number, channel: string): string {
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeRequests.set(id, {
      id,
      userId,
      chatId,
      channel,
      startedAt: Date.now(),
    });

    this.totals.requests += 1;
    this.channelStats.set(channel, (this.channelStats.get(channel) || 0) + 1);
    return id;
  }

  finishRequest(
    requestId: string,
    details: {
      provider?: string;
      success: boolean;
      estimatedInputTokens?: number;
      estimatedOutputTokens?: number;
      estimatedCostUsd?: number;
    }
  ): void {
    const span = this.activeRequests.get(requestId);
    if (!span) {
      return;
    }

    const latency = Date.now() - span.startedAt;
    this.activeRequests.delete(requestId);

    if (!details.success) {
      this.totals.failures += 1;
    }

    if (details.provider) {
      const current = this.providerStats.get(details.provider) || {
        requests: 0,
        failures: 0,
        totalLatencyMs: 0,
      };
      current.requests += 1;
      current.totalLatencyMs += latency;
      if (!details.success) {
        current.failures += 1;
      }
      this.providerStats.set(details.provider, current);
    }

    this.totals.estimatedInputTokens += Math.max(0, Math.floor(details.estimatedInputTokens || 0));
    this.totals.estimatedOutputTokens += Math.max(
      0,
      Math.floor(details.estimatedOutputTokens || 0)
    );
    this.totals.estimatedCostUsd += Math.max(0, details.estimatedCostUsd || 0);
  }

  recordToolCall(toolName: string, success: boolean, latencyMs: number): void {
    const current = this.toolStats.get(toolName) || {
      calls: 0,
      failures: 0,
      totalLatencyMs: 0,
    };

    current.calls += 1;
    if (!success) {
      current.failures += 1;
    }
    current.totalLatencyMs += Math.max(0, latencyMs);
    this.toolStats.set(toolName, current);
  }

  getSnapshot() {
    const providerStats: Record<string, unknown> = {};
    for (const [provider, stat] of this.providerStats.entries()) {
      providerStats[provider] = {
        requests: stat.requests,
        failures: stat.failures,
        avgLatencyMs: stat.requests > 0 ? Math.round(stat.totalLatencyMs / stat.requests) : 0,
        errorRate: stat.requests > 0 ? Number((stat.failures / stat.requests).toFixed(4)) : 0,
      };
    }

    const toolStats: Record<string, unknown> = {};
    for (const [toolName, stat] of this.toolStats.entries()) {
      toolStats[toolName] = {
        calls: stat.calls,
        failures: stat.failures,
        avgLatencyMs: stat.calls > 0 ? Math.round(stat.totalLatencyMs / stat.calls) : 0,
        errorRate: stat.calls > 0 ? Number((stat.failures / stat.calls).toFixed(4)) : 0,
      };
    }

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      activeRequests: this.activeRequests.size,
      totals: {
        ...this.totals,
        estimatedCostUsd: Number(this.totals.estimatedCostUsd.toFixed(6)),
      },
      channels: Object.fromEntries(this.channelStats.entries()),
      providers: providerStats,
      tools: toolStats,
    };
  }
}

export const observabilityStore = new ObservabilityStore();
