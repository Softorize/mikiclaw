import { describe, expect, it } from "vitest";
import { buildProviderPlan, detectTaskKind, type AIMessage } from "../src/ai/client.js";
import { accessControl } from "../src/security/access_control.js";

describe("Golden Conversations", () => {
  it("routes coding tasks to high-quality providers", () => {
    const messages: AIMessage[] = [
      { role: "user", content: "Help me debug this TypeScript build error and refactor the function." }
    ];

    const taskKind = detectTaskKind(messages, []);
    const plan = buildProviderPlan({
      primary: "anthropic",
      strategy: "quality-first",
      fallbackProviders: ["openai", "kimi", "minimax", "local"],
      availableProviders: ["anthropic", "openai", "kimi", "minimax", "local"],
      taskKind
    });

    expect(taskKind).toBe("coding");
    expect(plan[0]).toBe("anthropic");
    expect(plan).toContain("openai");
  });

  it("prefers fast providers for summarization on speed-first strategy", () => {
    const messages: AIMessage[] = [
      { role: "user", content: "Summarize this thread into 5 bullets quickly." }
    ];

    const taskKind = detectTaskKind(messages, []);
    const plan = buildProviderPlan({
      primary: "anthropic",
      strategy: "speed-first",
      fallbackProviders: ["openai", "minimax", "kimi"],
      availableProviders: ["anthropic", "openai", "minimax", "kimi"],
      taskKind
    });

    expect(taskKind).toBe("summarization");
    expect(plan[0]).toBe("openai");
    expect(plan).toContain("anthropic");
  });

  it("requires explicit approval before executing a risky action", () => {
    const userId = "golden-user";
    const chatId = 1001;
    const toolName = "bash";
    const toolInput = { command: "rm -rf ./tmp" };

    const requested = accessControl.requestToolApproval(
      userId,
      chatId,
      toolName,
      toolInput,
      "shell command: rm -rf ./tmp"
    );

    expect(requested.status).toBe("pending");
    expect(accessControl.consumeApprovedToolAction(userId, chatId, toolName, toolInput)).toBeNull();

    const approved = accessControl.approveToolApproval(userId, chatId, requested.id);
    expect(approved?.status).toBe("approved");

    const consumed = accessControl.consumeApprovedToolAction(userId, chatId, toolName, toolInput);
    expect(consumed?.id).toBe(requested.id);
  });
});
