import  { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateProject } from "./validateProjects";

// Find all files in the projects directory
const allFiles = readdirSync("projects", {
  recursive: true,
  withFileTypes: true,
}).filter((f) => !f.name.startsWith("_"));

for (const file of allFiles) {
  if (!file.isFile() || !file.name.endsWith(".json")) continue;
  
  const fullPath = path.join(file.parentPath, file.name);
  const isValid = await validateProject(file)
}