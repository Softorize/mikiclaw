import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import JSON5 from "json5";
import { z } from "zod";
import { encryptConfig, decryptConfig, validateKeyFile } from "./encryption.js";
import { getMikiclawDir } from "../utils/paths.js";

const AIProviderSchema = z.enum(["anthropic", "kimi", "minimax", "openai", "local"]);

const ConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string().optional(),
    allowedUsers: z.array(z.string()).optional()
  ,
  ,
  ai: z.object({
    provider: AIProviderSchema.default("anthropic"),
    model: z.string().optional(),
    routing: z.object({
      enabled: z.boolean().default(true),
      strategy: z.enum(["quality-first", "speed-first", "cost-first", "balanced"]).default("balanced"),
      fallbackProviders: z.array(AIProviderSchema).default(["openai", "kimi", "minimax", "local"])
    }).optional(),
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
      }).optional(),
      local: z.object({
        baseUrl: z.string().default("http://localhost:8000/v1"),
        apiKey: z.string().default("not-needed")
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
    secret: z.string().optional(),
    maxPayloadBytes: z.number().default(1024 * 1024),
    rateLimitPerMinute: z.number().default(60),
    endpoints: z.array(z.object({
      path: z.string(),
      url: z.string(),
      method: z.enum(["GET", "POST"]).default("POST"),
      events: z.array(z.string()),
      secret: z.string().optional(),
      allowedIps: z.array(z.string()).optional()
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
  memory: z.object({
    perUserEntryCap: z.number().default(500),
    maxConnectedContextEntries: z.number().default(8),
    semanticMinSimilarity: z.number().default(0.75)
  }).optional(),
  automation: z.object({
    enabled: z.boolean().default(false),
    workflows: z.array(z.object({
      id: z.string(),
      enabled: z.boolean().default(true),
      trigger: z.object({
        type: z.enum(["webhook", "heartbeat"]),
        path: z.string().optional(),
        taskName: z.string().optional(),
        eventType: z.string().optional()
      }),
      condition: z.object({
        field: z.string().optional(),
        equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
        contains: z.string().optional()
      }).optional(),
      action: z.object({
        type: z.enum(["emit_webhook_event", "log", "memory"]),
        eventType: z.string().optional(),
        message: z.string().optional(),
        importance: z.number().optional()
      })
    })).default([])
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
  }).optional(),
  channels: z.object({
    default: z.enum(["telegram", "discord", "slack", "webchat"]).default("telegram"),
    enabled: z.array(z.string()).default(["telegram"])
  }).optional()
});

export type Config = z.infer<typeof ConfigSchema>;

class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor() {
    const mikiDir = getMikiclawDir();

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
        const parsed = JSON5.parse(raw) as unknown;

        if (parsed && typeof parsed === "object" && (parsed as any).security?.encryptCredentials) {
          const decrypted = decryptConfig(parsed as Record<string, unknown>);
          this.config = ConfigSchema.parse(decrypted);
        } else {
          this.config = ConfigSchema.parse(parsed);
        }
      } catch {
        console.warn("Failed to load config, using defaults");
        this.config = this.getDefaults();
      }
    } else {
      this.config = this.getDefaults();
    }

    return this.config;
  }

  save(config: Partial<Config>): void {
    const mergedConfig = this.mergeDeep(this.getDefaults(), config);
    const parsedConfig = ConfigSchema.parse(mergedConfig);
    this.config = parsedConfig;

    const serialized = parsedConfig.security?.encryptCredentials
      ? encryptConfig(parsedConfig as Record<string, unknown>)
      : parsedConfig;

    writeFileSync(this.configPath, JSON.stringify(serialized, null, 2), { mode: 0o600 });
  }

  getDefaults(): Config {
    const mikiDir = getMikiclawDir();
    return {
      telegram: {
        botToken: undefined,
        
      },
      ,
      ai: {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        routing: {
          enabled: true,
          strategy: "balanced",
          fallbackProviders: ["openai", "kimi", "minimax", "local"]
        },
        providers: {
          anthropic: { apiKey: undefined },
          kimi: { apiKey: undefined },
          minimax: { apiKey: undefined, groupId: undefined },
          openai: { apiKey: undefined },
          local: { baseUrl: "http://192.168.1.124:8888/v1", apiKey: "not-needed" }
        }
      },
      session: {
        mode: "main",
        maxContextMessages: 40
      },
      webhooks: {
        enabled: false,
        port: 18791,
        secret: undefined,
        maxPayloadBytes: 1024 * 1024,
        rateLimitPerMinute: 60,
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
        path: join(mikiDir, "workspace")
      },
      memory: {
        perUserEntryCap: 500,
        maxConnectedContextEntries: 8,
        semanticMinSimilarity: 0.75
      },
      automation: {
        enabled: false,
        workflows: []
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
      },
      channels: {
        default: "telegram",
        enabled: ["telegram"]
      }
    };
  }

  isConfigured(): boolean {
    const config = this.load();
    const provider = config.ai?.provider || "anthropic";

    if (!config.telegram?.botToken) {
      return false;
    }

    if (provider === "anthropic") {
      return !!config.ai?.providers?.anthropic?.apiKey;
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
    if (provider === "local") {
      return true;
    }
    return false;
  }

  getTelegramToken(): string | undefined {
    return this.load().telegram?.botToken;
  }

  getAnthropicKey(): string | undefined {
    return this.load().ai?.providers?.anthropic?.apiKey;
  }

  getAIProvider(): string {
    return this.load().ai?.provider || "anthropic";
  }

  getAIModel(): string {
    return this.load().ai?.model || "claude-sonnet-4-20250514";
  }

  getAIRoutingConfig() {
    const config = this.load();
    return config.ai?.routing || {
      enabled: true,
      strategy: "balanced" as const,
      fallbackProviders: ["openai", "kimi", "minimax", "local"]
    };
  }

  getMemoryConfig() {
    const config = this.load();
    return config.memory || {
      perUserEntryCap: 500,
      maxConnectedContextEntries: 8,
      semanticMinSimilarity: 0.75
    };
  }

  getAutomationConfig() {
    const config = this.load();
    return config.automation || {
      enabled: false,
      workflows: []
    };
  }

  getWorkspacePath(): string {
    return this.load().workspace?.path || join(getMikiclawDir(), "workspace");
  }

  update(updates: Partial<Config>): void {
    const current = this.load();
    this.save(this.mergeDeep(current, updates));
  }

  isCommandAllowed(command: string): boolean {
    const config = this.load();
    const policy = config.security?.toolPolicy || "allowlist-only";
    const blocked = config.security?.blockedCommands || [];
    const allowed = config.security?.allowedCommands || [];

    const normalizedCommand = this.normalizeCommand(command);
    if (!normalizedCommand) {
      return false;
    }

    for (const blockedCmd of blocked) {
      const normalizedBlocked = this.normalizeCommand(blockedCmd);
      if (normalizedBlocked && normalizedCommand.includes(normalizedBlocked)) {
        return false;
      }
    }

    if (this.isObfuscatedCommand(normalizedCommand)) {
      return false;
    }

    if (policy === "allowlist-only") {
      if (this.hasShellControlOperators(normalizedCommand)) {
        return false;
      }

      return allowed.some(allowedCmd => this.matchesAllowedCommand(normalizedCommand, allowedCmd));
    }

    return true;
  }

  private normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, " ").toLowerCase();
  }

  private hasShellControlOperators(command: string): boolean {
    return /(&&|\|\||;|\||\n|\r)/.test(command);
  }

  private matchesAllowedCommand(command: string, allowedCommand: string): boolean {
    const normalizedAllowed = this.normalizeCommand(allowedCommand);
    if (!normalizedAllowed) {
      return false;
    }

    const commandTokens = command.split(" ");
    const allowedTokens = normalizedAllowed.split(" ");

    if (commandTokens.length < allowedTokens.length) {
      return false;
    }

    for (let i = 0; i < allowedTokens.length; i++) {
      if (commandTokens[i] !== allowedTokens[i]) {
        return false;
      }
    }

    return true;
  }

  private isObfuscatedCommand(command: string): boolean {
    const normalized = command.toLowerCase();

    if (normalized.includes("base64 -d") || normalized.includes("base64 --decode")) {
      return true;
    }

    if (normalized.includes("eval $(") || normalized.includes("eval$(")) {
      return true;
    }

    if (normalized.includes("/dev/tcp/") || normalized.includes("nc -e") || normalized.includes("bash -i")) {
      return true;
    }

    if (normalized.includes("$(curl") || normalized.includes("$(wget") || normalized.includes("`curl") || normalized.includes("`wget")) {
      return true;
    }

    return false;
  }

  private mergeDeep<T>(target: T, source: Partial<T>): T {
    const output: Record<string, unknown> = { ...(target as Record<string, unknown>) };

    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (this.isPlainObject(value) && this.isPlainObject(output[key])) {
        output[key] = this.mergeDeep(output[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        output[key] = value;
      }
    }

    return output as T;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  validateEncryption(): { valid: boolean; message: string } {
    return validateKeyFile();
  }
}

export const configManager = new ConfigManager();
