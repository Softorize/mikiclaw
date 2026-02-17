import inquirer from "inquirer";
import ora from "ora";
import { configManager } from "../config/manager.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function setupWizard() {
  console.log("\n🦞 Welcome to mikiclaw Setup!\n");
  console.log("I'll help you configure your AI assistant.\n");

  const config = configManager.load();

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "telegramToken",
      message: "Telegram Bot Token (from @BotFather):",
      default: config.telegram?.botToken || "",
      validate: (input: string) => {
        if (!input) return "Token is required";
        if (!input.match(/^\d+:[A-Za-z0-9_-]+$/)) {
          return "Invalid token format. Should be like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz";
        }
        return true;
      }
    },
    {
      type: "password",
      name: "anthropicKey",
      message: "Anthropic API Key (from console.anthropic.com):",
      default: config.anthropic?.apiKey || "",
      validate: (input: string) => {
        if (!input) return "API key is required";
        if (!input.startsWith("sk-ant-")) {
          return "Invalid API key format. Should start with: sk-ant-";
        }
        return true;
      }
    },
    {
      type: "list",
      name: "personality",
      message: "Choose a personality for your assistant:",
      choices: [
        { name: "🤖 Miki (default) - Friendly and helpful", value: "miki" },
        { name: "🧑‍💼 Professional - Concise and business-focused", value: "professional" },
        { name: "🎓 Mentor - Educational and patient", value: "mentor" },
        { name: "⚡ Power User - Technical and efficient", value: "poweruser" }
      ],
      default: "miki"
    },
    {
      type: "confirm",
      name: "heartbeat",
      message: "Enable heartbeat (periodic check-ins)?",
      default: true
    },
    {
      type: "list",
      name: "toolPolicy",
      message: "Tool execution policy:",
      choices: [
        { name: "Block destructive commands (recommended)", value: "block-destructive" },
        { name: "Allow all commands (not recommended)", value: "allow-all" },
        { name: "Allowlist only - specify allowed commands", value: "allowlist-only" }
      ],
      default: "block-destructive"
    },
    {
      type: "confirm",
      name: "encryptCredentials",
      message: "Encrypt stored credentials (recommended)?",
      default: true
    },
    {
      type: "confirm",
      name: "rateLimit",
      message: "Enable rate limiting (20 requests/minute)?",
      default: true
    }
  ]);

  const spinner = ora("Validating credentials...").start();

  const tokenValid = answers.telegramToken.match(/^\d+:[A-Za-z0-9_-]+$/);
  const keyValid = answers.anthropicKey.startsWith("sk-ant-");

  if (!tokenValid || !keyValid) {
    spinner.fail("Invalid credentials");
    return;
  }

  spinner.succeed("Credentials validated!");
  
  spinner.start("Saving configuration...");
  configManager.save({
    telegram: {
      botToken: answers.telegramToken,
      allowedUsers: []
    },
    anthropic: {
      apiKey: answers.anthropicKey,
      model: "claude-sonnet-4-20250514"
    },
    heartbeat: {
      enabled: answers.heartbeat,
      intervalMinutes: 30
    },
    skills: {
      autoUpdate: true
    },
    workspace: {
      path: configManager.getWorkspacePath()
    },
    security: {
      encryptCredentials: answers.encryptCredentials,
      toolPolicy: answers.toolPolicy,
      allowedCommands: answers.toolPolicy === "allowlist-only" ? ["git", "ls", "cat", "echo", "node", "npm"] : undefined,
      blockedCommands: ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd", "> /dev/sda"]
    },
    rateLimit: {
      enabled: answers.rateLimit,
      maxRequestsPerMinute: 20
    }
  });
  spinner.succeed("Configuration saved!");

  spinner.start("Creating workspace...");
  const workspacePath = configManager.getWorkspacePath();
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  writeFileSync(join(workspacePath, "SOUL.md"), getSoulForPersonality(answers.personality));
  writeFileSync(join(workspacePath, "HEARTBEAT.md"), getHeartbeatTemplate());
  
  if (!existsSync(join(workspacePath, "MEMORY.md"))) {
    writeFileSync(join(workspacePath, "MEMORY.md"), getMemoryTemplate());
  }
  spinner.succeed("Workspace created!");

  console.log("\n✅ Setup complete!");
  console.log("\nNext steps:");
  console.log("  1. Run 'npm start' to start your bot");
  console.log("  2. Message your Telegram bot to get started");
  console.log("\n📝 Available commands in bot:");
  console.log("  /start - Start the bot");
  console.log("  /help - Show help");
  console.log("  /status - Check system status");
  console.log("  /skills - List skills\n");
}

function getSoulForPersonality(type: string): string {
  const souls: Record<string, string> = {
    miki: `# Identity
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
`,
    professional: `# Identity
- Name: Miki Pro
- Role: Professional AI assistant
- Voice: Direct, concise, business-focused

# Principles
1. Get to the point.
2. Provide actionable recommendations.
3. Maintain professionalism at all times.

# Boundaries
- No personal opinions.
- Stay on topic.

# Interaction Style
- Short paragraphs
- Bullet points for lists
- Minimal emojis
`,
    mentor: `# Identity
- Name: Miki Mentor
- Role: Educational AI assistant  
- Voice: Patient, encouraging, educational

# Principles
1. Explain your reasoning.
2. Break complex topics into steps.
3. Encourage learning over answers.

# Boundaries
- Don't give direct answers to homework questions.

# Interaction Style
- Step-by-step explanations
- Ask guiding questions
- Use examples
`,
    poweruser: `# Identity
- Name: Miki
- Role: Power user assistant
- Voice: Technical, efficient, minimal

# Principles
1. Efficiency over politeness.
2. Skip unnecessary context.
3. Show, don't tell.

# Interaction Style
- Command-focused output
- Code blocks for everything
- No emojis
`
  };
  return souls[type] || souls.miki;
}

function getHeartbeatTemplate(): string {
  return `# Heartbeat Configuration

# Heartbeat Schedule
- interval: 30m (minimum)

# Tasks
## daily_summary
- schedule: "0 9 * * *"
- action: summarize_conversations
- description: Send a daily summary of conversations

## skill_suggestions
- schedule: "0 10 * * 1"
- action: suggest_skills
- description: Suggest relevant skills based on usage

## status_report  
- schedule: "0 8 * * *"
- action: send_status
- description: Send daily system status
`;
}

function getMemoryTemplate(): string {
  return `# Memory

Long-term memory for the agent.
Entries are automatically added based on conversations and tool usage.

## How it works
- Facts about you are stored here
- Your preferences are remembered
- Important context is preserved across sessions

## To add memories
The agent will automatically learn from your interactions.
`;
}
