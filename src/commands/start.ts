import { Telegraf } from "telegraf";
import ora from "ora";
import { configManager } from "../config/manager.js";
import { messageHandler } from "../bot/handlers.js";
import { HeartbeatEngine } from "../heartbeat/engine.js";
import { healthServer } from "../bot/health.js";
import { logger } from "../utils/logger.js";

export async function startBot() {
  logger.info("Starting mikiclaw");
  
  const spinner = ora("Starting mikiclaw...").start();

  if (!configManager.isConfigured()) {
    spinner.fail("Not configured. Run 'npm run setup' first!");
    process.exit(1);
  }

  const token = configManager.getTelegramToken();
  if (!token) {
    spinner.fail("No Telegram token configured");
    process.exit(1);
  }

  const bot = new Telegraf(token);
  
  bot.use(async (ctx, next) => {
    const start = Date.now();
    try {
      await next();
      const responseTime = Date.now() - start;
      logger.info("Request processed", { 
        userId: ctx.from?.id, 
        username: ctx.from?.username,
        responseTime 
      });
    } catch (error) {
      logger.error("Request failed", { 
        userId: ctx.from?.id, 
        error: String(error) 
      });
      throw error;
    }
  });

  bot.command("start", (ctx) => {
    ctx.reply("🦞 Hi! I'm Miki, your personal AI assistant.\n\nSend me a message and I'll help you out!");
  });

  bot.command("help", (ctx) => {
    ctx.reply(`🦞 *Miki - Your AI Assistant*

*Commands:*
/start - Start the bot
/help - Show this help
/status - Check system status
/skills - List installed skills
/health - Health check

*Just send me a message and I'll help!*
`, { parse_mode: "Markdown" });
  });

  bot.command("status", async (ctx) => {
    const config = configManager.load();
    const provider = config.ai?.provider || "anthropic";
    const providerNames: Record<string, string> = {
      anthropic: "Anthropic Claude",
      kimi: "Kimi (Moonshot AI)",
      minimax: "MiniMax"
    };
    
    ctx.reply(`*System Status*

✅ Telegram: Connected
✅ AI: ${providerNames[provider]} configured
📡 Model: ${config.ai?.model || "claude-sonnet-4-20250514"}
❤️ Heartbeat: ${config.heartbeat?.enabled ? "Enabled" : "Disabled"}
🔒 Security: ${config.security?.toolPolicy || "block-destructive"}
⏱️ Rate Limit: ${config.rateLimit?.enabled ? "Enabled" : "Disabled"}
🔐 Encryption: ${config.security?.encryptCredentials ? "Enabled" : "Disabled"}

📁 Workspace: ${configManager.getWorkspacePath()}
📝 Log: ${logger.getLogPath()}
`, { parse_mode: "Markdown" });
  });

  bot.command("health", async (ctx) => {
    try {
      const response = await fetch("http://localhost:18790/health");
      const health = await response.json() as any;
      
      ctx.reply(`*Health Check*

Status: ${health.status === "healthy" ? "✅ Healthy" : "⚠️ Degraded"}
Uptime: ${health.uptime}s

*Checks:*
- Config: ${health.checks.config.status}
- Telegram: ${health.checks.telegram.status}
- Anthropic: ${health.checks.anthropic.status}
- Workspace: ${health.checks.workspace.status}
`, { parse_mode: "Markdown" });
    } catch {
      ctx.reply("⚠️ Health server not running");
    }
  });

  bot.on("message", messageHandler);

  spinner.succeed("Bot initialized!");

  const heartbeatEnabled = configManager.load().heartbeat?.enabled;
  let heartbeatEngine: HeartbeatEngine | undefined;

  if (heartbeatEnabled) {
    spinner.start("Starting heartbeat...");
    heartbeatEngine = new HeartbeatEngine(bot);
    heartbeatEngine.start();
    spinner.succeed("Heartbeat started!");
  }

  spinner.start("Starting health server...");
  healthServer.start();
  spinner.succeed("Health server started on port 18790");

  spinner.start("Connecting to Telegram...");
  
  try {
    await bot.launch();
    spinner.succeed("🤖 Bot is running! Press Ctrl+C to stop");
    
    logger.info("mikiclaw started successfully");
    console.log("\n🦞 mikiclaw is now running!");
    console.log("Message your bot to get started.");
    console.log("Health check: http://localhost:18790/health\n");
  } catch (error) {
    logger.error("Failed to start bot", { error: String(error) });
    spinner.fail(`Failed to start: ${error}`);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    console.log("\n\nShutting down gracefully...");
    
    bot.stop(signal);
    heartbeatEngine?.stop();
    healthServer.stop();
    logger.close();
    
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
