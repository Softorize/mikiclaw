import { Telegraf } from "telegraf";
import ora from "ora";
import { configManager } from "../config/manager.js";
import { messageHandler } from "../bot/handlers.js";
import { HeartbeatEngine } from "../heartbeat/engine.js";

export async function startBot() {
  const spinner = ora("Starting mikiclaw...").start();

  if (!configManager.isConfigured()) {
    spinner.fail("Not configured. Run 'mikiclaw setup' first!");
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
    await next();
    const responseTime = Date.now() - start;
    console.log(`[${ctx.from?.username || ctx.from?.id}] Response time: ${responseTime}ms`);
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

*Just send me a message and I'll help!*
`, { parse_mode: "Markdown" });
  });

  bot.command("status", async (ctx) => {
    const config = configManager.load();
    ctx.reply(`*System Status*

Telegram: ✅ Connected
Anthropic: ✅ Configured
Model: ${config.anthropic?.model || "claude-sonnet-4-20250514"}
Heartbeat: ${config.heartbeat?.enabled ? "✅ Enabled" : "❌ Disabled"}
`, { parse_mode: "Markdown" });
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

  spinner.start("Connecting to Telegram...");
  
  try {
    await bot.launch();
    spinner.succeed("🤖 Bot is running! Press Ctrl+C to stop");
    
    console.log("\n🦞 mikiclaw is now running!");
    console.log("Message your bot to get started.\n");
  } catch (error) {
    spinner.fail(`Failed to start: ${error}`);
    process.exit(1);
  }

  process.once("SIGINT", () => {
    console.log("\n\nShutting down...");
    bot.stop("SIGINT");
    heartbeatEngine?.stop();
    process.exit(0);
  });

  process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
    heartbeatEngine?.stop();
    process.exit(0);
  });
}
