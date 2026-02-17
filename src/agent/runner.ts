import Anthropic from "@anthropic-ai/sdk";
import { configManager } from "../config/manager.js";
import { loadSoul } from "../personality/soul.js";
import { getTools } from "./tools.js";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
}

interface ToolResult {
  type: "text" | "error";
  content: string;
}

export async function runAgent(ctx: MessageContext): Promise<string> {
  const apiKey = configManager.getAnthropicKey();
  if (!apiKey) {
    return "⚠️ Anthropic API key not configured. Run `mikiclaw setup`.";
  }

  const anthropic = new Anthropic({ apiKey });
  
  const soul = loadSoul();
  const tools = getTools();
  const conversationHistory = loadConversation(ctx.chatId);

  const systemPrompt = `You are an AI assistant with a distinct personality. Follow the SOUL.md below:

${soul}

# Important Rules
- You have access to tools. Use them when needed to help the user.
- Always explain what you're doing before executing a tool.
- If a tool fails, explain the error simply and suggest alternatives.
- Keep responses friendly but concise.
- Use Markdown formatting appropriately.
`;

  const messages = [
    ...conversationHistory,
    { role: "user" as const, content: ctx.message }
  ];

  let response;
  try {
    response = await anthropic.messages.create({
      model: configManager.load().anthropic?.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools
    });
  } catch (error) {
    console.error("Anthropic API error:", error);
    throw new Error(`API Error: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  let finalText = "";

  for (const content of response.content) {
    if (content.type === "text") {
      finalText += content.text;
    } else if (content.type === "tool_use") {
      const toolName = content.name;
      const toolInput = content.input;

      finalText += `\n\n🔧 *Executing: ${toolName}*`;

      const result = await executeTool(toolName, toolInput);
      finalText += `\n\n${result}`;

      const toolResult: ToolResult = {
        type: result.startsWith("Error") ? "error" : "text",
        content: result
      };

      const toolResultMessage = {
        role: "tool" as const,
        content: toolResult.content,
        tool_use_id: content.id
      };

      messages.push({ role: "assistant" as const, content: response.content });
      messages.push(toolResultMessage);

      const followUp = await anthropic.messages.create({
        model: configManager.load().anthropic?.model || "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [...messages]
      });

      for (const fc of followUp.content) {
        if (fc.type === "text") {
          finalText += "\n\n" + fc.text;
        }
      }
    }
  }

  saveConversation(ctx.chatId, ctx.message, finalText);

  return finalText;
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
  const { execa } = await import("execa");

  switch (toolName) {
    case "bash": {
      const command = input.command as string;
      if (!command) return "Error: No command provided";

      const dangerous = ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh"];
      if (dangerous.some(d => command.includes(d))) {
        return "Error: Command blocked for safety";
      }

      try {
        const { stdout, stderr } = await execa("bash", ["-c", command], {
          timeout: 30000,
          stdio: "pipe"
        });
        return stdout || stderr || "(no output)";
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }

    case "read_file": {
      const path = input.path as string;
      if (!path) return "Error: No path provided";
      
      try {
        const content = readFileSync(path, "utf-8");
        return content.slice(0, 5000);
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "glob": {
      const pattern = input.pattern as string;
      if (!pattern) return "Error: No pattern provided";
      
      const { glob } = await import("./glob.js");
      return await glob(pattern);
    }

    case "search": {
      const query = input.query as string;
      if (!query) return "Error: No query provided";
      
      const { webSearch } = await import("./web_search.js");
      return await webSearch(query);
    }

    default:
      return `Error: Unknown tool: ${toolName}`;
  }
}

function loadConversation(chatId: number): Array<{ role: "user" | "assistant"; content: string }> {
  const workspacePath = configManager.getWorkspacePath();
  const convPath = join(workspacePath, "conversations", `${chatId}.json`);
  
  if (!existsSync(convPath)) {
    return [];
  }

  try {
    const content = readFileSync(convPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveConversation(chatId: number, userMessage: string, assistantMessage: string) {
  const workspacePath = configManager.getWorkspacePath();
  const convDir = join(workspacePath, "conversations");
  
  if (!existsSync(convDir)) {
    mkdirSync(convDir, { recursive: true });
  }

  const convPath = join(convDir, `${chatId}.json`);
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  
  if (existsSync(convPath)) {
    try {
      history = JSON.parse(readFileSync(convPath, "utf-8"));
    } catch {}
  }

  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: assistantMessage });

  if (history.length > 40) {
    history = history.slice(-40);
  }

  appendFileSync(convPath, JSON.stringify(history, null, 2));
}
