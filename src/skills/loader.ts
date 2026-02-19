import { configManager } from "../config/manager.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCommand } from "../utils/validation.js";

interface SkillManifest {
  name: string;
  version: string;
  description: string;
  tools?: Array<{
    name: string;
    description: string;
    command: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

class SkillsLoader {
  private loadedSkills: Map<string, SkillManifest> = new Map();

  loadSkills(): void {
    const skillsDir = join(configManager.getWorkspacePath(), "..", "skills");

    if (!existsSync(skillsDir)) {
      return;
    }

    const skillDirs = readdirSync(skillsDir).filter(f => {
      const stat = require("node:fs").statSync(join(skillsDir, f));
      return stat.isDirectory();
    });

    for (const dir of skillDirs) {
      const manifestPath = join(skillsDir, dir, "claw.json");

      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as SkillManifest;

          // Validate skill manifest
          if (!manifest.name || !manifest.version) {
            console.warn(`⚠️  Skipping skill ${dir}: missing required fields`);
            continue;
          }

          // Validate tools in manifest
          if (manifest.tools) {
            for (const tool of manifest.tools) {
              if (!tool.name || !tool.command) {
                console.warn(`⚠️  Skipping tool ${tool.name} in skill ${dir}: missing required fields`);
                continue;
              }

              // Validate command for security
              const cmdValidation = validateCommand(tool.command);
              if (!cmdValidation.valid) {
                console.warn(`⚠️  Skipping tool ${tool.name} in skill ${dir}: ${cmdValidation.error}`);
                continue;
              }
            }
          }

          this.loadedSkills.set(manifest.name, manifest);
          console.log(`📦 Loaded skill: ${manifest.name}`);
        } catch (e) {
          console.warn(`Failed to load skill ${dir}:`, e);
        }
      }
    }
  }

  getSkillTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }> = [];

    for (const [skillName, manifest] of this.loadedSkills.entries()) {
      if (manifest.tools) {
        for (const tool of manifest.tools) {
          tools.push({
            name: `${skillName}_${tool.name}`,
            description: `[${skillName}] ${tool.description}`,
            input_schema: tool.inputSchema || {
              type: "object",
              properties: {
                input: { type: "string", description: "Input for the tool" }
              },
              required: ["input"]
            }
          });
        }
      }
    }

    return tools;
  }

  async executeSkillTool(skillName: string, toolName: string, input: Record<string, unknown>): Promise<string> {
    const manifest = this.loadedSkills.get(skillName);
    if (!manifest) {
      return `Error: Skill '${skillName}' not found`;
    }

    const tool = manifest.tools?.find(t => t.name === toolName);
    if (!tool) {
      return `Error: Tool '${toolName}' not found in skill '${skillName}'`;
    }

    // Security: Validate the command before execution
    const cmdValidation = validateCommand(tool.command);
    if (!cmdValidation.valid) {
      return `⛔ Tool command blocked: ${cmdValidation.error}`;
    }

    // Security: Check if command is allowed by policy
    const fullCommand = tool.command + " " + JSON.stringify(input);
    if (!configManager.isCommandAllowed(fullCommand)) {
      return "⛔ This command has been blocked for safety.";
    }

    try {
      const { execa } = await import("execa");

      // Security: Pass input as environment variable or stdin instead of command line
      // This prevents command injection through crafted input
      const { stdout, stderr } = await execa(tool.command, {
        input: JSON.stringify(input),
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          SKILL_INPUT: JSON.stringify(input)
        }
      });
      return stdout || stderr || "(no output)";
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  getLoadedSkills(): SkillManifest[] {
    return Array.from(this.loadedSkills.values());
  }
}

export const skillsLoader = new SkillsLoader();
