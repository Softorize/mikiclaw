import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import JSON5 from "json5";
import { z } from "zod";
import { encrypt, decrypt, encryptConfig, decryptConfig } from "./encryption.js";

const ConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string().optional(),
    allowedUsers: z.array(z.string()).optional()
  }).optional(),
  anthropic: z.object({
    apiKey: z.string().optional(),
    model: z.string().default("claude-sonnet-4-20250514")
  }).optional(),
  ai: z.object({
    provider: z.enum(["anthropic", "kimi", "minimax"]).default("anthropic"),
    model: z.string().optional(),
    providers: z.object({
      anthropic: z.object({
        apiKey: z.string().optional()
      }).optional(),
      kimi: z.object({
        apiKey: z.string().optional()
      }).optional(),
      minimax: z.object({
        apiKey: z.string().optional(),
        groupId: z.string().optional()
      }).optional()
    }).optional()
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
  }).optional(),
  security: z.object({
    encryptCredentials: z.boolean().default(true),
    toolPolicy: z.enum(["allow-all", "block-destructive", "allowlist-only"]).default("block-destructive"),
    allowedCommands: z.array(z.string()).optional(),
    blockedCommands: z.array(z.string()).default(() => ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd"])
  }).optional(),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequestsPerMinute: z.number().default(20)
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
        const parsed = JSON5.parse(raw);
        
        if (parsed.security?.encryptCredentials) {
          const decrypted = decryptConfig(parsed as any);
          this.config = ConfigSchema.parse(decrypted);
        } else {
          this.config = ConfigSchema.parse(parsed);
        }
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
    
    let toSave: any = { ...config };
    if (config.security?.encryptCredentials) {
      toSave = encryptConfig(toSave);
    }
    
    writeFileSync(this.configPath, JSON.stringify(toSave, null, 2));
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
      ai: {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        providers: {
          anthropic: { apiKey: undefined },
          kimi: { apiKey: undefined },
          minimax: { apiKey: undefined, groupId: undefined }
        }
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
      },
      security: {
        encryptCredentials: true,
        toolPolicy: "block-destructive",
        allowedCommands: undefined,
        blockedCommands: ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd"]
      },
      rateLimit: {
        enabled: true,
        maxRequestsPerMinute: 20
      }
    };
  }

  isConfigured(): boolean {
    const config = this.load();
    const provider = config.ai?.provider || "anthropic";
    
    if (provider === "anthropic") {
      return !!(config.telegram?.botToken && config.anthropic?.apiKey);
    }
    if (provider === "kimi") {
      return !!(config.telegram?.botToken && config.ai?.providers?.kimi?.apiKey);
    }
    if (provider === "minimax") {
      return !!(config.telegram?.botToken && config.ai?.providers?.minimax?.apiKey && config.ai?.providers?.minimax?.groupId);
    }
    return false;
  }

  getTelegramToken(): string | undefined {
    return this.load().telegram?.botToken;
  }

  getAnthropicKey(): string | undefined {
    return this.load().anthropic?.apiKey;
  }

  getAIProvider(): string {
    return this.load().ai?.provider || "anthropic";
  }

  getAIModel(): string {
    return this.load().ai?.model || "claude-sonnet-4-20250514";
  }

  getWorkspacePath(): string {
    return this.load().workspace?.path || join(homedir(), ".mikiclaw", "workspace");
  }

  update(updates: Partial<Config>): void {
    const current = this.load();
    this.save({ ...current, ...updates });
  }

  isCommandAllowed(command: string): boolean {
    const config = this.load();
    const policy = config.security?.toolPolicy || "block-destructive";
    const blocked = config.security?.blockedCommands || [];
    const allowed = config.security?.allowedCommands;

    if (policy === "allowlist-only" && allowed) {
      return allowed.some(cmd => command.includes(cmd));
    }

    if (policy === "block-destructive" || policy === "allow-all") {
      return !blocked.some(cmd => command.includes(cmd));
    }

    return true;
  }
}

export const configManager = new ConfigManager();
