import { Telegraf } from 'telegraf';
import ora from 'ora';
import { configManager } from '../config/manager.js';
import { messageHandler, voiceHandler } from '../bot/handlers.js';
import { HeartbeatEngine } from '../heartbeat/engine.js';
import { healthServer } from '../bot/health.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../session/manager.js';
import { webhookServer } from '../webhooks/server.js';
import { accessControl } from '../security/access_control.js';
import { getRandomDadJoke, getRandomTechJoke, getRandomFunFact } from '../personality/fun.js';
import { observabilityStore } from '../observability/metrics.js';

export async function startBot() {
  logger.info('Starting mikiclaw');

  const spinner = ora('Starting mikiclaw...').start();
  let heartbeatEngine: HeartbeatEngine | undefined;
  const startupConfig = configManager.load();
  const webhookPort = startupConfig.webhooks?.port || 19091;
  const healthPort = webhookPort > 19000 ? webhookPort - 1 : 19090;
  const healthBindAddress = startupConfig.webchat?.bindAddress || '127.0.0.1';

  if (!configManager.isConfigured()) {
    spinner.fail("Not configured. Run 'npm run setup' first!");
    process.exit(1);
  }

  const token = configManager.getTelegramToken();
  if (!token) {
    spinner.fail('No Telegram token configured');
    process.exit(1);
  }

  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    const start = Date.now();
    try {
      if (ctx.chat?.id && heartbeatEngine) {
        heartbeatEngine.trackInteraction(ctx.chat.id);
      }
      await next();
      const responseTime = Date.now() - start;
      logger.info('Request processed', {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        responseTime,
      });
    } catch (error) {
      logger.error('Request failed', {
        userId: ctx.from?.id,
        error: String(error),
      });
      throw error;
    }
  });

  bot.command('start', ctx => {
    ctx.reply(
      "🦞 Hi! I'm Miki, your personal AI assistant.\n\nSend me a message and I'll help you out!"
    );
  });

  bot.command('help', ctx => {
    ctx.reply(
      `🦞 *Miki - Your AI Assistant*

*Commands:*
/start - Start the bot
/help - Show this help
/status - Check system status
/skills - List installed skills
/health - Health check
/metrics - Runtime metrics snapshot
/session - Show session info
/joke - Get a random joke
/fact - Get a random fun fact
/grant_access - Allow AppleScript machine control in this chat
/revoke_access - Disable AppleScript machine control
/access_status - Show current machine-control permission
/approvals - Show pending risky actions
/approve [id] - Approve latest/specific risky action
/deny [id] - Deny latest/specific risky action

*Just send me a message and I'll help!*
`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async ctx => {
    const config = configManager.load();
    const provider = config.ai?.provider || 'anthropic';
    const providerNames: Record<string, string> = {
      anthropic: 'Anthropic Claude',
      kimi: 'Kimi (Moonshot AI)',
      minimax: 'MiniMax',
      openai: 'OpenAI GPT',
    };

    ctx.reply(
      `*System Status*

✅ Telegram: Connected
✅ AI: ${providerNames[provider]} configured
📡 Model: ${config.ai?.model || 'claude-sonnet-4-20250514'}
❤️ Heartbeat: ${config.heartbeat?.enabled ? 'Enabled' : 'Disabled'}
🔒 Security: ${config.security?.toolPolicy || 'block-destructive'}
⏱️ Rate Limit: ${config.rateLimit?.enabled ? 'Enabled' : 'Disabled'}
🔐 Encryption: ${config.security?.encryptCredentials ? 'Enabled' : 'Disabled'}
📊 Session Mode: ${config.session?.mode || 'main'}

📁 Workspace: ${configManager.getWorkspacePath()}
📝 Log: ${logger.getLogPath()}
`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('health', async ctx => {
    try {
      const response = await fetch(`http://${healthBindAddress}:${healthPort}/health`);
      const health = (await response.json()) as any;

      ctx.reply(
        `*Health Check*

Status: ${health.status === 'healthy' ? '✅ Healthy' : '⚠️ Degraded'}
Uptime: ${health.uptime}s

*Checks:*
- Config: ${health.checks.config.status}
- Telegram: ${health.checks.telegram.status}
- Anthropic: ${health.checks.anthropic.status}
- Workspace: ${health.checks.workspace.status}
`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      ctx.reply('⚠️ Health server not running');
    }
  });

  bot.command('session', async ctx => {
    const sessions = sessionManager.listSessions();
    const session = sessionManager.getOrCreateSession(
      ctx.chat?.id || 0,
      String(ctx.from?.id),
      ctx.from?.username,
      'telegram'
    );

    ctx.reply(
      `*Session Info*

Mode: ${session.mode}
Messages: ${session.messageCount}
Created: ${new Date(session.createdAt).toLocaleString()}
Last Active: ${new Date(session.lastActive).toLocaleString()}

*All Sessions:*
${sessions
  .slice(0, 5)
  .map(s => `- ${s.id}: ${s.messageCount} messages`)
  .join('\n')}
`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('metrics', async ctx => {
    const snapshot = observabilityStore.getSnapshot();
    const totals = snapshot.totals;
    await ctx.reply(
      `*Runtime Metrics*

- Uptime: ${snapshot.uptimeSeconds}s
- Active requests: ${snapshot.activeRequests}
- Requests total: ${totals.requests}
- Failures: ${totals.failures}
- Est. input tokens: ${totals.estimatedInputTokens}
- Est. output tokens: ${totals.estimatedOutputTokens}
- Est. cost: $${totals.estimatedCostUsd}
`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('joke', async ctx => {
    const isTech = Math.random() < 0.5;
    const joke = isTech ? getRandomTechJoke() : getRandomDadJoke();
    await ctx.reply(`😂 *${isTech ? 'Tech' : 'Dad'} Joke*\n\n${joke}`, { parse_mode: 'Markdown' });
  });

  bot.command('fact', async ctx => {
    const fact = getRandomFunFact();
    await ctx.reply(`💡 *Did You Know?*\n\n${fact}`, { parse_mode: 'Markdown' });
  });

  bot.command('grant_access', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not grant access: missing chat/user context.');
      return;
    }

    accessControl.grantAppleScript(userId, chatId);
    await ctx.reply(
      '✅ Machine control granted for this chat. I can now run AppleScript actions when you ask.'
    );
  });

  bot.command('revoke_access', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not revoke access: missing chat/user context.');
      return;
    }

    accessControl.revokeAppleScript(userId, chatId);
    await ctx.reply('🔒 Machine control revoked for this chat.');
  });

  bot.command('access_status', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not read access status: missing chat/user context.');
      return;
    }

    const granted = accessControl.hasAppleScriptAccess(userId, chatId);
    const grantedAt = accessControl.getAppleScriptGrantTime(userId, chatId);
    if (!granted || !grantedAt) {
      await ctx.reply(
        '🔒 Machine control is not granted in this chat. Send /grant_access to enable.'
      );
      return;
    }

    await ctx.reply(
      `✅ Machine control is granted.\nGranted at: ${new Date(grantedAt).toLocaleString()}`
    );
  });

  bot.command('approvals', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not read approvals: missing chat/user context.');
      return;
    }

    const pending = accessControl.listPendingToolApprovals(userId, chatId);
    if (pending.length === 0) {
      await ctx.reply('✅ No pending risky actions.');
      return;
    }

    const lines = pending
      .slice(0, 10)
      .map(request => `- \`${request.id}\` | ${request.toolName} | ${request.summary}`);

    await ctx.reply(
      `⏳ *Pending Approvals*\n\n${lines.join('\n')}\n\nUse \`/approve <id>\` or \`/deny <id>\`.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('approve', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not approve action: missing chat/user context.');
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const approvalId = text.split(/\s+/)[1];
    const approved = accessControl.approveToolApproval(userId, chatId, approvalId);
    if (!approved) {
      await ctx.reply('⚠️ No matching pending approval found.');
      return;
    }

    await ctx.reply(`✅ Approved \`${approved.id}\` for ${approved.toolName}.`, {
      parse_mode: 'Markdown',
    });
  });

  bot.command('deny', async ctx => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : '';
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not deny action: missing chat/user context.');
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const approvalId = text.split(/\s+/)[1];
    const denied = accessControl.denyToolApproval(userId, chatId, approvalId);
    if (!denied) {
      await ctx.reply('⚠️ No matching pending approval found.');
      return;
    }

    await ctx.reply(`🛑 Denied \`${denied.id}\` for ${denied.toolName}.`, {
      parse_mode: 'Markdown',
    });
  });

  bot.on('voice', voiceHandler);
  bot.on('message', messageHandler);

  spinner.succeed('Bot initialized!');

  const heartbeatEnabled = configManager.load().heartbeat?.enabled;

  if (heartbeatEnabled) {
    spinner.start('Starting heartbeat...');
    heartbeatEngine = new HeartbeatEngine(bot);
    heartbeatEngine.start();
    spinner.succeed('Heartbeat started!');
  }

  spinner.start('Starting health server...');
  healthServer.start({ port: healthPort, bindAddress: healthBindAddress });
  spinner.succeed(`Health server started on port ${healthPort}`);

  spinner.start('Starting webhook server...');
  webhookServer.start();
  spinner.succeed('Webhook server started!');

  spinner.start('Connecting to Telegram...');

  try {
    await bot.launch();
    spinner.succeed('🤖 Bot is running! Press Ctrl+C to stop');

    logger.info('mikiclaw started successfully');
    console.log('\n🦞 mikiclaw is now running!');
    console.log('Message your bot to get started.');
    console.log(`Health check: http://${healthBindAddress}:${healthPort}/health\n`);
  } catch (error) {
    logger.error('Failed to start bot', { error: String(error) });
    spinner.fail(`Failed to start: ${error}`);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info('Shutting down', { signal });
    console.log('\n\nShutting down gracefully...');

    bot.stop(signal);
    heartbeatEngine?.stop();
    healthServer.stop();
    webhookServer.stop();

    // Close browser if open
    const { closeBrowser } = await import('../tools/browser_search.js');
    await closeBrowser();
    const { closeBrowserSession } = await import('../tools/browser_session.js');
    await closeBrowserSession();

    logger.close();

    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
