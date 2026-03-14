import fs, { readFileSync } from "node:fs";
import { Project, ProjectSchema } from "../schema/projects.schema";
import { treeifyError } from "zod";
import path from "node:path";
import YAML from "yaml";

export async function validateAllProjects() {
  const allFiles = fs
    .readdirSync("projects", {
      recursive: true,
      withFileTypes: true,
    })
    .filter((f) => !f.name.startsWith("_"));

  for (const file of allFiles) {
    if (
      !file.isFile() ||
      ![".json", ".yaml", ".yml"].includes(path.extname(file.name))
    )
      continue;

    const fullPath = path.join(file.parentPath, file.name);
    const raw = readFileSync(fullPath, "utf8");

    let parsed;

    try {
      if (file.name.endsWith(".yaml")) {
        parsed = YAML.parse(raw);
      } else {
        parsed = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`❌ Failed to parse ${fullPath}`);
      throw err;
    }

    const isValid = !!(await validateProject(parsed));
  }

  console.log("Projects schema valid ✔");
}

export async function validateProject(project: Project) {
  const result = ProjectSchema.safeParse(project);

  if (!result.success) {
    console.error("Schema validation failed:\n");
    console.error(treeifyError(result.error));
    process.exit(1);
  }

  const res = result.data;
  if (project.repo) {
    await validateRepo(project.repo);
  }

  return project;
}

async function validateRepo(repo: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}`);

  if (res.status === 404) {
    console.error(`❌ Repo not found ${repo}`);
    process.exit(1);
  }

  console.log(`✅ ${repo} Repo exists!`);
}

await validateAllProjects();
