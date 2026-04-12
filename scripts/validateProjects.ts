import { readFileSync, readdirSync, existsSync } from "node:fs";
import { Project, ProjectSchema } from "../schema/projects.schema";
import { treeifyError } from "zod";
import path from "node:path";
import YAML from "yaml";

const PROJECT_ROOT = path.resolve("projects");

export function validateAllProjects() {
  const allFiles = readdirSync("projects", {
    recursive: true,
    withFileTypes: true,
  }).filter(
    (f) =>
      !f.name.startsWith("_") &&
      [".json", ".yaml", ".yml"].includes(path.extname(f.name)),
  );

  console.log(`Validating ${allFiles.length} projects...`);

  for (const file of allFiles) {
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

    validateProject(parsed);
  }

  console.log("Projects schema valid ✔");
}

export async function validateProject(project: Project) {
  let result;

  try {
    result = ProjectSchema.parse(project);
  } catch (err) {
    console.error("Schema validation failed:\n");
    console.error(err);
    process.exit(1);
  }

  // -- Validate files exist -- //
  if (result.files?.cad) {
    for (const cadFile of result.files.cad) {
      const filePath = findFile(
        cadFile,
        `${PROJECT_ROOT}\\${project.id}\\files`,
      );

      if (!filePath) return;

      const fullPath = path.resolve(filePath);

      if (!existsSync(fullPath)) {
        throw new Error(`CAD file ${cadFile} not found.`);
      }
    }
  }

  if (result.files?.stl) {
    for (const stlFile of result.files.stl) {
      const filePath = findFile(
        stlFile,
        `${PROJECT_ROOT}\\${project.id}\\files`,
      );

      if (!filePath) return;

      const fullPath = path.resolve(filePath);

      if (!existsSync(fullPath)) {
        throw new Error(`STL file ${stlFile} not found.`);
      }
    }
  }

  if (result.media?.images) {
    for (const img of result.media.images) {
      const filePath = findFile(img, `${PROJECT_ROOT}\\${project.id}\\images`);

      if (!filePath) return;

      const fullPath = path.resolve(filePath);

      if (!existsSync(fullPath)) {
        throw new Error(`Image not found ${img}`);
      }
    }
  }

  if (result.media?.docs) {
    for (const doc of result.media.docs) {
      const filePath = findFile(doc, `${PROJECT_ROOT}\\${project.id}\\files`);

      if (!filePath) return;

      const fullPath = path.resolve(filePath);

      if (!existsSync(fullPath)) {
        throw new Error(`Document not found ${doc}`);
      }
    }
  }

  if (result.repo) {
    await validateRepo(result.repo);
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

function findFile(fileName: string, startingPath: string) {
  const fullStartingPath = path.resolve(startingPath);

  if (!existsSync(fullStartingPath))
    throw new Error(`${startingPath} does not exist`);

  const allFiles = readdirSync(startingPath, {
    recursive: true,
    withFileTypes: true,
  });

  for (const file of allFiles) {
    if (file.name == fileName) return file.parentPath + "\\" + file.name;
  }

  return null;
}

// if (import.meta.main) {
// console.log("Good");
validateAllProjects();
// }
