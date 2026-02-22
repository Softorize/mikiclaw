import { homedir } from "node:os";
import { join } from "node:path";

export function getMikiclawDir(): string {
  const override = process.env.MIKICLAW_HOME?.trim();
  if (override) {
    return override;
  }

  return join(homedir(), ".mikiclaw");
}

export function getMikiclawKeyPath(): string {
  const override = process.env.MIKICLAW_KEY_PATH?.trim();
  if (override) {
    return override;
  }

  return join(homedir(), ".mikiclaw_key");
}
