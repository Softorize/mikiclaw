import { Telegraf } from "telegraf";
import { Cron } from "croner";
import { loadHeartbeatConfig } from "../personality/soul.js";
import { configManager } from "../config/manager.js";

interface HeartbeatTask {
  name: string;
  schedule: string;
  action: string;
  description?: string;
}

export class HeartbeatEngine {
  private bot: Telegraf;
  private jobs: Cron[] = [];
  private lastInteraction: Map<number, Date> = new Map();
  private timezone: string;

  constructor(bot: Telegraf) {
    this.bot = bot;
    // Use system timezone or default to UTC
    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  start(): void {
    const config = configManager.load();
    const interval = config.heartbeat?.intervalMinutes || 30;

    const idleJob = new Cron(`*/${interval} * * * *`, {
      timezone: this.timezone
    }, () => {
      this.checkIdleUsers();
    });
    this.jobs.push(idleJob);

    const heartbeatConfig = loadHeartbeatConfig();
    const tasks = this.parseHeartbeatConfig(heartbeatConfig);

    tasks.forEach(task => {
      try {
        const job = new Cron(task.schedule, {
          timezone: this.timezone
        }, () => {
          this.runTask(task);
        });
        this.jobs.push(job);
        console.log(`📅 Scheduled task: ${task.name} (${task.schedule}) [${this.timezone}]`);
      } catch (e) {
        console.warn(`Failed to schedule task ${task.name}: ${e}`);
      }
    });

    console.log(`❤️ Heartbeat engine started with ${this.jobs.length} jobs (timezone: ${this.timezone})`);
  }

  stop(): void {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log("❤️ Heartbeat engine stopped");
  }

  trackInteraction(chatId: number): void {
    this.lastInteraction.set(chatId, new Date());
  }

  private checkIdleUsers(): void {
    const now = new Date();
    const interval = configManager.load().heartbeat?.intervalMinutes || 30;
    const threshold = new Date(now.getTime() - interval * 60 * 1000);

    this.lastInteraction.forEach((lastTime, chatId) => {
      if (lastTime < threshold) {
        this.sendIdleMessage(chatId);
      }
    });
  }

  private async sendIdleMessage(chatId: number): Promise<void> {
    const messages = [
      "Hey! Haven't heard from you in a while. Everything okay?",
      "👋 Hi! I'm still here if you need anything.",
      "Quick check-in - any tasks I can help with?"
    ];
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    try {
      await this.bot.telegram.sendMessage(chatId, message);
    } catch (e) {
      console.warn(`Failed to send idle message to ${chatId}`);
    }
  }

  private async runTask(task: HeartbeatTask): Promise<void> {
    console.log(`📋 Running scheduled task: ${task.name}`);

    switch (task.action) {
      case "summarize_conversations":
        await this.summarizeConversations();
        break;
      case "suggest_skills":
        await this.suggestSkills();
        break;
      case "send_status":
        await this.sendStatusReport();
        break;
      default:
        console.warn(`Unknown action: ${task.action}`);
    }
  }

  private parseHeartbeatConfig(config: string): HeartbeatTask[] {
    const tasks: HeartbeatTask[] = [];
    const taskBlocks = config.split(/^## /m).filter(Boolean);

    taskBlocks.forEach(block => {
      const lines = block.split("\n");
      const name = lines[0].trim();
      
      const scheduleMatch = block.match(/- schedule:\s*"([^"]+)"/);
      const actionMatch = block.match(/- action:\s*(\w+)/);
      
      if (scheduleMatch && actionMatch) {
        tasks.push({
          name,
          schedule: scheduleMatch[1],
          action: actionMatch[1]
        });
      }
    });

    return tasks;
  }

  private async summarizeConversations(): Promise<void> {
    console.log("📝 Summarizing conversations...");
  }

  private async suggestSkills(): Promise<void> {
    console.log("💡 Suggesting skills...");
  }

  private async sendStatusReport(): Promise<void> {
    console.log("📊 Sending status report...");
  }
}
