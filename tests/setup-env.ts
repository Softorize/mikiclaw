import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll } from "vitest";

const testRoot = mkdtempSync(join(tmpdir(), "mikiclaw-test-"));
mkdirSync(testRoot, { recursive: true });

process.env.MIKICLAW_HOME = testRoot;
process.env.MIKICLAW_KEY_PATH = join(testRoot, ".mikiclaw_key");

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});
