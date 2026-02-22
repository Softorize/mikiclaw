import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { getMikiclawKeyPath } from "../utils/paths.js";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

function getMasterKey(): Buffer {
  const keyPath = getMikiclawKeyPath();

  if (existsSync(keyPath)) {
    try {
      const keyData = readFileSync(keyPath, "utf-8").trim();
      const key = Buffer.from(keyData, "hex");
      if (key.length === 32) {
        return key;
      }
    } catch {
      console.warn("Failed to read master key, generating new one");
    }
  }

  const newKey = randomBytes(32);

  try {
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, newKey.toString("hex"), { mode: 0o600 });

    try {
      chmodSync(keyPath, 0o600);
    } catch {
      // Windows can ignore chmod semantics
    }
  } catch {
    console.warn("Failed to save master key securely, using in-memory key");
  }

  return newKey;
}

function deriveKey(salt: Buffer): Buffer {
  const masterKey = getMasterKey();
  return pbkdf2Sync(masterKey, salt, 100000, 32, "sha256");
}

export function encrypt(text: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();
  return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");

  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const salt = Buffer.from(parts[0], "hex");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const encrypted = parts[3];

  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const encrypted = structuredClone(config);

  const telegram = encrypted.telegram as Record<string, unknown> | undefined;
  if (telegram?.botToken && typeof telegram.botToken === "string" && !telegram.botToken.startsWith("encrypted:")) {
    telegram.botToken = `encrypted:${encrypt(telegram.botToken)}`;
  }

  const anthropic = encrypted.anthropic as Record<string, unknown> | undefined;
  if (anthropic?.apiKey && typeof anthropic.apiKey === "string" && !anthropic.apiKey.startsWith("encrypted:")) {
    anthropic.apiKey = `encrypted:${encrypt(anthropic.apiKey)}`;
  }

  const ai = encrypted.ai as Record<string, unknown> | undefined;
  const providers = ai?.providers as Record<string, unknown> | undefined;

  const encryptProviderKey = (providerName: string): void => {
    const provider = providers?.[providerName] as Record<string, unknown> | undefined;
    if (provider?.apiKey && typeof provider.apiKey === "string" && !provider.apiKey.startsWith("encrypted:")) {
      provider.apiKey = `encrypted:${encrypt(provider.apiKey)}`;
    }
  };

  encryptProviderKey("anthropic");
  encryptProviderKey("kimi");
  encryptProviderKey("minimax");
  encryptProviderKey("openai");

  const slack = encrypted.slack as Record<string, unknown> | undefined;
  if (slack?.appToken && typeof slack.appToken === "string" && !slack.appToken.startsWith("encrypted:")) {
    slack.appToken = `encrypted:${encrypt(slack.appToken)}`;
  }
  if (slack?.botToken && typeof slack.botToken === "string" && !slack.botToken.startsWith("encrypted:")) {
    slack.botToken = `encrypted:${encrypt(slack.botToken)}`;
  }
  if (slack?.signingSecret && typeof slack.signingSecret === "string" && !slack.signingSecret.startsWith("encrypted:")) {
    slack.signingSecret = `encrypted:${encrypt(slack.signingSecret)}`;
  }

  const discord = encrypted.discord as Record<string, unknown> | undefined;
  if (discord?.botToken && typeof discord.botToken === "string" && !discord.botToken.startsWith("encrypted:")) {
    discord.botToken = `encrypted:${encrypt(discord.botToken)}`;
  }

  return encrypted;
}

export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = structuredClone(config);

  const decryptIfNeeded = (container: Record<string, unknown> | undefined, key: string): void => {
    if (!container) {
      return;
    }
    const value = container?.[key];
    if (typeof value === "string" && value.startsWith("encrypted:")) {
      container[key] = decrypt(value.slice("encrypted:".length));
    }
  };

  const telegram = decrypted.telegram as Record<string, unknown> | undefined;
  decryptIfNeeded(telegram, "botToken");

  const anthropic = decrypted.anthropic as Record<string, unknown> | undefined;
  decryptIfNeeded(anthropic, "apiKey");

  const ai = decrypted.ai as Record<string, unknown> | undefined;
  const providers = ai?.providers as Record<string, unknown> | undefined;
  decryptIfNeeded(providers?.anthropic as Record<string, unknown> | undefined, "apiKey");
  decryptIfNeeded(providers?.kimi as Record<string, unknown> | undefined, "apiKey");
  decryptIfNeeded(providers?.minimax as Record<string, unknown> | undefined, "apiKey");
  decryptIfNeeded(providers?.openai as Record<string, unknown> | undefined, "apiKey");

  const slack = decrypted.slack as Record<string, unknown> | undefined;
  decryptIfNeeded(slack, "appToken");
  decryptIfNeeded(slack, "botToken");
  decryptIfNeeded(slack, "signingSecret");

  const discord = decrypted.discord as Record<string, unknown> | undefined;
  decryptIfNeeded(discord, "botToken");

  return decrypted;
}

export function validateKeyFile(): { valid: boolean; message: string } {
  const keyPath = getMikiclawKeyPath();

  if (!existsSync(keyPath)) {
    return { valid: true, message: "Master key will be generated on first use" };
  }

  try {
    const stats = statSync(keyPath);
    const mode = stats.mode & 0o777;

    if (mode !== 0o600 && process.platform !== "win32") {
      return {
        valid: false,
        message: `Master key file has insecure permissions (${mode.toString(8)}). Run: chmod 600 ${keyPath}`
      };
    }

    return { valid: true, message: "Master key file is secure" };
  } catch {
    return { valid: true, message: "Unable to verify key file permissions" };
  }
}
