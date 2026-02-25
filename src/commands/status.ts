import ora from 'ora';
import { configManager } from '../config/manager.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export async function showStatus() {
  const spinner = ora('Checking status...').start();

  const config = configManager.load();
  const workspacePath = configManager.getWorkspacePath();

  const checks = {
    config: configManager.isConfigured(),
    telegram: !!config.telegram?.botToken,
    anthropic: !!config.ai?.providers?.anthropic?.apiKey,
    workspace: existsSync(workspacePath),
    skills: existsSync(join(workspacePath, '..', 'skills')),
  };

  spinner.stop();

  console.log('\n🦞 mikiclaw Status\n');
  console.log(`Configuration: ${checks.config ? '✅ Configured' : '⚠️  Run setup'}`);
  console.log(`Telegram Bot:  ${checks.telegram ? '✅ Token set' : '❌ Missing'}`);
  console.log(`Anthropic:     ${checks.anthropic ? '✅ API key set' : '❌ Missing'}`);
  console.log(`Workspace:     ${checks.workspace ? '✅ Exists' : '❌ Missing'}`);
  console.log(`\n📁 Paths:`);
  console.log(`   Config: ${configManager.getConfigPath()}`);
  console.log(`   Workspace: ${workspacePath}`);

  if (checks.workspace) {
    const soulPath = join(workspacePath, 'SOUL.md');
    if (existsSync(soulPath)) {
      console.log(`\n👤 Personality: SOUL.md loaded`);
    }

    const convDir = join(workspacePath, 'conversations');
    if (existsSync(convDir)) {
      const convs = readdirSync(convDir).filter(f => f.endsWith('.json'));
      console.log(`💬 Conversations: ${convs.length} users`);
    }
  }

  console.log(`\n⚙️  Settings:`);
  console.log(`   Model: ${config.ai?.model || 'claude-sonnet-4-20250514'}`);
  console.log(`   Heartbeat: ${config.heartbeat?.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  if (config.heartbeat?.enabled) {
    console.log(`   Heartbeat Interval: ${config.heartbeat?.intervalMinutes || 30}min`);
  }

  console.log('');
}
