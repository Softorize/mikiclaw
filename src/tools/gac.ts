import { execa } from "execa";
import { logger } from "../utils/logger.js";

interface GacAccount {
  ID: string;
  DisplayName: string;
  CreateTime?: string;
  UpdateTime?: string;
}

interface GacProperty {
  ID: string;
  DisplayName: string;
  AccountID: string;
  TimeZone?: string;
  CurrencyCode?: string;
  IndustryCategory?: string;
  ServiceLevel?: string;
  CreateTime?: string;
  UpdateTime?: string;
}

function buildExtendedPath(): string {
  const home = process.env.HOME || "";
  return [
    process.env.PATH || "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    home ? `${home}/go/bin` : "",
    home ? `${home}/.local/bin` : "",
    home ? `${home}/.npm-global/bin` : ""
  ].filter(Boolean).join(":");
}

async function resolveGacBinary(): Promise<string | null> {
  const home = process.env.HOME || "";
  const candidates = [
    process.env.GAC_BIN,
    home ? `${home}/go/bin/gac` : undefined,
    "gac"
  ].filter((value): value is string => !!value);

  const env = { ...process.env, PATH: buildExtendedPath() };
  for (const candidate of candidates) {
    try {
      await execa(candidate, ["version"], {
        env,
        timeout: 10000,
        stdio: "pipe"
      });
      return candidate;
    } catch {
      // Continue trying candidate paths.
    }
  }

  return null;
}

async function runGacJson<T>(binary: string, args: string[]): Promise<T | null> {
  const env = { ...process.env, PATH: buildExtendedPath() };
  const { stdout } = await execa(binary, [...args, "--json"], {
    env,
    timeout: 30000,
    stdio: "pipe"
  });

  const raw = stdout.trim();
  if (!raw || raw === "null") {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error("Failed to parse gac JSON output", { args, raw: raw.slice(0, 500), error: String(error) });
    throw new Error("Failed to parse gac JSON output");
  }
}

function formatPropertyRow(property: GacProperty, accountName: string): string {
  const timezone = property.TimeZone || "unknown tz";
  const currency = property.CurrencyCode || "unknown currency";
  return `- ${property.DisplayName} (property ${property.ID}) - account: ${accountName} (${property.AccountID}), ${timezone}, ${currency}`;
}

export async function gacListAccounts(): Promise<string> {
  const binary = await resolveGacBinary();
  if (!binary) {
    return "⛔ gac CLI not found. Install it or set GAC_BIN path.";
  }

  try {
    const accounts = (await runGacJson<GacAccount[]>(binary, ["accounts", "list"])) || [];
    if (accounts.length === 0) {
      return "No Google Analytics accounts found.";
    }

    const lines = accounts.map((account) => `- ${account.DisplayName} (${account.ID})`);
    return `📊 Google Analytics accounts (${accounts.length}):\n${lines.join("\n")}`;
  } catch (error) {
    return `Error listing GA accounts: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function gacListProperties(accountId?: string): Promise<string> {
  const binary = await resolveGacBinary();
  if (!binary) {
    return "⛔ gac CLI not found. Install it or set GAC_BIN path.";
  }

  try {
    const accounts = (await runGacJson<GacAccount[]>(binary, ["accounts", "list"])) || [];
    if (accounts.length === 0) {
      return "No Google Analytics accounts found.";
    }

    const scopedAccounts = accountId
      ? accounts.filter((account) => account.ID === accountId)
      : accounts;

    if (scopedAccounts.length === 0) {
      return `No account found with ID ${accountId}.`;
    }

    const accountNameById = new Map(scopedAccounts.map((account) => [account.ID, account.DisplayName]));
    const allProperties: GacProperty[] = [];
    const emptyAccounts: GacAccount[] = [];
    const accountErrors: Array<{ account: GacAccount; error: string }> = [];

    for (const account of scopedAccounts) {
      try {
        const properties = (await runGacJson<GacProperty[]>(binary, ["properties", "list", "--account", account.ID])) || [];
        if (properties.length === 0) {
          emptyAccounts.push(account);
        } else {
          allProperties.push(...properties);
        }
      } catch (error) {
        accountErrors.push({
          account,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    if (allProperties.length === 0 && accountErrors.length === 0) {
      return `Checked ${scopedAccounts.length} account(s). No properties found.`;
    }

    const lines: string[] = [];
    lines.push(`📈 GA properties found: ${allProperties.length} across ${scopedAccounts.length} account(s).`);

    if (allProperties.length > 0) {
      const sorted = [...allProperties].sort((a, b) => {
        const byAccount = (a.AccountID || "").localeCompare(b.AccountID || "");
        if (byAccount !== 0) return byAccount;
        return (a.DisplayName || "").localeCompare(b.DisplayName || "");
      });

      for (const property of sorted) {
        const accountName = accountNameById.get(property.AccountID) || "Unknown account";
        lines.push(formatPropertyRow(property, accountName));
      }
    }

    if (emptyAccounts.length > 0) {
      lines.push("");
      lines.push(`Accounts with no properties (${emptyAccounts.length}):`);
      for (const account of emptyAccounts) {
        lines.push(`- ${account.DisplayName} (${account.ID})`);
      }
    }

    if (accountErrors.length > 0) {
      lines.push("");
      lines.push(`Accounts with query errors (${accountErrors.length}):`);
      for (const entry of accountErrors) {
        lines.push(`- ${entry.account.DisplayName} (${entry.account.ID}): ${entry.error}`);
      }
    }

    return lines.join("\n");
  } catch (error) {
    return `Error listing GA properties: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

