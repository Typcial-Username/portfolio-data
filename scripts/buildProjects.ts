import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateProject } from "./validateProjects";
import YAML from "yaml";

const PROJECT_DIR = "projects";
const DIST_DIR = "dist";
const OUTPUT_FILE = "dist/projects.json";

const projects: any[] = [];
const ids = new Set<string>();

// Find all files in the projects directory
const allFiles = readdirSync(PROJECT_DIR, {
  recursive: true,
  withFileTypes: true,
}).filter((f) => !f.name.startsWith("_"));

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

  const validated = await validateProject(parsed);

  if (ids.has(validated.id)) {
    console.error(`❌ Duplicate project id: "${validated.id}"`);
    process.exit(1);
  }

  if (validated.repo) ids.add(validated.id);
  projects.push(validated);
}

for (const group of chunk<string>(toArr<string>(ids), 20)) {
  const query = buildRepoQuery(group);
  await fetchGitHubStats(query);
}

mkdirSync(DIST_DIR, { recursive: true });

writeFileSync(OUTPUT_FILE, JSON.stringify({ projects }, null, 2));

console.log(`✅ Built ${projects.length} projects → ${OUTPUT_FILE}`);

async function fetchGitHubStats(query: string) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const json = await res.json();
  return json.data;
}

function buildRepoQuery(repos: string[]) {
  let query = "";

  const fields = repos.map((repo, i) => {
    const [owner, name] = repo.split("/");

    query += `
      repo${i}: repository(owner: "${owner}", name: "${name}") {
        name
        description
        url
        homepageUrl
        pushedAt
        stargazerCount

        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }

        languages(first: 5) {
          totalSize
          edges {
            size
            node { name color }
          }
        }
      }\n
    `;
  });

  return `query { ${fields} }`;
}

function normalizeLanguages(languages: Record<string, number>) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);

  const percentages: Record<string, number> = {};

  for (const [lang, bytes] of Object.entries(languages)) {
    percentages[lang] = Math.round((bytes / total) * 100);
  }

  return percentages;
}

function chunk<T>(arr: T[], size: number) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function toArr<T>(set: Set<T>) {
  let arr = [];
  for (const item of set.keys()) {
    arr.push(item);
  }

  return arr;
}
