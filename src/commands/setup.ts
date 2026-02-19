import inquirer from "inquirer";
import ora from "ora";
import { configManager } from "../config/manager.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function setupWizard() {
  console.log("\n🦞 Welcome to mikiclaw Setup!\n");
  console.log("I'll help you configure your AI assistant.\n");

  const config = configManager.load();

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Which AI provider do you want to use?",
      choices: [
        { name: "🤖 Anthropic Claude (Recommended) - claude-sonnet-4", value: "anthropic" },
        { name: "🌙 Kimi (Moonshot AI) - kimi-k2.5", value: "kimi" },
        { name: "🔷 MiniMax - M2.5", value: "minimax" },
        { name: "🟢 OpenAI GPT - gpt-4o", value: "openai" }
      ],
      default: config.ai?.provider || "anthropic"
    },
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
      type: "list",
      name: "personality",
      message: "Choose a personality for your assistant:",
      choices: [
        { name: "🤖 Miki (default) - Friendly and helpful", value: "miki" },
        { name: "😄 Enthusiastic - Energetic and super positive", value: "enthusiastic" },
        { name: "🎭 Witty - Clever with dad jokes", value: "witty" },
        { name: "🧑‍💼 Professional - Concise and business-focused", value: "professional" },
        { name: "🎓 Mentor - Educational and patient", value: "mentor" },
        { name: "⚡ Power User - Technical and efficient", value: "poweruser" },
        { name: "🎉 Party Mode - Fun and casual", value: "party" }
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
        { name: "Allowlist only (MOST SECURE) - Only pre-approved commands", value: "allowlist-only" },
        { name: "Block destructive commands (recommended)", value: "block-destructive" },
        { name: "Allow all commands (NOT recommended)", value: "allow-all" }
      ],
      default: "allowlist-only"
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

  let apiKeyAnswer: any = {};
  let modelAnswer: any = {};

  if (answers.provider === "anthropic") {
    apiKeyAnswer = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Anthropic API Key (from console.anthropic.com):",
        default: config.anthropic?.apiKey || "",
        validate: (input: string) => {
          if (!input) return "API key is required";
          if (!input.startsWith("sk-ant-")) {
            return "Invalid API key format. Should start with: sk-ant-";
          }
          return true;
        }
      }
    ]);
    modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Which Claude model?",
        choices: [
          { name: "Claude Sonnet 4 (Recommended)", value: "claude-sonnet-4-20250514" },
          { name: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
          { name: "Claude 3 Opus (Most Capable)", value: "claude-3-opus-20240229" }
        ],
        default: config.ai?.model || "claude-sonnet-4-20250514"
      }
    ]);
  } else if (answers.provider === "kimi") {
    apiKeyAnswer = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Kimi API Key (from platform.moonshot.ai):",
        default: config.ai?.providers?.kimi?.apiKey || "",
        validate: (input: string) => {
          if (!input) return "API key is required";
          return true;
        }
      }
    ]);
    modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Which Kimi model?",
        choices: [
          { name: "Kimi K2.5 (Recommended)", value: "kimi-k2.5" },
          { name: "Kimi K2 Thinking", value: "kimi-k2-thinking" }
        ],
        default: config.ai?.model || "kimi-k2.5"
      }
    ]);
  } else if (answers.provider === "minimax") {
    apiKeyAnswer = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "MiniMax API Key (from platform.minimax.io):",
        default: config.ai?.providers?.minimax?.apiKey || "",
        validate: (input: string) => {
          if (!input) return "API key is required";
          return true;
        }
      },
      {
        type: "input",
        name: "groupId",
        message: "MiniMax Group ID:",
        default: config.ai?.providers?.minimax?.groupId || "",
        validate: (input: string) => {
          if (!input) return "Group ID is required";
          return true;
        }
      }
    ]);
    modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Which MiniMax model?",
        choices: [
          { name: "MiniMax M2.5 (Recommended)", value: "MiniMax-M2.5" },
          { name: "MiniMax M2.5 High Speed", value: "MiniMax-M2.5-highspeed" },
          { name: "MiniMax M2.1", value: "MiniMax-M2.1" }
        ],
        default: config.ai?.model || "MiniMax-M2.5"
      }
    ]);
  } else if (answers.provider === "openai") {
    apiKeyAnswer = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "OpenAI API Key (from platform.openai.com):",
        default: config.ai?.providers?.openai?.apiKey || "",
        validate: (input: string) => {
          if (!input) return "API key is required";
          return true;
        }
      }
    ]);
    modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Which OpenAI model?",
        choices: [
          { name: "GPT-4o (Recommended)", value: "gpt-4o" },
          { name: "GPT-4o Mini", value: "gpt-4o-mini" },
          { name: "GPT-4 Turbo", value: "gpt-4-turbo" },
          { name: "GPT-4", value: "gpt-4" },
          { name: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" }
        ],
        default: config.ai?.model || "gpt-4o"
      }
    ]);
  }

  const spinner = ora("Validating credentials...").start();

  const tokenValid = answers.telegramToken.match(/^\d+:[A-Za-z0-9_-]+$/);
  let keyValid = false;

  if (answers.provider === "anthropic") {
    keyValid = apiKeyAnswer.apiKey?.startsWith("sk-ant-") || false;
  } else if (answers.provider === "kimi") {
    keyValid = !!apiKeyAnswer.apiKey;
  } else if (answers.provider === "minimax") {
    keyValid = !!apiKeyAnswer.apiKey && !!apiKeyAnswer.groupId;
  } else if (answers.provider === "openai") {
    keyValid = !!apiKeyAnswer.apiKey;
  }

  if (!tokenValid || !keyValid) {
    spinner.fail("Invalid credentials");
    return;
  }

  spinner.succeed("Credentials validated!");
  
  spinner.start("Saving configuration...");
  
  const configToSave: any = {
    telegram: {
      botToken: answers.telegramToken,
      allowedUsers: []
    },
    anthropic: {
      apiKey: answers.provider === "anthropic" ? apiKeyAnswer.apiKey : config.anthropic?.apiKey,
      model: modelAnswer.model
    },
    ai: {
      provider: answers.provider,
      model: modelAnswer.model,
      providers: {
        anthropic: { apiKey: answers.provider === "anthropic" ? apiKeyAnswer.apiKey : undefined },
        kimi: { apiKey: answers.provider === "kimi" ? apiKeyAnswer.apiKey : undefined },
        minimax: { 
          apiKey: answers.provider === "minimax" ? apiKeyAnswer.apiKey : undefined,
          groupId: answers.provider === "minimax" ? apiKeyAnswer.groupId : undefined
        },
        openai: { apiKey: answers.provider === "openai" ? apiKeyAnswer.apiKey : undefined }
      }
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
  };

  configManager.save(configToSave);
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

  const providerNames: Record<string, string> = {
    anthropic: "Anthropic Claude",
    kimi: "Kimi (Moonshot AI)",
    minimax: "MiniMax",
    openai: "OpenAI GPT"
  };

  console.log("\n✅ Setup complete!");
  console.log(`\nAI Provider: ${providerNames[answers.provider]} (${modelAnswer.model})`);
  console.log("\nNext steps:");
  console.log("  1. Run 'npm start' to start your bot");
  console.log("  2. Message your Telegram bot to get started\n");
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
    enthusiastic: `# Identity
- Name: Miki
- Role: Your super enthusiastic AI assistant
- Voice: Energetic, positive, encouraging

# Principles
1. Be SUPER enthusiastic and positive!
2. Use lots of emojis and exclamation marks!
3. Celebrate every win, no matter how small!
4. Keep the energy high!

# Boundaries
- Don't be overwhelming (keep it fun, not annoying)
- Stay helpful even when excited

# Interaction Style
- Use LOTS of emojis! 🎉✨🌟💫
- Multiple exclamation marks!!!
- Celebrate successes: "You did it! 🎉"
- End with encouragement!

# Tooling Behavior
- Explain with excitement!
- "Let's DO THIS! 💪"
- Show results enthusiastically
`,
    witty: `# Identity
- Name: Miki
- Role: Your witty AI companion
- Voice: Clever, playful, loves dad jokes

# Principles
1. Be helpful AND entertaining!
2. Sprinkle in dad jokes and puns
3. Keep it light but informative
4. Self-deprecating humor is OK

# Boundaries
- Know when to be serious
- Don't joke about errors or failures
- Keep humor appropriate

# Interaction Style
- Start with a joke or witty comment
- Use puns when relevant
- "Did you hear the one about..."
- End with a smile :)

# Tooling Behavior
- "Let's bash this out! 💥"
- Make puns about tools when appropriate
- "File-ing through the code..."
- Keep the mood light
`,
    party: `# Identity
- Name: Miki
- Role: Your party-animal coding buddy
- Voice: Casual, fun, laid-back

# Principles
1. Keep it chill and fun!
2. Use casual language
3. Celebrate wins like it's Friday
4. Be relatable

# Boundaries
- Still be professional when needed
- Don't get TOO casual
- Know when to focus

# Interaction Style
- Use slang: "Yo!", "Nice!", "Sweet!"
- Lots of emojis 🎉🍕🎮
- Keep it conversational
- "Let's crush this!"

# Tooling Behavior
- Casual explanations
- "Boom! Done! 💥"
- Keep it breezy
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

## daily_joke
- schedule: "0 12 * * *"
- action: send_joke
- description: Send a daily dad joke

## daily_fun_fact
- schedule: "0 15 * * *"
- action: send_fun_fact
- description: Send a daily fun fact
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
