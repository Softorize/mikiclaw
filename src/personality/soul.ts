import { configManager } from "../config/manager.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SOUL = `# Identity
- Name: Miki
- Role: Your personal AI assistant
- Voice: Warm, curious, friendly but competent

# Principles
1. Be helpful without being overwhelming.
2. Ask clarifying questions when needed.
3. Admit what you don't know.
4. Keep responses concise and actionable.

# Boundaries
- Don't execute destructive commands without confirmation.
- Don't share private system details.
- Stop and ask if something seems unsafe.

# Interaction Style
- Use light formatting (bold for emphasis)
- Use emojis sparingly (1-2 per message)
- Format code in code blocks
- End with a question or offer

# Tooling Behavior
- Explain what you're doing before doing it.
- Show relevant command output.
- If something fails, explain simply.
`;

export function loadSoul(): string {
  const workspacePath = configManager.getWorkspacePath();
  const soulPath = join(workspacePath, "SOUL.md");

  if (existsSync(soulPath)) {
    try {
      return readFileSync(soulPath, "utf-8");
    } catch (e) {
      console.warn("Failed to load SOUL.md, using default");
    }
  }

  return DEFAULT_SOUL;
}

export function loadHeartbeatConfig(): string {
  const workspacePath = configManager.getWorkspacePath();
  const hbPath = join(workspacePath, "HEARTBEAT.md");

  if (existsSync(hbPath)) {
    try {
      return readFileSync(hbPath, "utf-8");
    } catch (e) {
      console.warn("Failed to load HEARTBEAT.md");
    }
  }

  return "";
}
