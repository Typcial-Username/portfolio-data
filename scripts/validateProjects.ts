import fs, { readFileSync } from "node:fs";
import { ProjectSchema } from "../schema/projects.schema";
import { treeifyError } from "zod";
import path from "node:path";

const allFiles = fs.readdirSync("projects", {
  recursive: true,
  withFileTypes: true,
});

const repos = new Set<string>();

for (const file of allFiles) {
  if (!file.isFile() || !file.name.endsWith(".json")) continue;
  const fullPath = path.join(file.parentPath, file.name);
  const raw = readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(raw);

  const result = ProjectSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Schema validation failed:\n");
    console.error(treeifyError(result.error));
    process.exit(1);
  }

  const project = result.data;
  if (project.repo) repos.add(project.repo);
}

async function validateRepos() {
  for (const repo of repos) {
    const res = await fetch(`https://api.github.com/repos/${repo}`);

    if (res.status === 404) {
      console.error(`❌ Repo not found ${repo}`);
      process.exit(1);
    }

    console.log(`✅ ${repo} Repo exists!`);
  }
}

await validateRepos();

console.log("Assignments schema valid ✔");
