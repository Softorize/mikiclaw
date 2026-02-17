import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const machineId = process.env.MACHINE_ID || process.env.HOSTNAME || "mikiclaw-default";
  return scryptSync(machineId, "mikiclaw-salt", 32);
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

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

  const sensitiveFields = ["botToken", "apiKey"];
  const encrypted: Record<string, unknown> = { ...parsed };

  for (const field of sensitiveFields) {
    if (field.includes(".")) {
      const parts = field.split(".");
      let obj = encrypted;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      const lastKey = parts[parts.length - 1];
      if (obj[lastKey] && typeof obj[lastKey] === "string") {
        obj[lastKey] = "encrypted:" + encrypt(obj[lastKey] as string);
      }
    } else {
      if (encrypted[field] && typeof encrypted[field] === "string") {
        (encrypted as Record<string, string>)[field] = "encrypted:" + encrypt(encrypted[field] as string);
      }
      if (encrypted.telegram && typeof encrypted.telegram === "object") {
        const tele = encrypted.telegram as Record<string, unknown>;
        if (tele.botToken && typeof tele.botToken === "string") {
          tele.botToken = "encrypted:" + encrypt(tele.botToken as string);
        }
      }
      if (encrypted.anthropic && typeof encrypted.anthropic === "object") {
        const anth = encrypted.anthropic as Record<string, unknown>;
        if (anth.apiKey && typeof anth.apiKey === "string") {
          anth.apiKey = "encrypted:" + encrypt(anth.apiKey as string);
        }
      }
    }
  }

  writeFileSync(configPath, JSON.stringify(encrypted, null, 2));
}

export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = { ...config };

  if (decrypted.telegram && typeof decrypted.telegram === "object") {
    const tele = decrypted.telegram as Record<string, unknown>;
    if (tele.botToken && typeof tele.botToken === "string" && tele.botToken.startsWith("encrypted:")) {
      tele.botToken = decrypt(tele.botToken.replace("encrypted:", ""));
    }
  }

  if (decrypted.anthropic && typeof decrypted.anthropic === "object") {
    const anth = decrypted.anthropic as Record<string, unknown>;
    if (anth.apiKey && typeof anth.apiKey === "string" && anth.apiKey.startsWith("encrypted:")) {
      anth.apiKey = decrypt(anth.apiKey.replace("encrypted:", ""));
    }
  }

  return decrypted;
}
