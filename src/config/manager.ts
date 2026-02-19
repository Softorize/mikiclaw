import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import JSON5 from "json5";
import { z } from "zod";
import { encrypt, decrypt, encryptConfig, decryptConfig, validateKeyFile } from "./encryption.js";

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
    provider: z.enum(["anthropic", "kimi", "minimax", "openai"]).default("anthropic"),
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
      }).optional(),
      openai: z.object({
        apiKey: z.string().optional()
      }).optional()
    }).optional()
  }).optional(),
  session: z.object({
    mode: z.enum(["main", "per-peer", "per-channel", "per-account-channel"]).default("main"),
    maxContextMessages: z.number().default(40)
  }).optional(),
  webhooks: z.object({
    enabled: z.boolean().default(false),
    port: z.number().default(18791),
    endpoints: z.array(z.object({
      path: z.string(),
      url: z.string(),
      method: z.enum(["GET", "POST"]).default("POST"),
      events: z.array(z.string())
    })).optional()
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
    toolPolicy: z.enum(["allow-all", "block-destructive", "allowlist-only"]).default("allowlist-only"),
    allowedCommands: z.array(z.string()).default(() => ["git status", "git log", "git diff", "ls", "cat", "head", "tail", "grep", "find", "pwd", "echo", "node -e", "npm run", "tsc"]),
    blockedCommands: z.array(z.string()).default(() => ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd", "> /dev/sda", "chmod -R 777", "chown -R root", "sudo rm", "pkill -9", "kill -9 1"])
  }).optional(),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequestsPerMinute: z.number().default(20)
  }).optional(),
  discord: z.object({
    botToken: z.string().optional(),
    allowedGuilds: z.array(z.string()).optional(),
    allowedChannels: z.array(z.string()).optional()
  }).optional(),
  slack: z.object({
    appToken: z.string().optional(),
    botToken: z.string().optional(),
    signingSecret: z.string().optional(),
    allowedChannels: z.array(z.string()).optional()
  }).optional(),
  webchat: z.object({
    enabled: z.boolean().default(true),
    port: z.number().default(18791),
    bindAddress: z.string().default("127.0.0.1")
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
          minimax: { apiKey: undefined, groupId: undefined },
          openai: { apiKey: undefined }
        }
      },
      session: {
        mode: "main",
        maxContextMessages: 40
      },
      webhooks: {
        enabled: false,
        port: 18791,
        endpoints: []
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
        toolPolicy: "allowlist-only",
        allowedCommands: ["git status", "git log", "git diff", "ls", "cat", "head", "tail", "grep", "find", "pwd", "echo", "node -e", "npm run", "tsc"],
        blockedCommands: ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd", "> /dev/sda", "chmod -R 777", "chown -R root", "sudo rm", "pkill -9", "kill -9 1"]
      },
      rateLimit: {
        enabled: true,
        maxRequestsPerMinute: 20
      },
      discord: {
        botToken: undefined,
        allowedGuilds: undefined,
        allowedChannels: undefined
      },
      slack: {
        appToken: undefined,
        botToken: undefined,
        signingSecret: undefined,
        allowedChannels: undefined
      },
      webchat: {
        enabled: true,
        port: 18791,
        bindAddress: "127.0.0.1"
      }
    };
  }

  isConfigured(): boolean {
    const config = this.load();
    const provider = config.ai?.provider || "anthropic";

    // Check Telegram token
    if (!config.telegram?.botToken) {
      return false;
    }

    // Check AI provider key
    if (provider === "anthropic") {
      return !!(config.anthropic?.apiKey || config.ai?.providers?.anthropic?.apiKey);
    }
    if (provider === "kimi") {
      return !!config.ai?.providers?.kimi?.apiKey;
    }
    if (provider === "minimax") {
      return !!(config.ai?.providers?.minimax?.apiKey && config.ai?.providers?.minimax?.groupId);
    }
    if (provider === "openai") {
      return !!config.ai?.providers?.openai?.apiKey;
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
    const policy = config.security?.toolPolicy || "allowlist-only";
    const blocked = config.security?.blockedCommands || [];
    const allowed = config.security?.allowedCommands || [];

    // Normalize command for comparison
    const normalizedCommand = command.trim().toLowerCase();

    // Always check blocked commands first (defense in depth)
    for (const blockedCmd of blocked) {
      if (normalizedCommand.includes(blockedCmd.toLowerCase())) {
        return false;
      }
    }

    // Check for obfuscation attempts (base64, encoded commands)
    if (this.isObfuscatedCommand(command)) {
      return false;
    }

    if (policy === "allowlist-only") {
      // For allowlist, check if command starts with or contains an allowed pattern
      return allowed.some(allowedCmd => {
        const normalizedAllowed = allowedCmd.toLowerCase();
        return normalizedCommand.startsWith(normalizedAllowed) ||
               normalizedCommand.includes(normalizedAllowed);
      });
    }

    // For block-destructive and allow-all, command passed blocked check
    return true;
  }

  private isObfuscatedCommand(command: string): boolean {
    const normalized = command.toLowerCase();

    // Check for base64 encoded commands
    if (normalized.includes("base64 -d") || normalized.includes("base64 --decode")) {
      return true;
    }

    // Check for eval with encoded content
    if (normalized.includes("eval $(") || normalized.includes("eval$(")) {
      return true;
    }

    // Check for reverse shell patterns
    if (normalized.includes("/dev/tcp/") || normalized.includes("nc -e") || normalized.includes("bash -i")) {
      return true;
    }

    // Check for command substitution in dangerous contexts
    if (normalized.includes("$(curl") || normalized.includes("$(wget") ||
        normalized.includes("`curl") || normalized.includes("`wget")) {
      return true;
    }

    return false;
  }

  validateEncryption(): { valid: boolean; message: string } {
    return validateKeyFile();
  }
}

export const configManager = new ConfigManager();
