import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import JSON5 from "json5";
import { z } from "zod";

const ConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string().optional(),
    allowedUsers: z.array(z.string()).optional()
  }).optional(),
  anthropic: z.object({
    apiKey: z.string().optional(),
    model: z.string().default("claude-sonnet-4-20250514")
  }).optional(),
  heartbeat: z.object({
    enabled: z.boolean().default(true),
    intervalMinutes: z.number().default(30)
  }).optional(),
  skills: z.object({
    autoUpdate: z.boolean().default(true)
  }).optional(),
  workspace: z.object({
    path: z.string().default("")
  }).optional()
});

export type Config = z.infer<typeof ConfigSchema>;

class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor() {
    const homeDir = homedir();
    const mikiDir = join(homeDir, ".mikiclaw");
    
    if (!existsSync(mikiDir)) {
      mkdirSync(mikiDir, { recursive: true });
    }
    
    this.configPath = join(mikiDir, "config.json");
  }

  getConfigPath(): string {
    return this.configPath;
  }

  load(): Config {
    if (this.config) return this.config;
    
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, "utf-8");
        this.config = ConfigSchema.parse(JSON5.parse(raw));
      } catch (e) {
        console.warn("Failed to load config, using defaults");
        this.config = this.getDefaults();
      }
    } else {
      this.config = this.getDefaults();
    }
    
    return this.config;
  }

  save(config: Config): void {
    this.config = config;
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  getDefaults(): Config {
    const homeDir = homedir();
    return {
      telegram: {
        botToken: undefined,
        allowedUsers: []
      },
      anthropic: {
        apiKey: undefined,
        model: "claude-sonnet-4-20250514"
      },
      heartbeat: {
        enabled: true,
        intervalMinutes: 30
      },
      skills: {
        autoUpdate: true
      },
      workspace: {
        path: join(homeDir, ".mikiclaw", "workspace")
      }
    };
  }

  isConfigured(): boolean {
    const config = this.load();
    return !!(config.telegram?.botToken && config.anthropic?.apiKey);
  }

  getTelegramToken(): string | undefined {
    return this.load().telegram?.botToken;
  }

  getAnthropicKey(): string | undefined {
    return this.load().anthropic?.apiKey;
  }

  getWorkspacePath(): string {
    return this.load().workspace?.path || join(homedir(), ".mikiclaw", "workspace");
  }

  update(updates: Partial<Config>): void {
    const current = this.load();
    this.save({ ...current, ...updates });
  }
}

export const configManager = new ConfigManager();
