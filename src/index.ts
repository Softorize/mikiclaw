#!/usr/bin/env node

import { parseArgs } from "node:util";
import { configManager } from "./config/manager.js";
import { setupWizard } from "./commands/setup.js";
import { startBot } from "./commands/start.js";
import { showStatus } from "./commands/status.js";
import ora from "ora";

const commands = {
  setup: "Run interactive setup wizard",
  start: "Start the mikiclaw bot",
  status: "Show bot status",
  "skills:list": "List installed skills",
  "skills:install": "Install a skill from ClawHub",
  config: "Edit configuration"
};

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false }
    }
  });

  if (values.version) {
    console.log("mikiclaw v1.0.0");
    return;
  }

  const command = positionals[0] || "status";
  const subcommand = positionals[1];

  const spinner = ora();

  try {
    switch (command) {
      case "setup":
        await setupWizard();
        break;
      case "start":
        await startBot();
        break;
      case "status":
        await showStatus();
        break;
      case "skills":
        if (subcommand === "list") {
          const { skillsRegistry } = await import("./skills/registry.js");
          await skillsRegistry.list();
        } else if (subcommand === "install" && positionals[2]) {
          const { skillsRegistry } = await import("./skills/registry.js");
          await skillsRegistry.install(positionals[2]);
        } else {
          console.log("Usage: mikiclaw skills <list|install <name>>");
        }
        break;
      case "config":
        console.log("Config location:", configManager.getConfigPath());
        break;
      default:
        console.log("mikiclaw - Your personal AI assistant");
        console.log("\nCommands:");
        Object.entries(commands).forEach(([cmd, desc]) => {
          console.log(`  ${cmd.padEnd(16)} - ${desc}`);
        });
        console.log("\nRun 'mikiclaw setup' to get started!");
    }
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
