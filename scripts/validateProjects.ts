import fs, { readFileSync } from "node:fs";
import { ProjectSchema } from "../schema/projects.schema";
import { treeifyError } from "zod";
import path from "node:path";

export function validateAllProjects() {
  const allFiles = fs.readdirSync("projects", {
  recursive: true,
  withFileTypes: true,
}).filter((f) => !f.name.startsWith("_"));

  for (const file of allFiles) {
    validateProject(file)
  }
}

export async function validateProject(file: fs.Dirent): Promise<boolean> {
  if (!file.isFile() || !(file.name.endsWith(".json") || file.name.endsWith(".yaml"))) throw new Error(`File ${file.name} not valid`);

  const fullPath = path.join(file.parentPath, file.name);
  const raw = readFileSync(fullPath, "utf8");

  let parsed;
  if (file.name.endsWith("json")) {
    parsed = JSON.parse(raw)
  } else {
    console.log("yaml")
  }

  const result = ProjectSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Schema validation failed:\n");
    console.error(treeifyError(result.error));
    return false
  }

  const project = result.data;
  if (project.repo) {
    await validateRepo(project.repo)
  }

  return true
}

async function validateRepo(repo: string) {
    const res = await fetch(`https://api.github.com/repos/${repo}`);

    if (res.status === 404) {
      console.error(`❌ Repo not found ${repo}`);
      process.exit(1);
    }

    console.log(`✅ ${repo} Repo exists!`);
}

validateAllProjects()
console.log("Assignments schema valid ✔");
