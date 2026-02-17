import ora from "ora";
import { configManager } from "../config/manager.js";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ClawHubSkill {
  name: string;
  description: string;
  downloads: number;
  stars: number;
  author: string;
}

class SkillsRegistry {
  private getSkillsDir(): string {
    const homeDir = require("node:os").homedir();
    return join(homeDir, ".mikiclaw", "skills");
  }

  async list(): Promise<void> {
    const skillsDir = this.getSkillsDir();

    if (!existsSync(skillsDir)) {
      console.log("No skills installed yet.");
      console.log("Run 'mikiclaw skills install <name>' to install a skill.");
      return;
    }

    const skills = readdirSync(skillsDir).filter(f => 
      !f.startsWith(".") && f !== "node_modules"
    );

    if (skills.length === 0) {
      console.log("No skills installed.");
      return;
    }

    console.log(`\n🦞 Installed Skills (${skills.length}):\n`);
    skills.forEach(skill => {
      const skillPath = join(skillsDir, skill);
      const manifestPath = join(skillPath, "claw.json");
      
      let description = "";
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          description = manifest.description || "";
        } catch {}
      }
      
      console.log(`  • ${skill}`);
      if (description) {
        console.log(`    ${description}`);
      }
    });
    console.log("");
  }

  async install(skillName: string): Promise<void> {
    const spinner = ora(`Installing ${skillName}...`).start();
    const skillsDir = this.getSkillsDir();

    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    try {
      const response = await fetch(`https://clawhub.ai/api/skills/${skillName}`);
      
      if (!response.ok) {
        spinner.fail(`Skill '${skillName}' not found on ClawHub`);
        return;
      }

      const skillData = await response.json() as any;
      
      const skillPath = join(skillsDir, skillName);
      if (!existsSync(skillPath)) {
        mkdirSync(skillPath, { recursive: true });
      }

      const manifest = {
        name: skillData.name,
        version: skillData.version || "1.0.0",
        description: skillData.description,
        author: skillData.author,
        downloads: skillData.downloads,
        stars: skillData.stars
      };

      writeFileSync(
        join(skillPath, "claw.json"),
        JSON.stringify(manifest, null, 2)
      );

      if (skillData.readme) {
        writeFileSync(join(skillPath, "README.md"), skillData.readme);
      }

      spinner.succeed(`Installed ${skillName}!`);
      console.log("\nSkill installed successfully.");
      console.log("Restart the bot to use the new skill.");
    } catch (error) {
      spinner.fail(`Failed to install: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async search(query: string): Promise<void> {
    const spinner = ora(`Searching for '${query}'...`).start();

    try {
      const response = await fetch(`https://clawhub.ai/api/skills/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        spinner.fail("Search failed");
        return;
      }

      const results = await response.json() as ClawHubSkill[];
      
      spinner.stop();

      if (results.length === 0) {
        console.log(`No skills found for '${query}'`);
        return;
      }

      console.log(`\n🔍 Found ${results.length} skills:\n`);
      results.slice(0, 10).forEach(skill => {
        console.log(`  • ${skill.name}`);
        console.log(`    ${skill.description?.slice(0, 60)}...`);
        console.log(`    ⬇️ ${skill.downloads} ⭐ ${skill.stars}`);
        console.log("");
      });
    } catch (error) {
      spinner.fail(`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const skillsRegistry = new SkillsRegistry();
