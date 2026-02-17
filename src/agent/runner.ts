import Anthropic from "@anthropic-ai/sdk";
import { configManager } from "../config/manager.js";
import { loadSoul } from "../personality/soul.js";
import { memorySystem } from "../personality/memory.js";
import { getTools } from "./tools.js";
import { rateLimiter } from "../utils/rate_limiter.js";
import { logger } from "../utils/logger.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execa } from "execa";

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
}

export async function runAgent(ctx: MessageContext): Promise<string> {
  if (!rateLimiter.isAllowed(ctx.userId)) {
    logger.warn("Rate limit exceeded", { userId: ctx.userId });
    return "⏳ Too many requests. Please wait a moment before trying again.";
  }

  const apiKey = configManager.getAnthropicKey();
  if (!apiKey) {
    logger.warn("No Anthropic API key configured");
    return "⚠️ Anthropic API key not configured. Run `mikiclaw setup`.";
  }

  const anthropic = new Anthropic({ apiKey });
  
  const soul = loadSoul();
  const tools = getTools();
  const conversationHistory = loadConversation(ctx.chatId);
  const memoryContext = memorySystem.getRelevantContext(ctx.message);

  const systemPrompt = `You are an AI assistant with a distinct personality. Follow the SOUL.md below:

${soul}

${memoryContext ? `\n# Relevant Memory\n${memoryContext}\n` : ""}

# Important Rules
- You have access to tools. Use them when needed to help the user.
- Always explain what you're doing before executing a tool.
- If a tool fails, explain the error simply and suggest alternatives.
- Keep responses friendly but concise.
- Use Markdown formatting appropriately.
- For dangerous operations (file deletion, system changes), always ask for confirmation first.
`;

  const messages: any[] = [
    ...conversationHistory,
    { role: "user", content: ctx.message }
  ];

  let response;
  try {
    logger.info("Calling Anthropic API", { userId: ctx.userId, messageLength: ctx.message.length });
    
    response = await anthropic.messages.create({
      model: configManager.load().anthropic?.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as any,
      tools: tools as any
    });

    logger.info("Received response from Anthropic", { userId: ctx.userId, contentBlocks: response.content.length });
  } catch (error) {
    logger.error("Anthropic API error", { error: String(error), userId: ctx.userId });
    throw new Error(`API Error: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  let finalText = "";

  for (const content of response.content) {
    if (content.type === "text") {
      finalText += content.text;
    } else if (content.type === "tool_use") {
      const toolName = content.name;
      const toolInput = content.input as Record<string, unknown>;

      logger.info("Executing tool", { tool: toolName, userId: ctx.userId });
      finalText += `\n\n🔧 *Executing: ${toolName}*`;

      const result = await executeTool(toolName, toolInput);
      finalText += `\n\n${result}`;

      memorySystem.recordToolUsage(toolName, JSON.stringify(toolInput));

      const toolResultMessage = {
        role: "tool" as const,
        content: result,
        tool_use_id: content.id
      };

      messages.push({ role: "assistant", content: JSON.stringify(response.content) });
      messages.push({ role: "user", content: result });

      try {
        const followUp = await anthropic.messages.create({
          model: configManager.load().anthropic?.model || "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages as any
        });

        for (const fc of followUp.content) {
          if (fc.type === "text") {
            finalText += "\n\n" + fc.text;
          }
        }
      } catch (e) {
        logger.error("Follow-up API call failed", { error: String(e) });
        finalText += "\n\n⚠️ Could not get follow-up response.";
      }
    }
  }

  saveConversation(ctx.chatId, ctx.message, finalText);

  return finalText;
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
  switch (toolName) {
    case "bash": {
      const command = input.command as string;
      if (!command) return "Error: No command provided";

      if (!configManager.isCommandAllowed(command)) {
        logger.warn("Blocked command", { command });
        return "⛔ This command has been blocked for safety. Please try a different approach.";
      }

      const timeout = (input.timeout as number) || 30;

      try {
        const { stdout, stderr } = await execa("bash", ["-c", command], {
          timeout: timeout * 1000,
          stdio: "pipe"
        });
        memorySystem.recordToolUsage("bash", command);
        return stdout || stderr || "(no output)";
      } catch (error) {
        logger.error("Bash command failed", { command, error: String(error) });
        return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }

    case "git": {
      const command = "git " + (input.command as string);
      const repoPath = input.repoPath as string || ".";

      if (!configManager.isCommandAllowed(command)) {
        return "⛔ This command has been blocked for safety.";
      }

      try {
        const { stdout, stderr } = await execa("git", (input.command as string).split(" "), {
          cwd: repoPath,
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
        const limit = (input.limit as number) || 100;
        const offset = (input.offset as number) || 1;
        
        let content = readFileSync(path, "utf-8");
        const lines = content.split("\n");
        
        if (offset > 1) {
          content = lines.slice(offset - 1, offset - 1 + limit).join("\n");
        } else {
          content = lines.slice(0, limit).join("\n");
        }
        
        return content + `\n\n--- (showing ${Math.min(limit, lines.length)} lines) ---`;
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "write_file": {
      const path = input.path as string;
      const content = input.content as string;
      
      if (!path || content === undefined) return "Error: Missing path or content";
      
      try {
        const dir = dirname(path);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(path, content);
        return `✅ File written: ${path}`;
      } catch (error) {
        return `Error writing file: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "list_directory": {
      const path = (input.path as string) || ".";
      
      try {
        const { execa } = await import("execa");
        const { stdout } = await execa("ls", ["-la", "--time-style=long-iso", path]);
        return stdout || "(empty directory)";
      } catch (error) {
        return `Error listing directory: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "glob": {
      const pattern = input.pattern as string;
      const basePath = input.path as string || ".";
      
      if (!pattern) return "Error: No pattern provided";
      
      try {
        const { execa } = await import("execa");
        const { stdout } = await execa("find", [basePath, "-type", "f", "-name", pattern.replace(/\*/g, "*")]);
        const files = stdout.split("\n").filter(Boolean).slice(0, 50);
        return files.length > 0 ? files.join("\n") : "No files found";
      } catch {
        return "Error running glob";
      }
    }

    case "grep": {
      const pattern = input.pattern as string;
      const path = input.path as string || ".";
      const caseSensitive = input.caseSensitive !== false;
      
      if (!pattern) return "Error: No pattern provided";
      
      try {
        const { execa } = await import("execa");
        const args = caseSensitive ? ["-r", pattern, path] : ["-ri", pattern, path];
        const { stdout, stderr } = await execa("grep", args);
        const lines = (stdout || stderr).split("\n").slice(0, 50);
        return lines.length > 0 ? lines.join("\n") : "No matches found";
      } catch {
        return "No matches found or error running grep";
      }
    }

    case "search": {
      const query = input.query as string;
      if (!query) return "Error: No query provided";
      
      const { webSearch } = await import("./web_search.js");
      return await webSearch(query);
    }

    case "get_system_info": {
      const os = await import("os");
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      return `
*System Information*
- OS: ${os.platform()} ${os.release()}
- CPU: ${cpus[0]?.model || "Unknown"} (${cpus.length} cores)
- Memory: ${Math.round((totalMem - freeMem) / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB
- Home: ${os.homedir()}
- Hostname: ${os.hostname()}
- Uptime: ${Math.floor(os.uptime() / 3600)} hours
`.trim();
    }

    case "nodejs": {
      const code = input.code as string;
      if (!code) return "Error: No code provided";
      
      try {
        const result = await eval(`(async () => { ${code} })()`);
        return `Result: ${JSON.stringify(result, null, 2)}`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
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

  writeFileSync(convPath, JSON.stringify(history, null, 2));
}
