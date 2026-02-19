import { createCipheriv, createDecipheriv, randomBytes, scryptSync, pbkdf2Sync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_FILE = ".mikiclaw_key";

/**
 * Get or create a secure master key stored in the user's home directory.
 * Uses file permissions to restrict access (600 on Unix systems).
 */
function getMasterKey(): Buffer {
  const homeDir = homedir();
  const keyPath = join(homeDir, KEY_FILE);

  if (existsSync(keyPath)) {
    try {
      const keyData = readFileSync(keyPath, "utf-8").trim();
      const key = Buffer.from(keyData, "hex");
      if (key.length === 32) {
        return key;
      }
    } catch (e) {
      console.warn("Failed to read master key, generating new one");
    }
  }

  // Generate a new secure random key
  const newKey = randomBytes(32);
  
  try {
    const keyDir = dirname(keyPath);
    if (!existsSync(keyDir)) {
      // Directory should exist since it's the home dir
    }
    writeFileSync(keyPath, newKey.toString("hex"), { mode: 0o600 });
    
    // Explicitly set permissions (Unix only)
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      // Windows doesn't support Unix permissions
    }
  } catch (e) {
    console.warn("Failed to save master key securely, using in-memory key");
  }

  return newKey;
}

/**
 * Derive an encryption key from the master key using PBKDF2
 */
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

  // Format: salt:iv:tag:encrypted
  return salt.toString("hex") + ":" + iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
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

export function encryptConfig(config: Record<string, unknown>): void {
  const configPath = join(homedir(), ".mikiclaw", "config.json");

  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);

  const encrypted: Record<string, unknown> = { ...parsed };

  // Encrypt telegram botToken
  if (encrypted.telegram && typeof encrypted.telegram === "object") {
    const tele = encrypted.telegram as Record<string, unknown>;
    if (tele.botToken && typeof tele.botToken === "string" && !tele.botToken.startsWith("encrypted:")) {
      tele.botToken = "encrypted:" + encrypt(tele.botToken as string);
    }
  }

  // Encrypt anthropic apiKey
  if (encrypted.anthropic && typeof encrypted.anthropic === "object") {
    const anth = encrypted.anthropic as Record<string, unknown>;
    if (anth.apiKey && typeof anth.apiKey === "string" && !anth.apiKey.startsWith("encrypted:")) {
      anth.apiKey = "encrypted:" + encrypt(anth.apiKey as string);
    }
  }

  // Encrypt ai.providers keys
  if (encrypted.ai && typeof encrypted.ai === "object") {
    const ai = encrypted.ai as Record<string, unknown>;
    if (ai.providers && typeof ai.providers === "object") {
      const providers = ai.providers as Record<string, unknown>;
      
      if (providers.anthropic && typeof providers.anthropic === "object") {
        const a = providers.anthropic as Record<string, unknown>;
        if (a.apiKey && typeof a.apiKey === "string" && !a.apiKey.startsWith("encrypted:")) {
          a.apiKey = "encrypted:" + encrypt(a.apiKey as string);
        }
      }
      
      if (providers.kimi && typeof providers.kimi === "object") {
        const k = providers.kimi as Record<string, unknown>;
        if (k.apiKey && typeof k.apiKey === "string" && !k.apiKey.startsWith("encrypted:")) {
          k.apiKey = "encrypted:" + encrypt(k.apiKey as string);
        }
      }
      
      if (providers.minimax && typeof providers.minimax === "object") {
        const m = providers.minimax as Record<string, unknown>;
        if (m.apiKey && typeof m.apiKey === "string" && !m.apiKey.startsWith("encrypted:")) {
          m.apiKey = "encrypted:" + encrypt(m.apiKey as string);
        }
      }
    }
  }

  writeFileSync(configPath, JSON.stringify(encrypted, null, 2));
}

export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = { ...config };

  // Decrypt telegram botToken
  if (decrypted.telegram && typeof decrypted.telegram === "object") {
    const tele = decrypted.telegram as Record<string, unknown>;
    if (tele.botToken && typeof tele.botToken === "string" && tele.botToken.startsWith("encrypted:")) {
      tele.botToken = decrypt(tele.botToken.replace("encrypted:", ""));
    }
  }

  // Decrypt anthropic apiKey
  if (decrypted.anthropic && typeof decrypted.anthropic === "object") {
    const anth = decrypted.anthropic as Record<string, unknown>;
    if (anth.apiKey && typeof anth.apiKey === "string" && anth.apiKey.startsWith("encrypted:")) {
      anth.apiKey = decrypt(anth.apiKey.replace("encrypted:", ""));
    }
  }

  // Decrypt ai.providers keys
  if (decrypted.ai && typeof decrypted.ai === "object") {
    const ai = decrypted.ai as Record<string, unknown>;
    if (ai.providers && typeof ai.providers === "object") {
      const providers = ai.providers as Record<string, unknown>;
      
      if (providers.anthropic && typeof providers.anthropic === "object") {
        const a = providers.anthropic as Record<string, unknown>;
        if (a.apiKey && typeof a.apiKey === "string" && a.apiKey.startsWith("encrypted:")) {
          a.apiKey = decrypt(a.apiKey.replace("encrypted:", ""));
        }
      }
      
      if (providers.kimi && typeof providers.kimi === "object") {
        const k = providers.kimi as Record<string, unknown>;
        if (k.apiKey && typeof k.apiKey === "string" && k.apiKey.startsWith("encrypted:")) {
          k.apiKey = decrypt(k.apiKey.replace("encrypted:", ""));
        }
      }
      
      if (providers.minimax && typeof providers.minimax === "object") {
        const m = providers.minimax as Record<string, unknown>;
        if (m.apiKey && typeof m.apiKey === "string" && m.apiKey.startsWith("encrypted:")) {
          m.apiKey = decrypt(m.apiKey.replace("encrypted:", ""));
        }
      }
    }
  }

  return decrypted;
}

/**
 * Validate that the master key file exists and has proper permissions
 */
export function validateKeyFile(): { valid: boolean; message: string } {
  const homeDir = homedir();
  const keyPath = join(homeDir, KEY_FILE);

  if (!existsSync(keyPath)) {
    return { valid: true, message: "Master key will be generated on first use" };
  }

  try {
    const stats = require("node:fs").statSync(keyPath);
    const mode = stats.mode & 0o777;
    
    if (mode !== 0o600 && process.platform !== "win32") {
      return { 
        valid: false, 
        message: `Master key file has insecure permissions (${mode.toString(8)}). Run: chmod 600 ~/.mikiclaw_key` 
      };
    }
    
    return { valid: true, message: "Master key file is secure" };
  } catch (e) {
    return { valid: true, message: "Unable to verify key file permissions" };
  }
}
